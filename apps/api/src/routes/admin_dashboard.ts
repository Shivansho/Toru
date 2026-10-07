import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAdmin, requireRole } from '../middleware/admin';
import { withAudit } from '../services/audit';
import { redisClient } from '../redis';
import { authenticator } from 'otplib';
import crypto from 'crypto';
import { decrypt } from '../crypto';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAdmin);

// --- Overview ---
router.get('/overview', async (req: Request, res: Response) => {
  const cacheKey = 'admin:overview:stats';
  const cached = await redisClient.get(cacheKey);
  if (cached) return res.json(JSON.parse(cached));

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    usersOnline,
    signupsToday,
    signupsWeek,
    activeChats,
    reportsOpen,
    sanctionsIssued,
    deactivated
  ] = await Promise.all([
    redisClient.keys('active_socket:*').then(keys => keys.length),
    prisma.user.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.user.count({ where: { createdAt: { gte: startOfWeek } } }),
    prisma.chatSession.count({ where: { locked: false, startedAt: { gte: startOfDay } } }),
    prisma.report.groupBy({ by: ['priority'], where: { status: 'OPEN' }, _count: true }),
    prisma.sanction.count(),
    prisma.user.count({ where: { status: 'DELETED' } })
  ]);

  // Aggregate message stats (can be heavy, we limit to today)
  const msgsToday = await prisma.sessionMessage.count({ where: { createdAt: { gte: startOfDay } } });
  
  // Median time to resolve (approximate by pulling recent resolved reports)
  const resolved = await prisma.report.findMany({ 
    where: { status: { in: ['RESOLVED', 'DISMISSED'] } },
    select: { createdAt: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 100
  });

  let medianResolutionMins = 0;
  if (resolved.length > 0) {
    const times = resolved.map(r => (r.updatedAt.getTime() - r.createdAt.getTime()) / 60000).sort((a,b)=>a-b);
    medianResolutionMins = times[Math.floor(times.length / 2)];
  }

  const stats = {
    usersOnline, signupsToday, signupsWeek, activeChats, msgsToday,
    reportsByPriority: reportsOpen.map(r => ({ priority: r.priority, count: r._count })),
    sanctionsIssued, deactivated, medianResolutionMins: Math.round(medianResolutionMins)
  };

  await redisClient.set(cacheKey, JSON.stringify(stats), 'EX', 30);
  return res.json(stats);
});

// --- Audit Log ---
router.get('/audit', async (req: Request, res: Response) => {
  const { adminId, action, target, page, format } = req.query;
  const take = 50;
  const skip = page ? (Number(page) - 1) * take : 0;

  const where: any = {};
  if (req.adminRole !== 'superadmin') {
    where.adminId = req.adminId;
  } else {
    if (adminId) where.adminId = adminId;
  }
  
  if (action) where.action = action;
  if (target) where.target = target;

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: format === 'csv' ? 1000 : take,
    skip: format === 'csv' ? 0 : skip,
    include: { admin: { select: { role: true, emailHash: true } } }
  });

  if (format === 'csv') {
    const lines = ['id,adminRole,action,target,reason,createdAt'];
    logs.forEach(l => {
      lines.push(\`\${l.id},\${l.admin?.role},\${l.action},\${l.target},"\${l.reason.replace(/"/g, '""')}",\${l.createdAt.toISOString()}\`);
    });
    res.header('Content-Type', 'text/csv');
    res.attachment('audit_log.csv');
    return res.send(lines.join('\\n'));
  }

  return res.json(logs);
});

// --- Legal Requests ---
router.get('/legal', requireRole('superadmin'), async (req: Request, res: Response) => {
  const requests = await prisma.legalRequest.findMany({ orderBy: { createdAt: 'desc' } });
  return res.json(requests);
});

router.post('/legal', requireRole('superadmin'), async (req: Request, res: Response) => {
  const { source, reference, description, decision } = req.body;
  if (!source || !reference || !description || !decision) return res.status(400).json({ error: 'Missing fields' });

  const performAction = async (tx: any) => {
    return await tx.legalRequest.create({
      data: { source, reference, description, decision, adminId: req.adminId as string }
    });
  };

  try {
    const lr = await withAudit(prisma, req.adminId as string, 'LOG_LEGAL_REQUEST', reference, description, performAction);
    return res.json(lr);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

// --- Break Glass Reveal ---
router.post('/users/:id/reveal/request', requireRole('superadmin'), async (req: Request, res: Response) => {
  const { reason, legalRef, code, totp } = req.body;
  const targetUserId = req.params.id;

  if (!reason) return res.status(400).json({ error: 'Reason required' });

  const admin = await prisma.admin.findUnique({ where: { id: req.adminId } });
  if (!admin) return res.status(403).json({ error: 'Admin not found' });

  // Re-authentication
  if (admin.totpEnabled) {
    if (!totp) return res.status(401).json({ error: 'TOTP required' });
    const isValid = authenticator.verify({ token: totp, secret: admin.totpSecret! });
    if (!isValid) return res.status(401).json({ error: 'Invalid TOTP' });
  } else {
    // Basic OTP via email (stubbed validation for simplicity, requires /admin/auth/request-otp first)
    if (!code) return res.status(401).json({ error: 'OTP required' });
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const otpRec = await prisma.otpCode.findUnique({ where: { emailHash: admin.emailHash as string } });
    if (!otpRec || otpRec.codeHash !== codeHash || otpRec.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Invalid OTP' });
    }
    await prisma.otpCode.delete({ where: { emailHash: admin.emailHash as string } });
  }

  // Count superadmins
  const superadmins = await prisma.admin.count({ where: { role: 'superadmin' } });
  const requiresApproval = superadmins > 1;
  const status = requiresApproval ? 'PENDING' : 'APPROVED';

  const performAction = async (tx: any) => {
    const reqRow = await tx.emailRevealRequest.create({
      data: { targetUserId, requesterId: req.adminId as string, reason, legalRef, status }
    });
    
    if (requiresApproval) {
      // In prod: dispatch email to all other superadmins
      console.log(\`[ALERT] Superadmin \${req.adminId} requested email reveal for \${targetUserId}. Approval required.\`);
    } else {
      console.log(\`[ALERT] Superadmin \${req.adminId} executed unilateral email reveal for \${targetUserId}.\`);
    }
    return reqRow;
  };

  try {
    const requestRow = await withAudit(prisma, req.adminId as string, 'REQUEST_EMAIL_REVEAL', targetUserId, reason, performAction);
    return res.json(requestRow);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/reveals/:id/approve', requireRole('superadmin'), async (req: Request, res: Response) => {
  const reqId = req.params.id;
  const revealReq = await prisma.emailRevealRequest.findUnique({ where: { id: reqId } });
  if (!revealReq || revealReq.status !== 'PENDING') return res.status(404).json({ error: 'Invalid request' });
  
  if (revealReq.requesterId === req.adminId) {
    return res.status(403).json({ error: 'Cannot approve your own request' });
  }

  const performAction = async (tx: any) => {
    return await tx.emailRevealRequest.update({
      where: { id: reqId },
      data: { status: 'APPROVED', approverId: req.adminId as string }
    });
  };

  try {
    await withAudit(prisma, req.adminId as string, 'APPROVE_EMAIL_REVEAL', revealReq.targetUserId, \`Approved request \${reqId}\`, performAction);
    return res.json({ message: 'Approved' });
  } catch(e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Actually view the email once approved
router.get('/users/:id/reveal/view', requireRole('superadmin'), async (req: Request, res: Response) => {
  const targetUserId = req.params.id;
  
  // Find approved unexpired request
  const revealReq = await prisma.emailRevealRequest.findFirst({
    where: { 
      targetUserId, 
      requesterId: req.adminId, 
      status: 'APPROVED', 
      updatedAt: { gte: new Date(Date.now() - 60000) } // 60s expiry
    }
  });

  if (!revealReq) return res.status(403).json({ error: 'No active approved reveal request found or it expired.' });

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) return res.status(404).json({ error: 'User not found' });

  // Mark as EXPIRED immediately so it cannot be viewed again
  await prisma.emailRevealRequest.update({ where: { id: revealReq.id }, data: { status: 'EXPIRED' } });

  const email = decrypt(target.emailEncrypted);
  
  // Final heavy audit
  await prisma.auditLog.create({
    data: {
      adminId: req.adminId as string,
      action: 'VIEWED_REVEALED_EMAIL',
      target: targetUserId,
      reason: \`Displayed under request \${revealReq.id}\`
    }
  });

  return res.json({ email });
});

export default router;
