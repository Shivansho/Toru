import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { PrismaClient } from '@prisma/client';
import { redisClient } from '../redis';
import crypto from 'crypto';

const prisma = new PrismaClient();
const hashEmail = (email: string) => crypto.createHash('sha256').update(email).digest('hex');

describe('Admin Reports & Moderation Actions', () => {
  let superCookie: string;
  let modCookie: string;
  let superadminId: string, modId: string;
  let rId1: string, rId2: string, rId3: string, rId4: string, rId5: string;
  let reportedUser: any;
  
  beforeAll(async () => {
    // Admins
    const s = await prisma.admin.create({ data: { emailHash: hashEmail('sa@admin.com'), role: 'superadmin' } });
    superadminId = s.id;
    const m = await prisma.admin.create({ data: { emailHash: hashEmail('ma@admin.com'), role: 'moderator' } });
    modId = m.id;

    const sSession = crypto.randomUUID();
    await redisClient.set(\`admin_session:\${sSession}\`, superadminId, 'EX', 3600);
    superCookie = \`adminSessionId=\${sSession}\`;

    const mSession = crypto.randomUUID();
    await redisClient.set(\`admin_session:\${mSession}\`, modId, 'EX', 3600);
    modCookie = \`adminSessionId=\${mSession}\`;

    // Users
    const col = await prisma.college.create({ data: { name: 'Admin Test Col', domains: [], studentPattern: '', staffPattern: '', programmeLengths: {}, retentionSettings: {}, status: 'ACTIVE' } });
    
    reportedUser = await prisma.user.create({
      data: { collegeId: col.id, emailEncrypted: 'R1', emailHash: 'hash_r1', joiningYear: 2024, branch: 'cs', programme: 'cs', status: 'ACTIVE' }
    });

    const reporter = await prisma.user.create({
      data: { collegeId: col.id, emailEncrypted: 'Rep', emailHash: 'hash_rep', joiningYear: 2024, branch: 'cs', programme: 'cs', status: 'ACTIVE' }
    });

    // Create 5 reports
    const rep1 = await prisma.report.create({ data: { reporterId: reporter.id, reportedId: reportedUser.id, reason: 'spam', status: 'OPEN', priority: 0 } });
    rId1 = rep1.id;
    const rep2 = await prisma.report.create({ data: { reporterId: reporter.id, reportedId: reportedUser.id, reason: 'harassment', status: 'OPEN', priority: 0 } });
    rId2 = rep2.id;
    const rep3 = await prisma.report.create({ data: { reporterId: reporter.id, reportedId: reportedUser.id, reason: 'threats', status: 'OPEN', priority: 1 } }); // high prio
    rId3 = rep3.id;
    const rep4 = await prisma.report.create({ data: { reporterId: reporter.id, reportedId: reportedUser.id, reason: 'spam', status: 'OPEN', priority: 0 } });
    rId4 = rep4.id;
    const rep5 = await prisma.report.create({ data: { reporterId: reporter.id, reportedId: reportedUser.id, reason: 'suspected_minor', status: 'OPEN', priority: 1 } });
    rId5 = rep5.id;
  });

  afterAll(async () => {
    try {
      await prisma.auditLog.deleteMany();
      await prisma.report.deleteMany();
      await prisma.sanction.deleteMany();
      await prisma.bannedHash.deleteMany();
      await prisma.profile.deleteMany();
      await prisma.preference.deleteMany();
      await prisma.consent.deleteMany();
      await prisma.user.deleteMany();
      await prisma.college.deleteMany();
      await prisma.admin.deleteMany();
    } catch(e) {}
  });

  it('fetches report queue ordered by high-priority first', async () => {
    const res = await request(app).get('/admin/reports').set('Cookie', modCookie);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(5);
    
    // priority 1 should be before priority 0
    expect(res.body[0].priority).toBe(1);
    expect(res.body[1].priority).toBe(1);
    expect(res.body[2].priority).toBe(0);
    
    // No email leaked
    expect(res.body[0].reported).not.toHaveProperty('emailEncrypted');
    expect(res.body[0].reported).toHaveProperty('internalId');
  });

  it('assigns report uniquely (prevents double assignment)', async () => {
    const res1 = await request(app).patch(\`/admin/reports/\${rId1}/assign\`).set('Cookie', modCookie);
    expect(res1.status).toBe(200);

    const res2 = await request(app).patch(\`/admin/reports/\${rId1}/assign\`).set('Cookie', superCookie);
    expect(res2.status).toBe(409); // Already assigned
  });

  it('escalate marks report as urgent and writes audit log', async () => {
    const res = await request(app).post(\`/admin/reports/\${rId1}/escalate\`).set('Cookie', modCookie).send({ reason: 'Needs urgent check' });
    expect(res.status).toBe(200);
    
    const rep = await prisma.report.findUnique({ where: { id: rId1 } });
    expect(rep!.priority).toBe(99);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'REPORT_ESCALATE', target: rId1 } });
    expect(audit).not.toBeNull();
  });

  it('warn action creates sanction and updates report', async () => {
    const res = await request(app).post(\`/admin/reports/\${rId2}/action\`).set('Cookie', modCookie).send({ action: 'warn', reason: 'Be nice' });
    expect(res.status).toBe(200);

    const rep = await prisma.report.findUnique({ where: { id: rId2 } });
    expect(rep!.status).toBe('RESOLVED');

    const sanc = await prisma.sanction.findFirst({ where: { userId: reportedUser.id, type: 'WARNING' } });
    expect(sanc).not.toBeNull();
  });

  it('ban action creates sanction, bans hash, and updates user status', async () => {
    const res = await request(app).post(\`/admin/reports/\${rId3}/action\`).set('Cookie', superCookie).send({ action: 'ban', reason: 'Zero tolerance' });
    expect(res.status).toBe(200);

    const rep = await prisma.report.findUnique({ where: { id: rId3 } });
    expect(rep!.status).toBe('RESOLVED');

    const user = await prisma.user.findUnique({ where: { id: reportedUser.id } });
    expect(user!.status).toBe('BANNED');

    const ban = await prisma.bannedHash.findUnique({ where: { hash: 'hash_r1' } });
    expect(ban).not.toBeNull();
  });

  it('suspected minor deactivates and scrambles user data while preserving ban hash', async () => {
    const res = await request(app).post(\`/admin/reports/\${rId5}/action\`).set('Cookie', superCookie).send({ action: 'suspected_minor', reason: 'Too young' });
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { id: reportedUser.id } });
    expect(user!.status).toBe('DELETED');
    expect(user!.emailEncrypted).toBe('DELETED');
    expect(user!.branch).toBe('DEL'); // Scrambled

    // Ban hash still exists for 'Too young' or previous ban
    const banCount = await prisma.bannedHash.count({ where: { hash: 'hash_r1' } });
    expect(banCount).toBeGreaterThanOrEqual(1);
  });
});
