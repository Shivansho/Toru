import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { PrismaClient } from '@prisma/client';
import { createSession } from '../services/auth';
import { runRetentionJob } from '../services/retention';

const prisma = new PrismaClient();

describe('Reporting & Blocking System', () => {
  let college: any;
  let userA: any, userB: any, userC: any, userD: any;
  let sessionA: string, sessionB: string, sessionC: string;
  let recentSessionId: string;
  let oldSessionId: string;

  beforeAll(async () => {
    college = await prisma.college.create({
      data: { name: 'Report College', domains: ['r.c'], studentPattern: '.*', staffPattern: '.*', programmeLengths: {}, retentionSettings: { recentChatsHours: 72, chatSessions: 3 }, status: 'ACTIVE' }
    });

    userA = await prisma.user.create({
      data: { collegeId: college.id, emailEncrypted: 'A', emailHash: 'r_A', joiningYear: 2024, branch: 'cs', programme: 'cs', ageVerified: true, profile: { create: { alias: 'Reporter' } } }
    });
    sessionA = await createSession(userA.id);

    userB = await prisma.user.create({
      data: { collegeId: college.id, emailEncrypted: 'B', emailHash: 'r_B', joiningYear: 2024, branch: 'cs', programme: 'cs', ageVerified: true, profile: { create: { alias: 'Reported' } } }
    });
    sessionB = await createSession(userB.id);

    userC = await prisma.user.create({
      data: { collegeId: college.id, emailEncrypted: 'C', emailHash: 'r_C', joiningYear: 2024, branch: 'cs', programme: 'cs', ageVerified: true, profile: { create: { alias: 'UserC' } } }
    });
    sessionC = await createSession(userC.id);

    userD = await prisma.user.create({
      data: { collegeId: college.id, emailEncrypted: 'D', emailHash: 'r_D', joiningYear: 2024, branch: 'cs', programme: 'cs', ageVerified: true, profile: { create: { alias: 'UserD' } } }
    });

    const s1 = await prisma.chatSession.create({
      data: { collegeId: college.id, userAId: userA.id, userBId: userB.id, startedAt: new Date(Date.now() - 71 * 60 * 60 * 1000) }
    });
    recentSessionId = s1.id;

    const s2 = await prisma.chatSession.create({
      data: { collegeId: college.id, userAId: userA.id, userBId: userB.id, startedAt: new Date(Date.now() - 73 * 60 * 60 * 1000) }
    });
    oldSessionId = s2.id;
  });

  afterAll(async () => {
    try {
      await prisma.report.deleteMany();
      await prisma.block.deleteMany();
      await prisma.sanction.deleteMany();
      await prisma.sessionMessage.deleteMany();
      await prisma.chatSession.deleteMany();
      await prisma.profile.deleteMany();
      await prisma.user.deleteMany();
      await prisma.college.deleteMany();
    } catch(e) {}
  });

  it('report filed 71 hours after chat succeeds', async () => {
    const res = await request(app).post('/chat/reports').set('Cookie', \`sessionId=\${sessionA}\`).send({
      reason: 'harassment',
      sessionId: recentSessionId
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Thank you');

    const report = await prisma.report.findFirst({ where: { reporterId: userA.id, sessionId: recentSessionId } });
    expect(report).not.toBeNull();
    expect(report!.reportedId).toBe(userB.id); // accurately mapped

    const session = await prisma.chatSession.findUnique({ where: { id: recentSessionId } });
    expect(session!.locked).toBe(true); // Locked for retention
  });

  it('report filed 73 hours after chat fails', async () => {
    const res = await request(app).post('/chat/reports').set('Cookie', \`sessionId=\${sessionA}\`).send({
      reason: 'harassment',
      sessionId: oldSessionId
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('too old');
  });

  it('ignores duplicate reports on the same session', async () => {
    // A reports recentSession again
    const res = await request(app).post('/chat/reports').set('Cookie', \`sessionId=\${sessionA}\`).send({
      reason: 'harassment',
      sessionId: recentSessionId
    });
    expect(res.status).toBe(200); // Silent success

    const count = await prisma.report.count({ where: { reporterId: userA.id, sessionId: recentSessionId } });
    expect(count).toBe(1); // Still only 1
  });

  it('auto-mute trigger: 3 distinct reporters mute the user', async () => {
    // B was reported by A. Let's get C and D to report B via global messages.
    const msg1 = await prisma.globalMessage.create({ data: { collegeId: college.id, userId: userB.id, body: 'bad' } });
    
    // C reports B
    await request(app).post('/chat/reports').set('Cookie', \`sessionId=\${sessionC}\`).send({
      reason: 'spam', globalMessageId: msg1.id
    });
    
    // D reports B
    const sessionD = await createSession(userD.id);
    await request(app).post('/chat/reports').set('Cookie', \`sessionId=\${sessionD}\`).send({
      reason: 'spam', globalMessageId: msg1.id
    });

    const b = await prisma.user.findUnique({ where: { id: userB.id } });
    expect(b!.status).toBe('MUTED');

    const sanction = await prisma.sanction.findFirst({ where: { userId: userB.id, type: 'MUTE' } });
    expect(sanction).not.toBeNull();
  });

  it('locked transcript survives the retention job', async () => {
    // s1 (recentSessionId) is locked, s2 (oldSessionId) is not.
    // Set both to be older than 3 days just to test retention
    await prisma.chatSession.update({
      where: { id: recentSessionId }, data: { startedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) }
    });
    await prisma.chatSession.update({
      where: { id: oldSessionId }, data: { startedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) }
    });

    await runRetentionJob();

    const lockedSession = await prisma.chatSession.findUnique({ where: { id: recentSessionId } });
    expect(lockedSession).not.toBeNull(); // Survived

    const unlockedSession = await prisma.chatSession.findUnique({ where: { id: oldSessionId } });
    expect(unlockedSession).toBeNull(); // Deleted
  });
});
