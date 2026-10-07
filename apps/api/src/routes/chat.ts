import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireAgeVerified } from '../middleware/auth';
import { redisClient } from '../redis';
import { io } from '../index';

const router = Router();
const prisma = new PrismaClient();

router.get('/global/history', requireAuth, requireAgeVerified, async (req: Request, res: Response) => {
  const { cursor } = req.query;
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(401).json({ error: 'User not found' });

  // Get blocks
  const blocks = await prisma.block.findMany({ where: { blockerId: user.id } });
  const blockedIds = blocks.map(b => b.blockedId);

  const messages = await prisma.globalMessage.findMany({
    where: { 
      collegeId: user.collegeId,
      hidden: false,
      userId: { notIn: blockedIds }
    },
    take: 50,
    ...(cursor ? { skip: 1, cursor: { id: cursor as string } } : {}),
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        include: { profile: true }
      }
    }
  });

  const payload = messages.map(msg => ({
    id: msg.id,
    body: msg.body,
    alias: msg.user.profile?.alias || 'Unknown',
    createdAt: msg.createdAt.toISOString()
  }));

  return res.json(payload.reverse());
});

router.get('/recent', requireAuth, requireAgeVerified, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, include: { college: true } });
  if (!user) return res.status(401).json({ error: 'User not found' });

  // Retention setting or default 72h
  const retentionSettings = user.college.retentionSettings as any;
  const hours = retentionSettings?.recentChatsHours || 72;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  const sessions = await prisma.chatSession.findMany({
    where: {
      OR: [
        { userAId: user.id },
        { userBId: user.id }
      ],
      startedAt: { gte: cutoff }
    },
    orderBy: { startedAt: 'desc' },
    take: 50
  });

  const payload = sessions.map(s => ({
    sessionId: s.id,
    label: `Chat on ${s.startedAt.toLocaleDateString()}`,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt?.toISOString() || null
  }));

  return res.json(payload);
});

router.post('/blocks', requireAuth, requireAgeVerified, async (req: Request, res: Response) => {
  const { sessionId, globalMessageId } = req.body;
  if (!sessionId && !globalMessageId) return res.status(400).json({ error: 'Missing reference' });

  let blockedId: string | undefined;

  if (sessionId) {
    const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    blockedId = session.userAId === req.userId ? session.userBId : session.userAId;
  } else if (globalMessageId) {
    const msg = await prisma.globalMessage.findUnique({ where: { id: globalMessageId } });
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.userId === req.userId) return res.status(400).json({ error: 'Cannot block yourself' });
    blockedId = msg.userId;
  }

  if (blockedId) {
    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: req.userId, blockedId } },
      create: { blockerId: req.userId, blockedId },
      update: {}
    });
  }

  return res.json({ message: 'User blocked' });
});

router.get('/blocks', requireAuth, requireAgeVerified, async (req: Request, res: Response) => {
  const blocks = await prisma.block.findMany({
    where: { blockerId: req.userId },
    include: { blocked: { include: { profile: true } } }
  });

  const payload = blocks.map(b => ({
    alias: b.blocked.profile?.alias || 'Unknown',
    createdAt: b.createdAt.toISOString()
  }));

  return res.json(payload);
});

router.delete('/blocks/:alias', requireAuth, requireAgeVerified, async (req: Request, res: Response) => {
  const { alias } = req.params;
  
  const blockedProfile = await prisma.profile.findUnique({ where: { alias } });
  if (!blockedProfile) return res.status(404).json({ error: 'Alias not found' });

  await prisma.block.deleteMany({
    where: {
      blockerId: req.userId,
      blockedId: blockedProfile.userId
    }
  });

  return res.json({ message: 'User unblocked' });
});

router.post('/reports', requireAuth, requireAgeVerified, async (req: Request, res: Response) => {
  const { reason, note, sessionId, globalMessageId } = req.body;
  
  if (!reason) return res.status(400).json({ error: 'Reason is required' });
  if (!sessionId && !globalMessageId) return res.status(400).json({ error: 'Reference required' });

  // Rate limiting (simple placeholder check, real one via Redis)
  const rlKey = `ratelimit:report:${req.userId}`;
  const reqs = await redisClient.incr(rlKey);
  if (reqs === 1) await redisClient.expire(rlKey, 60); // 1 min window
  if (reqs > 5) return res.status(429).json({ error: 'Too many reports, try again later' });

  const user = await prisma.user.findUnique({ where: { id: req.userId }, include: { college: true } });
  if (!user) return res.status(401).json({ error: 'User not found' });

  let reportedId = '';

  if (sessionId) {
    const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    // Check 72h window
    const retentionSettings = user.college.retentionSettings as any;
    const hours = retentionSettings?.recentChatsHours || 72;
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    if (session.startedAt < cutoff) {
      return res.status(400).json({ error: 'Session is too old to report' });
    }
    
    reportedId = session.userAId === req.userId ? session.userBId : session.userAId;

    // Check duplicate
    const existing = await prisma.report.findFirst({
      where: { reporterId: req.userId, sessionId }
    });
    if (existing) {
      return res.json({ message: 'Thank you for your report.' }); // Silent success
    }

    // Lock session
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { locked: true }
    });
    
  } else if (globalMessageId) {
    const msg = await prisma.globalMessage.findUnique({ where: { id: globalMessageId } });
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.userId === req.userId) return res.status(400).json({ error: 'Cannot report yourself' });
    reportedId = msg.userId;
    
    // Check duplicate
    const existing = await prisma.report.findFirst({
      where: { reporterId: req.userId, reason, createdAt: { gte: new Date(Date.now() - 86400000) } }
    });
    if (existing) return res.json({ message: 'Thank you for your report.' });
  }

  const highPriority = ['suspected_minor', 'threats_or_violence', 'sexual_content', 'self_harm'].includes(reason);
  const priority = highPriority ? 1 : 0;

  await prisma.report.create({
    data: {
      reporterId: req.userId,
      reportedId,
      sessionId,
      reason,
      priority,
      status: 'OPEN'
    }
  });

  // Auto-protection check
  const recentReports = await prisma.report.findMany({
    where: {
      reportedId,
      createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) }
    },
    select: { reporterId: true }
  });
  
  const distinctReporters = new Set(recentReports.map(r => r.reporterId));
  if (distinctReporters.size >= 3) {
    // Auto mute
    await prisma.sanction.create({
      data: {
        userId: reportedId,
        type: 'MUTE',
        reason: 'Auto-mute from multiple reports',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });
    await prisma.user.update({
      where: { id: reportedId },
      data: { status: 'MUTED' }
    });
    
    // Disconnect user if online
    const socketId = await redisClient.get(`active_socket:${reportedId}`);
    if (socketId) {
      io.to(socketId).emit('error', { message: 'Your account has been temporarily muted due to multiple reports.', code: 'MUTED' });
    }
  }

  // Confirmation screen response
  return res.json({ message: 'Thank you for your report. Your safety is our priority.' });
});

export default router;
