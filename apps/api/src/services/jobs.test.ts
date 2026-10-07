import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { runRetentionJob, SAFETY_PERCENTAGE } from './jobs';
import { redisClient } from '../redis';

const prisma = new PrismaClient();

describe('Retention Jobs', () => {
  let college: any;
  let userA: any, userB: any;
  let sessionA: string, sessionB: string; // just IDs
  let globalOpenMsgId: string, globalOldMsgId: string;
  let sLocked: string, sUnlockedOld: string, sUnlockedNew: string;

  beforeAll(async () => {
    college = await prisma.college.create({
      data: { name: 'Job College', domains: ['j.c'], studentPattern: '.*', staffPattern: '.*', programmeLengths: {}, retentionSettings: { globalMessages: 30, chatSessions: 3 }, featureFlags: { dailyAliasRotation: true }, status: 'ACTIVE' }
    });

    userA = await prisma.user.create({
      data: { collegeId: college.id, emailEncrypted: 'A', emailHash: 'j_A', joiningYear: 2024, branch: 'cs', programme: 'cs', ageVerified: true, status: 'MUTED', profile: { create: { alias: 'JobA', aliasRotatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000) } } }
    });

    userB = await prisma.user.create({
      data: { collegeId: college.id, emailEncrypted: 'B', emailHash: 'j_B', joiningYear: 2024, branch: 'cs', programme: 'cs', ageVerified: true, profile: { create: { alias: 'JobB' } } }
    });

    // Create expired OTP
    await prisma.otpCode.create({ data: { emailHash: 'j_A', codeHash: '123', expiresAt: new Date(Date.now() - 1000) } });
    await prisma.otpCode.create({ data: { emailHash: 'j_B', codeHash: '123', expiresAt: new Date(Date.now() + 100000) } });

    // Create expired Sanction
    await prisma.sanction.create({ data: { userId: userA.id, type: 'MUTE', reason: 'Test', expiresAt: new Date(Date.now() - 1000) } });
    await prisma.sanction.create({ data: { userId: userA.id, type: 'MUTE', reason: 'Test2', expiresAt: new Date(Date.now() + 1000000) } });
    await prisma.sanction.create({ data: { userId: userA.id, type: 'MUTE', reason: 'Test3', expiresAt: new Date(Date.now() + 1000000) } });

    // Global messages
    const gOld1 = await prisma.globalMessage.create({ data: { collegeId: college.id, userId: userA.id, body: 'old1', createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) } });
    const gOld2 = await prisma.globalMessage.create({ data: { collegeId: college.id, userId: userA.id, body: 'old2', hidden: true, createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) } });
    globalOldMsgId = gOld1.id;
    globalOpenMsgId = gOld2.id;
    
    // attach open report to gOld2
    await prisma.report.create({ data: { reporterId: userB.id, reportedId: userA.id, globalMessageId: globalOpenMsgId, reason: 'spam', status: 'OPEN' } });

    // Chat sessions
    const c1 = await prisma.chatSession.create({ data: { collegeId: college.id, userAId: userA.id, userBId: userB.id, startedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), locked: false } });
    const c2 = await prisma.chatSession.create({ data: { collegeId: college.id, userAId: userA.id, userBId: userB.id, startedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), locked: true } });
    const c3 = await prisma.chatSession.create({ data: { collegeId: college.id, userAId: userA.id, userBId: userB.id, startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), locked: false } });
    sUnlockedOld = c1.id;
    sLocked = c2.id;
    sUnlockedNew = c3.id;

    // Give some normal ones so safety limit isn't tripped (if safety limit is 50%, we need 2x total to delete 1x)
    await prisma.globalMessage.create({ data: { collegeId: college.id, userId: userA.id, body: 'new', createdAt: new Date() } });
    await prisma.globalMessage.create({ data: { collegeId: college.id, userId: userB.id, body: 'new', createdAt: new Date() } });
    
    await prisma.chatSession.create({ data: { collegeId: college.id, userAId: userA.id, userBId: userB.id, startedAt: new Date() } });
    await prisma.chatSession.create({ data: { collegeId: college.id, userAId: userA.id, userBId: userB.id, startedAt: new Date() } });
  });

  afterAll(async () => {
    try {
      await prisma.jobRun.deleteMany();
      await prisma.report.deleteMany();
      await prisma.sanction.deleteMany();
      await prisma.otpCode.deleteMany();
      await prisma.sessionMessage.deleteMany();
      await prisma.chatSession.deleteMany();
      await prisma.globalMessage.deleteMany();
      await prisma.profile.deleteMany();
      await prisma.user.deleteMany();
      await prisma.college.deleteMany();
    } catch(e) {}
  });

  it('runs dry run without deleting', async () => {
    const res = await runRetentionJob(true);
    expect(res.status).toBe('DRY_RUN');
    
    // Check that nothing was deleted
    const otp = await prisma.otpCode.count({ where: { emailHash: 'j_A' } });
    expect(otp).toBe(1);
  });

  it('deletes expired OTPs and Sanctions', async () => {
    const res = await runRetentionJob();
    expect(res.status).toBe('COMPLETED');
    
    const otp = await prisma.otpCode.count({ where: { emailHash: 'j_A' } });
    expect(otp).toBe(0); // Deleted
    
    const sanc = await prisma.sanction.count();
    expect(sanc).toBe(2); // Kept 2 unexpired

    // userA should be ACTIVE again
    const u = await prisma.user.findUnique({ where: { id: userA.id } });
    expect(u!.status).toBe('ACTIVE');
  });

  it('rotates old aliases', async () => {
    const p = await prisma.profile.findUnique({ where: { userId: userA.id } });
    expect(p!.alias).not.toBe('JobA');
    expect(p!.alias.startsWith('Alias_')).toBe(true);
  });

  it('deletes old global messages unless attached to open report', async () => {
    const old1 = await prisma.globalMessage.findUnique({ where: { id: globalOldMsgId } });
    expect(old1).toBeNull(); // Deleted
    
    const old2 = await prisma.globalMessage.findUnique({ where: { id: globalOpenMsgId } });
    expect(old2).not.toBeNull(); // Kept because of OPEN report
  });

  it('deletes old unlocked chat sessions, preserves locked or new', async () => {
    const s1 = await prisma.chatSession.findUnique({ where: { id: sUnlockedOld } });
    expect(s1).toBeNull(); // Deleted
    
    const s2 = await prisma.chatSession.findUnique({ where: { id: sLocked } });
    expect(s2).not.toBeNull(); // Kept (locked)
    
    const s3 = await prisma.chatSession.findUnique({ where: { id: sUnlockedNew } });
    expect(s3).not.toBeNull(); // Kept (new)
  });

  it('is idempotent (running again does exactly the same or no-op)', async () => {
    const res1 = await runRetentionJob();
    expect(res1.status).toBe('COMPLETED');
    expect(res1.totalDeleted).toBe(0); // Nothing left to delete
  });

  it('enforces distributed lock', async () => {
    // Acquire lock manually
    await redisClient.set('job:retention:lock', 'locked', 'EX', 300);
    const res = await runRetentionJob();
    expect(res.status).toBe('LOCKED');
    
    // Release
    await redisClient.del('job:retention:lock');
  });

  it('safety limit blocks accidental mass deletion', async () => {
    await prisma.otpCode.createMany({
      data: Array.from({ length: 20 }).map((_, i) => ({
        emailHash: `j_fake_exp_${i}`,
        codeHash: '123',
        expiresAt: new Date(Date.now() - 1000)
      }))
    });

    await expect(runRetentionJob()).rejects.toThrow(/Safety limit/);
  });
});
