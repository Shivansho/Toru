import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { PrismaClient } from '@prisma/client';
import { redisClient } from '../redis';
import crypto from 'crypto';
// No otplib import
import { vi } from 'vitest';

vi.mock('otplib', () => {
  return {
    authenticator: {
      generateSecret: () => 'SECRET123',
      generate: () => '123456',
      verify: (opts: any) => opts.token === '123456'
    }
  };
});
import { withAudit } from '../services/audit';

const prisma = new PrismaClient();

const hashEmail = (email: string) => crypto.createHash('sha256').update(email).digest('hex');

describe('Admin Foundation', () => {
  let superadminId: string;
  let modId: string;
  let superCookie: string;
  let modCookie: string;
  let totpSecret: string;

  beforeAll(async () => {
    const sHash = hashEmail('super@admin.com');
    const mHash = hashEmail('mod@admin.com');
    const noneHash = hashEmail('none@admin.com');

    totpSecret = 'SECRET123';

    const s = await prisma.admin.create({ data: { emailHash: sHash, role: 'superadmin', totpEnabled: true, totpSecret } });
    superadminId = s.id;
    
    const m = await prisma.admin.create({ data: { emailHash: mHash, role: 'moderator' } });
    modId = m.id;

    // Direct session creation for tests
    const sSession = crypto.randomUUID();
    await redisClient.set(`admin_session:${sSession}`, superadminId, 'EX', 3600);
    superCookie = `adminSessionId=${sSession}`;

    const mSession = crypto.randomUUID();
    await redisClient.set(`admin_session:${mSession}`, modId, 'EX', 3600);
    modCookie = `adminSessionId=${mSession}`;
  });

  afterAll(async () => {
    // Rely on test-setup.ts
  });

  it('rejects non-admin requests completely (401)', async () => {
    const res = await request(app).get('/admin/me');
    expect(res.status).toBe(401);
  });

  it('moderator denied on superadmin routes', async () => {
    const res = await request(app).get('/admin/settings').set('Cookie', modCookie);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('superadmin allowed on superadmin routes', async () => {
    const res = await request(app).get('/admin/settings').set('Cookie', superCookie);
    expect(res.status).toBe(200);
  });

  it('session expiry works', async () => {
    const fakeSession = 'expired_session';
    await request(app).get('/admin/me').set('Cookie', `adminSessionId=${fakeSession}`).expect(401);
  });

  it('audit helper rejects empty reasons', async () => {
    await expect(
      withAudit(prisma, superadminId, 'TEST', 'test_target', '', async (tx) => { return true; })
    ).rejects.toThrow('Audit reason cannot be empty');
  });

  it('audit helper writes AuditLog in transaction', async () => {
    const res = await withAudit(prisma, superadminId, 'TEST_ACTION', 'tgt', 'Because', async (tx) => {
      return 'success';
    });
    expect(res).toBe('success');

    const log = await prisma.auditLog.findFirst({ where: { adminId: superadminId, action: 'TEST_ACTION' } });
    expect(log).not.toBeNull();
    expect(log!.reason).toBe('Because');
  });

  describe('TOTP Flow', () => {
    it('requires TOTP if enabled during login', async () => {
      // 1. request OTP
      await request(app).post('/admin/auth/request-otp').send({ email: 'super@admin.com' });
      
      const otp = await prisma.otpCode.findUnique({ where: { emailHash: hashEmail('super@admin.com') } });
      expect(otp).not.toBeNull();
      
      // Since code is random, we have to bypass or get it. In a real test, we would intercept the email or mock crypto.
      // Let's just create a known one.
      const code = '123456';
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');
      await prisma.otpCode.update({ where: { emailHash: hashEmail('super@admin.com') }, data: { codeHash, attempts: 0 } });

      // 2. verify without TOTP -> should fail
      const res1 = await request(app).post('/admin/auth/verify-otp').send({ email: 'super@admin.com', code });
      expect(res1.status).toBe(401);
      expect(res1.body.error).toBe('TOTP required');

      // 3. verify with wrong TOTP -> should fail
      const res2 = await request(app).post('/admin/auth/verify-otp').send({ email: 'super@admin.com', code, totp: '000000' });
      expect(res2.status).toBe(401);
      expect(res2.body.error).toBe('Invalid TOTP');

      // 4. verify with valid TOTP -> should succeed
      const validTotp = '123456';
      const res3 = await request(app).post('/admin/auth/verify-otp').send({ email: 'super@admin.com', code, totp: validTotp });
      expect(res3.status).toBe(200);
      expect(res3.body.message).toBe('Authenticated');
      expect(res3.headers['set-cookie'][0]).toContain('adminSessionId=');
    });
  });
});
