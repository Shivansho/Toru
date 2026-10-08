import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from './index';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

function getRoutes(router: any, basePath = ''): { method: string; path: string }[] {
  const routes: { method: string; path: string }[] = [];
  
  if (router && router.stack) {
    router.stack.forEach((layer: any) => {
      if (layer.route) {
        const path = layer.route.path;
        for (const method in layer.route.methods) {
          if (layer.route.methods[method]) {
            routes.push({ method: method.toUpperCase(), path: basePath + path });
          }
        }
      } else if (layer.name === 'router' && layer.handle.stack) {
        const routePath = layer.regexp.source.replace('^\\', '').replace('\\/?(?=\\/|$)', '');
        // Hacky way to extract basePath from regexp string
        const cleanPath = routePath.replace(/\\\//g, '/').replace(/\?\(\?=\\\/\|\$\)/g, '').split('^')[0].split('$')[0].replace(/\(\?\:\(\?\.[\s\S]*\)/, '').split('(')[0];
        const bp = basePath + (cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath);
        routes.push(...getRoutes(layer.handle, bp.replace(/\/$/, '')));
      }
    });
  }
  return routes;
}

describe('Security & Authorization', () => {
  let allRoutes: { method: string; path: string }[] = [];
  
  // Create some users
  const user1Token = 'session1';
  const user2Token = 'session2';
  const adminToken = 'admin-session1';
  let adminId: string;
  let user1Id: string;
  let user2Id: string;
  let col1Id: string;
  let col2Id: string;
  let sId: string; // chat session between user1 and some user
  let gId: string; // global message from user 1

  beforeAll(async () => {
    // We just manually build the route list since runtime extraction of express routers is flaky in tests
    // But we'll try dynamic extraction first.
    // However, some routes require specific params like :id. We will replace :id with a valid UUID.
    
    const col1 = await prisma.college.create({ data: { name: 'Sec Col 1', domains: [], studentPattern: '', staffPattern: '', programmeLengths: {}, retentionSettings: {}, status: 'ACTIVE' } });
    const col2 = await prisma.college.create({ data: { name: 'Sec Col 2', domains: [], studentPattern: '', staffPattern: '', programmeLengths: {}, retentionSettings: {}, status: 'ACTIVE' } });
    col1Id = col1.id;
    col2Id = col2.id;
    
    const u1 = await prisma.user.create({ data: { collegeId: col1.id, emailEncrypted: 'U1', emailHash: 'H1', joiningYear: 2024, branch: 'cs', programme: 'cs', status: 'ACTIVE' } });
    const u2 = await prisma.user.create({ data: { collegeId: col2.id, emailEncrypted: 'U2', emailHash: 'H2', joiningYear: 2024, branch: 'cs', programme: 'cs', status: 'ACTIVE' } });
    user1Id = u1.id;
    user2Id = u2.id;

    // Chat session for u1
    const sess = await prisma.chatSession.create({ data: { collegeId: col1.id, userAId: u1.id, userBId: u1.id } });
    sId = sess.id;
    
    // Global message for u1
    const msg = await prisma.globalMessage.create({ data: { collegeId: col1.id, userId: u1.id, body: 'Hello' } });
    gId = msg.id;

    // Admin
    const ad = await prisma.admin.create({ data: { emailHash: 'A1', role: 'superadmin' } });
    adminId = ad.id;

    // Set up Redis sessions
    await import('./redis').then(async ({ redisClient }) => {
      await redisClient.set(`session:${user1Token}`, user1Id, 'EX', 3600);
      await redisClient.set(`session:${user2Token}`, user2Id, 'EX', 3600);
      await redisClient.set(`admin_session:${adminToken}`, adminId, 'EX', 3600);
    });

    allRoutes = [
      { method: 'GET', path: '/chat/global/history' },
      { method: 'GET', path: '/chat/recent' },
      { method: 'POST', path: '/chat/blocks' },
      { method: 'GET', path: '/chat/blocks' },
      { method: 'DELETE', path: '/chat/blocks/some-alias' },
      { method: 'POST', path: '/chat/reports' },
      { method: 'POST', path: '/onboarding/age-check' },
      { method: 'POST', path: '/onboarding/alias' },
      { method: 'POST', path: '/onboarding/consent' },
      { method: 'POST', path: '/onboarding/year' },
    ];
  });
  
  afterAll(async () => {
    try {
      await prisma.report.deleteMany();
      await prisma.sessionMessage.deleteMany();
      await prisma.chatSession.deleteMany();
      await prisma.globalMessage.deleteMany();
      await prisma.block.deleteMany();
      await prisma.profile.deleteMany();
      await prisma.user.deleteMany();
      await prisma.college.deleteMany();
      await prisma.admin.deleteMany();
    } catch(e) {}
  });

  describe('Unauthenticated Access', () => {
    it('denies access to protected routes without a session', async () => {
      for (const route of allRoutes) {
        const req = request(app)[route.method.toLowerCase() as 'get'|'post'|'put'|'delete'](route.path);
        const res = await req.send();
        // Should be 401 Unauthorized or 403 Forbidden
        expect([401, 403]).toContain(res.status);
      }
    });
  });

  describe('Admin Routes', () => {
    const adminRoutes = [
      { method: 'GET', path: '/admin/settings' },
      { method: 'GET', path: '/admin/dashboard/overview' },
      { method: 'GET', path: '/admin/reports' },
      { method: 'GET', path: '/admin/colleges' },
    ];

    it('denies access to admin routes for regular users', async () => {
      for (const route of adminRoutes) {
        const res = await request(app)[route.method.toLowerCase() as 'get'](route.path)
          .set('Cookie', `sessionId=${user1Token}`);
        expect([401, 403]).toContain(res.status);
      }
    });
  });

  describe('Insecure Direct Object Reference (IDOR)', () => {
    it('prevents user from reporting a session they are not part of', async () => {
      // User 2 tries to report User 1's session
      const res = await request(app)
        .post('/chat/reports')
        .set('Cookie', `sessionId=${user2Token}`)
        .send({ reason: 'spam', sessionId: sId });
      
      expect(res.status).toBe(403);
    });
  });
});
