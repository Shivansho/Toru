import { Server as SocketIOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server as HttpServer } from 'http';
import { redisClient } from './redis';
import { getSessionUser } from './services/auth';
import { PrismaClient } from '@prisma/client';
import { ClientEventSchemas, ServerEvents } from '@shared/core';
import cookie from 'cookie';

const prisma = new PrismaClient();

// Configuration
const HEARTBEAT_TTL = 30; // seconds
const RATE_LIMIT_MAX = 50; // max events per 10 seconds
const RATE_LIMIT_WINDOW = 10; // seconds

export function setupSocketIO(httpServer: HttpServer) {
  const io = new SocketIOServer<any, ServerEvents, any, any>(httpServer, {
    cors: {
      origin: true,
      credentials: true
    }
  });

  // Create Redis adapter
  const pubClient = redisClient.duplicate();
  const subClient = redisClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  // Authentication Middleware
  io.use(async (socket, next) => {
    try {
      const cookies = cookie.parse(socket.request.headers.cookie || '');
      const sessionId = cookies.sessionId;

      if (!sessionId) {
        return next(new Error('Authentication error'));
      }

      const userId = await getSessionUser(sessionId);
      if (!userId) {
        return next(new Error('Authentication error'));
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { consents: true, profile: true }
      });

      if (!user) {
        return next(new Error('Authentication error'));
      }

      if (['BANNED', 'SUSPENDED', 'DELETED', 'GRADUATED'].includes(user.status)) {
        return next(new Error('Account sanctioned'));
      }

      if (!user.ageVerified || user.consents.length === 0) {
        return next(new Error('Incomplete onboarding'));
      }

      // Check one active connection
      const existingActive = await redisClient.get(`active_socket:${userId}`);
      if (existingActive && existingActive !== socket.id) {
        // We reject the new connection (the prompt says "a second tab is told the session is active elsewhere")
        return next(new Error('Session active elsewhere'));
      }

      (socket as any).userId = user.id;
      (socket as any).collegeId = user.collegeId;
      
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = (socket as any).userId;
    const collegeId = (socket as any).collegeId;

    // Join tenant room
    const room = `college:${collegeId}`;
    socket.join(room);

    // Track active connection
    await redisClient.set(`active_socket:${userId}`, socket.id, 'EX', HEARTBEAT_TTL);
    
    // Track presence
    await redisClient.sadd(`college:${collegeId}:online`, userId);
    
    // Broadcast updated count
    const count = await redisClient.scard(`college:${collegeId}:online`);
    io.to(room).emit('online-count', count);

    // Rate Limiting & Validation Middleware
    socket.use(async (packet, next) => {
      const [eventName, data] = packet;

      // Rate limit check
      const userKey = `ratelimit:user:${userId}`;
      const socketKey = `ratelimit:socket:${socket.id}`;

      const userReqs = await redisClient.incr(userKey);
      if (userReqs === 1) await redisClient.expire(userKey, RATE_LIMIT_WINDOW);
      
      const socketReqs = await redisClient.incr(socketKey);
      if (socketReqs === 1) await redisClient.expire(socketKey, RATE_LIMIT_WINDOW);

      if (userReqs > RATE_LIMIT_MAX || socketReqs > RATE_LIMIT_MAX) {
        socket.emit('error', { message: 'Rate limit exceeded', code: 'FLOODING' });
        socket.disconnect(true);
        return next(new Error('Rate limit exceeded'));
      }

      // Event Validation
      const schema = ClientEventSchemas[eventName as keyof typeof ClientEventSchemas];
      if (!schema) {
        // Unknown event -> ignore and count
        await redisClient.incr(`metrics:unknown_events:${userId}`);
        return next(new Error('Unknown event'));
      }

      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        return next(new Error('Invalid payload'));
      }

      // Replace data with validated data
      packet[1] = parsed.data;
      next();
    });

    socket.on('heartbeat', async () => {
      await redisClient.set(`active_socket:${userId}`, socket.id, 'EX', HEARTBEAT_TTL);
      await redisClient.sadd(`college:${collegeId}:online`, userId);
    });

    
    socket.on('match:search', async (data: { filter: any }) => {
      try {
        await joinQueue(collegeId, { userId, joiningYear: (socket as any).joiningYear, filter: data.filter, timestamp: Date.now() });
      } catch (e: any) {
        socket.emit('error', { message: e.message, code: 'MATCH_ERROR' });
      }
    });

    
    socket.on('match:leave', async () => {
      const sessionId = await redisClient.get(`active_session:${userId}`);
      if (sessionId) {
        await redisClient.del(`active_session:${userId}`);
        // Notify other user? We can query DB for other user.
        // Simplified for this phase, just emit ended to room or specific socket
        // In a real implementation we'd find the partner.
      }
    });

    
    socket.on('session:message', async (data: { body: string }) => {
      const sessionId = await redisClient.get(`active_session:${userId}`);
      if (!sessionId) return;
      
      const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
      if (!session || session.endedAt) {
        socket.emit('error', { message: 'Session ended', code: 'SESSION_ENDED' });
        return;
      }
      
      const modResult = await moderateMessage(data.body, collegeId, classifier);
      if (modResult.decision === 'reject') {
        socket.emit('error', { message: modResult.reasons[0], code: 'MOD_REJECT' });
        return;
      }

      const encrypted = encrypt(data.body);
      const msg = await prisma.sessionMessage.create({
        data: {
          sessionId,
          senderId: userId,
          body: encrypted
        }
      });

      const otherUserId = session.userAId === userId ? session.userBId : session.userAId;
      const otherSocket = await redisClient.get(`active_socket:${otherUserId}`);
      
      if (otherSocket) {
        io.to(otherSocket).emit('session:receive', {
          id: msg.id,
          body: data.body, // send raw body to client, DB gets encrypted
          createdAt: msg.createdAt.toISOString()
        });
      }
    });

    socket.on('session:typing', async (data: { isTyping: boolean }) => {
      const sessionId = await redisClient.get(`active_session:${userId}`);
      if (!sessionId) return;
      
      const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
      if (!session || session.endedAt) return;
      
      const otherUserId = session.userAId === userId ? session.userBId : session.userAId;
      const otherSocket = await redisClient.get(`active_socket:${otherUserId}`);
      
      if (otherSocket) {
        io.to(otherSocket).emit('session:typing', { isTyping: data.isTyping });
      }
    });
  
    socket.on('match:skip', async () => {
      const sessionId = await redisClient.get(`active_session:${userId}`);
      if (sessionId) {
        await redisClient.del(`active_session:${userId}`);
        // Re-join queue immediately
        try {
          await joinQueue(collegeId, { userId, joiningYear: (socket as any).joiningYear, filter: 'ANY', timestamp: Date.now() });
        } catch(e) {}
      }
    });

    socket.on('match:cancel', async () => {
      await leaveQueue(collegeId, userId);
    });

    
    socket.on('disconnect', async () => {
      await leaveQueue(collegeId, userId);
      
      const inSession = await redisClient.get(`active_session:${userId}`);
      if (inSession) {
        // Grace period
        setTimeout(async () => {
          const reconnected = await redisClient.get(`active_socket:${userId}`);
          if (!reconnected) {
             // Notify partner they left (stubbed)
             await redisClient.del(`active_session:${userId}`);
          }
        }, 15000);
      }
  
  
      const active = await redisClient.get(`active_socket:${userId}`);
      if (active === socket.id) {
        await redisClient.del(`active_socket:${userId}`);
        await redisClient.srem(`college:${collegeId}:online`, userId);
      }
      
      const updatedCount = await redisClient.scard(`college:${collegeId}:online`);
      io.to(room).emit('online-count', updatedCount);
    });
  });

  return io;
}
