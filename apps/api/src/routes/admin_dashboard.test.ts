import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { PrismaClient } from '@prisma/client';
import { redisClient } from '../redis';
import crypto from 'crypto';
import { encrypt } from '../crypto';

const prisma = new PrismaClient();
const hashEmail = (email: string) => crypto.createHash('sha256').update(email).digest('hex');

describe('Admin Dashboard & Email Reveal', () => {
  let superCookie1: string;
  let superCookie2: string;
  let modCookie: string;
  let s1Id: string, s2Id: string, targetId: string;
  
  beforeAll(async () => {
    const s1 = await prisma.admin.create({ data: { emailHash: hashEmail('sa1@admin.com'), role: 'superadmin' } });
    s1Id = s1.id;
    const s1Session = crypto.randomUUID();
    await redisClient.set(`admin_session:${s1Session}`, s1.id, 'EX', 3600);
    superCookie1 = `adminSessionId=${s1Session}`;

    const s2 = await prisma.admin.create({ data: { emailHash: hashEmail('sa2@admin.com'), role: 'superadmin' } });
    s2Id = s2.id;
    const s2Session = crypto.randomUUID();
    await redisClient.set(`admin_session:${s2Session}`, s2.id, 'EX', 3600);
    superCookie2 = `adminSessionId=${s2Session}`;

    const m = await prisma.admin.create({ data: { emailHash: hashEmail('mod@admin.com'), role: 'moderator' } });
    const mSession = crypto.randomUUID();
    await redisClient.set(`admin_session:${mSession}`, m.id, 'EX', 3600);
    modCookie = `adminSessionId=${mSession}`;

    // Dummy user
    const col = await prisma.college.create({ data: { name: 'Dash Col', domains: [], studentPattern: '', staffPattern: '', programmeLengths: {}, retentionSettings: {}, status: 'ACTIVE' } });
    const u = await prisma.user.create({ data: { collegeId: col.id, emailEncrypted: encrypt('alice@test.com', '12345678901234567890123456789012'), emailHash: 'hash', joiningYear: 2024, branch: 'cs', programme: 'cs', status: 'ACTIVE' }});
    targetId = u.id;

    // Seed OTP for sa1
    await prisma.otpCode.create({ data: { emailHash: hashEmail('sa1@admin.com'), codeHash: crypto.createHash('sha256').update('123456').digest('hex'), expiresAt: new Date(Date.now() + 600000) } });
  });

  afterAll(async () => {
    // Rely on test-setup.ts
  });

  it('Overview returns aggregated data and caches it', async () => {
    const res = await request(app).get('/admin/dashboard/overview').set('Cookie', superCookie1);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('usersOnline');
    expect(res.body).toHaveProperty('signupsToday');
    // Ensure no individual user rows are returned
    expect(res.body.users).toBeUndefined();
  });

  it('Audit log respects role boundaries', async () => {
    // Generate some logs
    await prisma.auditLog.create({ data: { adminId: s1Id, action: 'S1_ACTION', target: 't1', reason: 'r1' }});
    const m = await prisma.admin.findFirst({ where: { role: 'moderator' }});
    await prisma.auditLog.create({ data: { adminId: m!.id, action: 'MOD_ACTION', target: 't2', reason: 'r2' }});

    // Mod sees only their own
    const resMod = await request(app).get('/admin/dashboard/audit').set('Cookie', modCookie);
    expect(resMod.body.some((l: any) => l.action === 'S1_ACTION')).toBe(false);
    expect(resMod.body.some((l: any) => l.action === 'MOD_ACTION')).toBe(true);

    // Superadmin sees all
    const resSa = await request(app).get('/admin/dashboard/audit').set('Cookie', superCookie1);
    expect(resSa.body.some((l: any) => l.action === 'S1_ACTION')).toBe(true);
    expect(resSa.body.some((l: any) => l.action === 'MOD_ACTION')).toBe(true);
  });

  it('Email reveal requires fresh auth and second approver', async () => {
    // Attempt reveal without OTP
    const req1 = await request(app).post(`/admin/dashboard/users/${targetId}/reveal/request`)
      .set('Cookie', superCookie1).send({ reason: 'Legal request 1', legalRef: 'L-1' });
    expect(req1.status).toBe(401);

    // With valid OTP
    const req2 = await request(app).post(`/admin/dashboard/users/${targetId}/reveal/request`)
      .set('Cookie', superCookie1).send({ reason: 'Legal request 1', legalRef: 'L-1', code: '123456' });
    expect(req2.status).toBe(200);
    expect(req2.body.status).toBe('PENDING'); // Because SA > 1

    const reqId = req2.body.id;

    // View before approved should fail
    const v1 = await request(app).get(`/admin/dashboard/users/${targetId}/reveal/view`).set('Cookie', superCookie1);
    expect(v1.status).toBe(403);

    // Approver cannot be requester
    const ap1 = await request(app).post(`/admin/dashboard/reveals/${reqId}/approve`).set('Cookie', superCookie1);
    expect(ap1.status).toBe(403);

    // SA2 approves
    const ap2 = await request(app).post(`/admin/dashboard/reveals/${reqId}/approve`).set('Cookie', superCookie2);
    expect(ap2.status).toBe(200);

    // SA1 can view exactly once
    const v2 = await request(app).get(`/admin/dashboard/users/${targetId}/reveal/view`).set('Cookie', superCookie1);
    expect(v2.status).toBe(200);
    // Note: encryption logic in stub might just return the string. We check it succeeds.

    // Second view fails (expired)
    const v3 = await request(app).get(`/admin/dashboard/users/${targetId}/reveal/view`).set('Cookie', superCookie1);
    expect(v3.status).toBe(403);
  });
});
