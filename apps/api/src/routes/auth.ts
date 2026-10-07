import { Router, Request, Response } from 'express';
import { PrismaClient, UserStatus } from '@prisma/client';
import { parseCollegeEmail } from '@shared/core';
import { hashEmail, encrypt } from '../crypto';
import { sendOtpEmail } from '../mailer';
import { generateOtp, hashOtp, verifyOtpHash, createSession, destroySession, destroyAllUserSessions } from '../services/auth';
import { requestOtpLimiter } from '../middleware/rateLimiter';
import { requireAuth } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();
const DATA_ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY || '12345678901234567890123456789012';
const EMAIL_HASH_PEPPER = process.env.EMAIL_HASH_PEPPER || 'some-secret-pepper';

// Pre-fill emailHash in req.body for rate limiter if email exists
router.use('/request-otp', (req, res, next) => {
  if (req.body?.email) {
    req.body.emailHash = hashEmail(req.body.email, EMAIL_HASH_PEPPER);
  }
  next();
});

router.post('/request-otp', requestOtpLimiter, async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email required' });
  }

  // Generic response to avoid discovering accounts
  const genericSuccess = { message: 'If the email belongs to an active student, a code has been sent.' };

  const emailHash = hashEmail(email, EMAIL_HASH_PEPPER);
  
  // We need the college config. Find active college. Assuming single college for now, or match by domain.
  const domain = email.split('@')[1];
  const college = await prisma.college.findFirst({
    where: { domains: { has: domain }, status: 'ACTIVE' }
  });

  if (!college) {
    return res.json(genericSuccess);
  }

  const parsed = parseCollegeEmail(email, college as any, new Date());
  
  if (parsed.type !== 'student') {
    return res.json(genericSuccess);
  }

  // Check if user exists and is banned/deleted/graduated
  const user = await prisma.user.findUnique({ where: { emailHash } });
  if (user && ['BANNED', 'SUSPENDED', 'DELETED', 'GRADUATED'].includes(user.status)) {
    return res.json(genericSuccess); // Pretend we sent it, or should we? The requirements: "Block users with status BANNED... with a neutral message."
    // Actually the requirement says: "Block users with status BANNED, SUSPENDED or DELETED with a neutral message."
    // This can be returned safely here, but to avoid discovery, we'll just return the generic success and not send email.
  }

  const otp = generateOtp();
  const hashedCode = hashOtp(otp);

  await prisma.otpCode.upsert({
    where: { emailHash },
    update: {
      codeHash: hashedCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      attempts: 0
    },
    create: {
      emailHash,
      codeHash: hashedCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    }
  });

  await sendOtpEmail(email, otp);

  return res.json(genericSuccess);
});

router.post('/verify-otp', requestOtpLimiter, async (req: Request, res: Response) => {
  const { email, code } = req.body;
  if (!email || !code || typeof email !== 'string' || typeof code !== 'string') {
    return res.status(400).json({ error: 'Email and code required' });
  }

  const emailHash = hashEmail(email, EMAIL_HASH_PEPPER);
  const otpRecord = await prisma.otpCode.findUnique({ where: { emailHash } });

  if (!otpRecord) {
    return res.status(401).json({ error: 'Invalid or expired code' });
  }

  if (otpRecord.expiresAt < new Date()) {
    await prisma.otpCode.delete({ where: { emailHash } });
    return res.status(401).json({ error: 'Invalid or expired code' });
  }

  if (otpRecord.attempts >= 5) {
    await prisma.otpCode.delete({ where: { emailHash } });
    return res.status(401).json({ error: 'Maximum attempts exceeded' });
  }

  const isValid = verifyOtpHash(otpRecord.codeHash, code);
  if (!isValid) {
    await prisma.otpCode.update({
      where: { emailHash },
      data: { attempts: { increment: 1 } }
    });
    return res.status(401).json({ error: 'Invalid or expired code' });
  }

  // OTP verified, delete it
  await prisma.otpCode.delete({ where: { emailHash } });

  // Get college info again for upsert logic
  const domain = email.split('@')[1];
  const college = await prisma.college.findFirst({
    where: { domains: { has: domain } }
  });

  if (!college) {
    return res.status(400).json({ error: 'Configuration error' });
  }

  const parsed = parseCollegeEmail(email, college as any, new Date());
  if (parsed.type !== 'student') {
    return res.status(400).json({ error: 'Invalid email' }); // Should not happen since we checked during request
  }

  let user = await prisma.user.findUnique({ where: { emailHash } });

  if (user && ['BANNED', 'SUSPENDED', 'DELETED', 'GRADUATED'].includes(user.status)) {
    return res.status(403).json({ error: 'Account unavailable' });
  }

  if (!user) {
    user = await prisma.user.create({
      data: {
        collegeId: college.id,
        emailEncrypted: encrypt(email, DATA_ENCRYPTION_KEY),
        emailHash,
        joiningYear: parsed.joiningYear,
        branch: parsed.branch,
        programme: parsed.programme,
      }
    });
  }

  const sessionId = await createSession(user.id);
  
  res.cookie('sessionId', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 2 * 60 * 60 * 1000 // 2 hours
  });

  return res.json({ message: 'Logged in successfully' });
});

router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  const sessionId = req.cookies.sessionId;
  await destroySession(req.userId!, sessionId);
  res.clearCookie('sessionId');
  return res.json({ message: 'Logged out' });
});

router.post('/logout-all', requireAuth, async (req: Request, res: Response) => {
  await destroyAllUserSessions(req.userId!);
  res.clearCookie('sessionId');
  return res.json({ message: 'Logged out of all sessions' });
});


router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    include: { profile: true, consents: true }
  });
  if (!user) return res.status(401).json({ error: 'User not found' });

  return res.json({
    id: user.id,
    ageVerified: user.ageVerified,
    yearCorrected: user.yearCorrected,
    status: user.status,
    hasProfile: !!user.profile,
    hasConsented: user.consents.length > 0
  });
});

export default router;
