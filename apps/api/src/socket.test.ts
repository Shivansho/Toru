import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { io as Client } from 'socket.io-client';
import { httpServer } from './index';
import { PrismaClient } from '@prisma/client';
import { redisClient } from './redis';
import { createSession } from './services/auth';

const prisma = new PrismaClient();

describe('Socket.IO Server', () => {
  let port: number;
  let userA: any;
  let userB: any; // same college
  let userC: any; // different college
  let sessionA: string;
  let sessionB: string;
  let sessionC: string;

  beforeAll(async () => {
    // Setup server
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        port = (httpServer.address() as any).port;
        resolve();
      });
    });

    try {
      await prisma.$connect();
      
      const college1 = await prisma.college.create({
        data: {
          name: 'College 1', domains: ['c1'], studentPattern: '.*', staffPattern: '.*', programmeLengths: {}, retentionSettings: {}, status: 'ACTIVE'
        }
      });
      const college2 = await prisma.college.create({
        data: {
          name: 'College 2', domains: ['c2'], studentPattern: '.*', staffPattern: '.*', programmeLengths: {}, retentionSettings: {}, status: 'ACTIVE'
        }
      });

      userA = await prisma.user.create({
        data: {
          collegeId: college1.id, emailEncrypted: 'A', emailHash: 'hashA', joiningYear: 2024, branch: 'cs', programme: 'cs',
          ageVerified: true, consents: { create: { document: 't', version: '1' } }
        }
      });
      sessionA = await createSession(userA.id);

      userB = await prisma.user.create({
        data: {
          collegeId: college1.id, emailEncrypted: 'B', emailHash: 'hashB', joiningYear: 2024, branch: 'cs', programme: 'cs',
          ageVerified: true, consents: { create: { document: 't', version: '1' } }
        }
      });
      sessionB = await createSession(userB.id);

      userC = await prisma.user.create({
        data: {
          collegeId: college2.id, emailEncrypted: 'C', emailHash: 'hashC', joiningYear: 2024, branch: 'cs', programme: 'cs',
          ageVerified: true, consents: { create: { document: 't', version: '1' } }
        }
      });
      sessionC = await createSession(userC.id);
    } catch (e) {
      console.error(e);
    }
  });

  afterAll(async () => {
    httpServer.close();
    try {
      await prisma.consent.deleteMany();
      await prisma.user.deleteMany();
      await prisma.college.deleteMany();
      await prisma.$disconnect();
    } catch (e) {}
    redisClient.disconnect();
  });

  const connectClient = (sessionId: string) => {
    return Client(`http://localhost:${port}`, {
      extraHeaders: {
        cookie: `sessionId=${sessionId}`
      }
    });
  };

  it('rejects unauthenticated connections', async () => {
    return new Promise<void>((resolve) => {
      const client = connectClient('invalid-session');
      client.on('connect_error', (err) => {
        client.disconnect();
        resolve();
      });
    });
  });

  it('connects successfully and joins tenant room', async () => {
    return new Promise<void>((resolve) => {
      const client = connectClient(sessionA);
      client.on('connect', () => {
        expect(client.connected).toBe(true);
        client.disconnect();
        resolve();
      });
    });
  });

  it('enforces tenant isolation (online-count)', async () => {
    return new Promise<void>((resolve) => {
      const clientA = connectClient(sessionA);
      const clientC = connectClient(sessionC);

      clientA.on('online-count', (count) => {
        if (count === 1) { // Just A
          const clientB = connectClient(sessionB);
          clientB.on('connect', () => {});
          
          clientA.on('online-count', (countAfterB) => {
            if (countAfterB === 2) {
              clientA.disconnect();
              clientB.disconnect();
              clientC.disconnect();
              resolve();
            }
          });
        }
      });

      clientC.on('online-count', (count) => {
        expect(count).toBe(1);
      });
    });
  });

  it('disconnects on flooding', async () => {
    return new Promise<void>((resolve) => {
      const client = connectClient(sessionA);
      client.on('connect', () => {
        for (let i = 0; i < 60; i++) {
          client.emit('heartbeat');
        }
      });

      client.on('error', (err) => {
        if (err && err.code === 'FLOODING') {
          expect(err.message).toContain('Rate limit');
        }
      });

      client.on('disconnect', (reason) => {
        expect(reason).toBe('io server disconnect');
        resolve();
      });
    });
  });

  it('handles match and session events', async () => {
    return new Promise<void>((resolve) => {
      const client = connectClient(sessionB);
      client.on('connect', () => {
        client.emit('match:search', { filter: 'ANY' });
        client.emit('session:message', { body: 'hello' });
        client.emit('session:typing', { isTyping: true });
        client.emit('match:skip');
        client.emit('match:cancel');
        client.emit('match:leave');
        
        setTimeout(() => {
          client.disconnect();
          resolve();
        }, 500);
      });
    });
  });

  it('rejects second connection (one active connection policy)', async () => {
    return new Promise<void>((resolve) => {
      const client1 = connectClient(sessionC);
      client1.on('connect', () => {
        const client2 = connectClient(sessionC);
        client2.on('connect_error', (err) => {
          expect(err.message).toBe('Session active elsewhere');
          client1.disconnect();
          client2.disconnect();
          resolve();
        });
      });
    });
  });
});
