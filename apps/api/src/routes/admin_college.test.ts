import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { PrismaClient } from '@prisma/client';
import { redisClient } from '../redis';
import crypto from 'crypto';

const prisma = new PrismaClient();
const hashEmail = (email: string) => crypto.createHash('sha256').update(email).digest('hex');

describe('Admin College Settings', () => {
  let superCookie: string;
  let collegeId: string;
  
  beforeAll(async () => {
    const s = await prisma.admin.create({ data: { emailHash: hashEmail('super@settings.com'), role: 'superadmin' } });
    const sSession = crypto.randomUUID();
    await redisClient.set(`admin_session:${sSession}`, s.id, 'EX', 3600);
    superCookie = `adminSessionId=${sSession}`;

    const col = await prisma.college.create({ 
      data: { 
        name: 'Settings Col', 
        domains: ['s.edu'], 
        studentPattern: '^[a-z]+@s\\.edu$', 
        staffPattern: '^staff@s\\.edu$', 
        programmeLengths: {}, 
        retentionSettings: { globalMessages: 30, chatSessions: 3 }, 
        status: 'ACTIVE',
        matcherSettings: { timeoutSecs: 25, minPoolSize: 2 },
        mustPassSamples: ['alice@s.edu', 'staff@s.edu']
      } 
    });
    collegeId = col.id;
  });

  afterAll(async () => {
    // Rely on test-setup.ts
  });

  it('rejects invalid settings via zod', async () => {
    const invalidPayload = {
      domains: ['s.edu'],
      studentPattern: '.*',
      staffPattern: '.*',
      programmeLengths: {},
      retentionSettings: { globalMessages: -1, chatSessions: 0 }, // Invalid
      featureFlags: { dailyAliasRotation: true },
      matcherSettings: { timeoutSecs: 90, minPoolSize: 0 }, // Invalid max/min
      mustPassSamples: []
    };

    const res = await request(app).post(`/admin/colleges/${collegeId}/settings`).set('Cookie', superCookie).send(invalidPayload);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('blocks saving if a mustPassSample is rejected by new patterns', async () => {
    const payload = {
      domains: ['s.edu'],
      studentPattern: '^[0-9]+@s\\.edu$', // Now requires numbers
      staffPattern: '^staff@s\\.edu$',
      programmeLengths: {},
      retentionSettings: { globalMessages: 30, chatSessions: 3 },
      featureFlags: { dailyAliasRotation: true },
      matcherSettings: { timeoutSecs: 25, minPoolSize: 2 },
      mustPassSamples: ['alice@s.edu'] // Will fail the new student pattern
    };

    const res = await request(app).post(`/admin/colleges/${collegeId}/settings`).set('Cookie', superCookie).send(payload);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Must pass sample failed: alice@s.edu');
  });

  it('saves valid settings and creates a version snapshot', async () => {
    const payload = {
      domains: ['s.edu'],
      studentPattern: '^[a-z]+@s\\.edu$',
      staffPattern: '^staff@s\\.edu$',
      programmeLengths: { 'cs': 4 },
      retentionSettings: { globalMessages: 30, chatSessions: 5 }, // Changed
      featureFlags: { dailyAliasRotation: true },
      matcherSettings: { timeoutSecs: 30, minPoolSize: 2 }, // Changed
      mustPassSamples: ['alice@s.edu']
    };

    const res = await request(app).post(`/admin/colleges/${collegeId}/settings`).set('Cookie', superCookie).send(payload);
    expect(res.status).toBe(200);

    const versions = await prisma.collegeSettingsVersion.findMany({ where: { collegeId } });
    expect(versions.length).toBe(1);
    
    // The snapshot should contain the OLD settings before the update
    const snap: any = versions[0].settings;
    expect(snap.matcherSettings.timeoutSecs).toBe(25);
  });

  it('can revert to a previous version', async () => {
    const versions = await prisma.collegeSettingsVersion.findMany({ where: { collegeId } });
    const versionId = versions[0].id;

    const res = await request(app).post(`/admin/colleges/${collegeId}/revert`).set('Cookie', superCookie).send({ versionId });
    expect(res.status).toBe(200);

    const col = await prisma.college.findUnique({ where: { id: collegeId } });
    const current: any = col?.matcherSettings;
    expect(current.timeoutSecs).toBe(25); // Reverted back
  });

  it('pattern tester endpoint classifies correctly', async () => {
    const payload = {
      sample: 'bob@s.edu',
      studentPattern: '^[a-z]+@s\\.edu$',
      staffPattern: '^staff@s\\.edu$'
    };

    const res = await request(app).post('/admin/colleges/test-pattern').set('Cookie', superCookie).send(payload);
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('STUDENT');
  });
});
