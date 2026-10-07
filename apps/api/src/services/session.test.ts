import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as Client } from 'socket.io-client';
import { httpServer } from '../index';
import { PrismaClient } from '@prisma/client';
import { redisClient } from '../redis';
import { createSession } from '../services/auth';
import { decrypt } from '../crypto';

const prisma = new PrismaClient();

describe('1-on-1 Session Flow', () => {
  let port: number;
  let userA: any, userB: any, college: any;
  let sessionA: string, sessionB: string;
  let chatSessionId: string;

  beforeAll(async () => {
    if (!httpServer.listening) {
      await new Promise<void>(resolve => httpServer.listen(0, resolve));
    }
    port = (httpServer.address() as any).port;

    college = await prisma.college.create({
      data: { name: 'Chat College', domains: ['chat.c'], studentPattern: '.*', staffPattern: '.*', programmeLengths: {}, retentionSettings: {}, status: 'ACTIVE' }
    });

    userA = await prisma.user.create({
      data: { collegeId: college.id, emailEncrypted: 'A', emailHash: 'c_chat_A', joiningYear: 2024, branch: 'cs', programme: 'cs', ageVerified: true, consents: { create: { document: 't', version: '1' } }, profile: { create: { alias: 'AliasA' } } }
    });
    sessionA = await createSession(userA.id);

    userB = await prisma.user.create({
      data: { collegeId: college.id, emailEncrypted: 'B', emailHash: 'c_chat_B', joiningYear: 2024, branch: 'cs', programme: 'cs', ageVerified: true, consents: { create: { document: 't', version: '1' } }, profile: { create: { alias: 'AliasB' } } }
    });
    sessionB = await createSession(userB.id);

    const chatSession = await prisma.chatSession.create({
      data: {
        collegeId: college.id,
        userAId: userA.id,
        userBId: userB.id
      }
    });
    chatSessionId = chatSession.id;

    // Manually set active session in Redis to simulate matching engine output
    await redisClient.set(`active_session:${userA.id}`, chatSessionId);
    await redisClient.set(`active_session:${userB.id}`, chatSessionId);
  });

  afterAll(async () => {
    try {
      await prisma.sessionMessage.deleteMany();
      await prisma.chatSession.deleteMany();
      await prisma.profile.deleteMany();
      await prisma.consent.deleteMany();
      await prisma.user.deleteMany();
      await prisma.college.deleteMany();
    } catch(e) {}
  });

  const connectClient = (sessionId: string) => Client(`http://localhost:${port}`, { extraHeaders: { cookie: `sessionId=${sessionId}` } });

  it('delivers message to the other participant and encrypts it in DB', (done) => {
    const clientA = connectClient(sessionA);
    const clientB = connectClient(sessionB);

    clientB.on('session:receive', async (msg) => {
      expect(msg.body).toBe('hello secret friend');
      expect(msg).not.toHaveProperty('senderId'); // identity hidden
      expect(msg).toHaveProperty('createdAt');
      
      // Verify DB storage encryption
      const dbMsg = await prisma.sessionMessage.findUnique({ where: { id: msg.id } });
      expect(dbMsg).not.toBeNull();
      expect(dbMsg!.body).not.toBe('hello secret friend'); // must be encrypted string
      expect(decrypt(dbMsg!.body)).toBe('hello secret friend');

      clientA.disconnect();
      clientB.disconnect();
      done();
    });

    clientA.on('connect', () => {
      clientB.on('connect', () => {
        // give B time to register socket in Redis, then A sends
        setTimeout(() => {
           clientA.emit('session:message', { body: 'hello secret friend' });
        }, 500);
      });
    });
  });

  it('moderation rejects bad messages and notifies sender', (done) => {
    const clientA = connectClient(sessionA);

    clientA.on('error', (err) => {
      if (err.code === 'MOD_REJECT') {
        expect(err.message).toBeDefined();
        clientA.disconnect();
        done();
      }
    });

    clientA.on('connect', () => {
      // Assuming 'badword' is blocked
      clientA.emit('session:message', { body: 'badword' });
    });
  });

  it('typing indicator works', (done) => {
    const clientA = connectClient(sessionA);
    const clientB = connectClient(sessionB);

    clientB.on('session:typing', (data) => {
      expect(data.isTyping).toBe(true);
      clientA.disconnect();
      clientB.disconnect();
      done();
    });

    clientA.on('connect', () => {
      clientB.on('connect', () => {
        setTimeout(() => {
          clientA.emit('session:typing', { isTyping: true });
        }, 500);
      });
    });
  });
});
