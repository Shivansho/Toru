import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { redisClient } from '../redis';
import crypto from 'crypto';
import { requireAdmin, requireRole } from '../middleware/admin';
import { authenticator } from 'otplib';
import adminReportsRoutes from './admin_reports';
import adminWordlistsRoutes from './admin_wordlists';
import adminCollegeRoutes from './admin_college';
import adminDashboardRoutes from './admin_dashboard';

const router = Router();
const prisma = new PrismaClient();

// Helper to hash emails
const hashEmail = (email: string) => crypto.createHash('sha256').update(email).digest('hex');

// Auth routes (public)
router.post('/auth/request-otp', async (req: Request, res: Response) => {
  const { email } = req.body;
  const emailHash = hashEmail(email);

  const admin = await prisma.admin.findUnique({ where: { emailHash } });
  
  if (admin) {
    // Generate code
    const code = crypto.randomInt(100000, 999999).toString();
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.otpCode.upsert({
      where: { emailHash },
      update: { codeHash, expiresAt, attempts: 0 },
      create: { emailHash, codeHash, expiresAt, attempts: 0 }
    });

    console.log(`[ADMIN OTP] Code for ${email}: ${code}`);
    // In prod, this would actually send an email
  }

  // Same generic response
  return res.json({ message: 'If the email is an admin, an OTP has been sent.' });
});

router.post('/auth/verify-otp', async (req: Request, res: Response) => {
  const { email, code, totp } = req.body;
  const emailHash = hashEmail(email);

  const otp = await prisma.otpCode.findUnique({ where: { emailHash } });
  if (!otp || otp.expiresAt < new Date()) {
    return res.status(401).json({ error: 'Invalid or expired code' });
  }

  if (otp.attempts >= 5) {
    return res.status(401).json({ error: 'Too many attempts' });
  }

  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  if (otp.codeHash !== codeHash) {
    await prisma.otpCode.update({ where: { emailHash }, data: { attempts: otp.attempts + 1 } });
    return res.status(401).json({ error: 'Invalid or expired code' });
  }

  const admin = await prisma.admin.findUnique({ where: { emailHash } });
  if (!admin) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // TOTP check if enabled
  if (admin.totpEnabled) {
    if (!totp) return res.status(401).json({ error: 'TOTP required' });
    const isValid = authenticator.verify({ token: totp, secret: admin.totpSecret! });
    if (!isValid) return res.status(401).json({ error: 'Invalid TOTP' });
  }

  await prisma.otpCode.delete({ where: { emailHash } });

  // Issue short-lived admin session (1 hour)
  const sessionId = crypto.randomUUID();
  await redisClient.set(`admin_session:${sessionId}`, admin.id, 'EX', 3600);

  res.cookie('adminSessionId', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 3600 * 1000
  });

  return res.json({ message: 'Authenticated', role: admin.role, totpEnabled: admin.totpEnabled });
});

// Admin-protected routes
router.use(requireAdmin);

router.get('/me', async (req: Request, res: Response) => {
  const admin = await prisma.admin.findUnique({ where: { id: req.adminId } });
  return res.json({ id: admin?.id, role: admin?.role, totpEnabled: admin?.totpEnabled });
});

router.post('/totp/enroll', async (req: Request, res: Response) => {
  const admin = await prisma.admin.findUnique({ where: { id: req.adminId } });
  if (admin?.totpEnabled) return res.status(400).json({ error: 'Already enrolled' });

  const secret = authenticator.generateSecret();
  const uri = authenticator.keyuri(admin!.emailHash || 'admin', 'Toru Admin', secret);

  // Temporarily store secret in redis until verified
  await redisClient.set(`totp_enroll:${req.adminId}`, secret, 'EX', 600);

  return res.json({ secret, uri });
});

router.post('/totp/verify', async (req: Request, res: Response) => {
  const { token } = req.body;
  const secret = await redisClient.get(`totp_enroll:${req.adminId}`);
  
  if (!secret) return res.status(400).json({ error: 'Enrollment expired' });

  const isValid = authenticator.verify({ token, secret });
  if (!isValid) return res.status(400).json({ error: 'Invalid code' });

  await prisma.admin.update({
    where: { id: req.adminId },
    data: { totpEnabled: true, totpSecret: secret }
  });

  await redisClient.del(`totp_enroll:${req.adminId}`);
  return res.json({ message: 'TOTP Enrolled' });
});

router.post('/logout', async (req: Request, res: Response) => {
  const sessionId = req.cookies.adminSessionId;
  if (sessionId) {
    await redisClient.del(`admin_session:${sessionId}`);
  }
  res.clearCookie('adminSessionId');
  return res.json({ message: 'Logged out' });
});

// Superadmin only example route
router.get('/settings', requireRole('superadmin'), async (req: Request, res: Response) => {
  return res.json({ message: 'Superadmin settings data' });
});

export default router;

router.use('/reports', adminReportsRoutes);

router.use('/wordlists', adminWordlistsRoutes);

router.use('/colleges', adminCollegeRoutes);

router.use('/dashboard', adminDashboardRoutes);
