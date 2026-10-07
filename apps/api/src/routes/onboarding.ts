import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { redisClient } from '../redis';
import { validateYearCorrection } from '@shared/core';

const router = Router();
const prisma = new PrismaClient();

// List of words for alias generation
const ADJECTIVES = ['Brave', 'Clever', 'Swift', 'Silent', 'Mighty', 'Fierce', 'Gentle', 'Wandering'];
const ANIMALS = ['Tiger', 'Wolf', 'Fox', 'Eagle', 'Bear', 'Falcon', 'Panther', 'Owl'];

function generateAlias() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const num = Math.floor(Math.random() * 1000);
  return `${adj}${animal}${num}`;
}

router.post('/age-check', requireAuth, async (req: Request, res: Response) => {
  const { dob, deviceHash } = req.body;
  if (!dob) return res.status(400).json({ error: 'DOB required' });

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(401).json({ error: 'User not found' });
  
  if (user.ageVerified) {
    return res.status(400).json({ error: 'Age already verified' });
  }

  // Check cooldown
  const cooldownKey1 = `cooldown:age:${user.emailHash}`;
  const cooldownKey2 = deviceHash ? `cooldown:age:${deviceHash}` : null;
  const c1 = await redisClient.get(cooldownKey1);
  const c2 = cooldownKey2 ? await redisClient.get(cooldownKey2) : null;
  
  if (c1 || c2) {
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }

  // Compute age server side
  const dobDate = new Date(dob);
  const now = new Date();
  
  // Calculate exact age
  let age = now.getUTCFullYear() - dobDate.getUTCFullYear();
  const m = now.getUTCMonth() - dobDate.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dobDate.getUTCDate())) {
    age--;
  }

  if (age < 18) {
    // Under 18
    await redisClient.set(cooldownKey1, '1', 'EX', 24 * 60 * 60); // 24h cooldown
    if (cooldownKey2) await redisClient.set(cooldownKey2, '1', 'EX', 24 * 60 * 60);
    return res.json({ message: 'Based on the provided information, we cannot activate this account.' }); // neutral message
  }

  await prisma.user.update({
    where: { id: req.userId },
    data: {
      ageVerified: true,
      ageVerifiedAt: new Date()
    }
  });

  return res.json({ message: 'Age verified successfully' });
});

router.post('/alias', requireAuth, async (req: Request, res: Response) => {
  let profile = await prisma.profile.findUnique({ where: { userId: req.userId } });
  
  // Requirement: Add a setting to regenerate it. If it already exists, regenerate.
  let uniqueAlias = '';
  let isUnique = false;
  let attempts = 0;
  
  while (!isUnique && attempts < 10) {
    uniqueAlias = generateAlias();
    const existing = await prisma.profile.findUnique({ where: { alias: uniqueAlias } });
    if (!existing) isUnique = true;
    attempts++;
  }

  if (!isUnique) {
    return res.status(500).json({ error: 'Failed to generate unique alias' });
  }

  if (profile) {
    profile = await prisma.profile.update({
      where: { userId: req.userId },
      data: { alias: uniqueAlias, aliasRotatedAt: new Date() }
    });
  } else {
    profile = await prisma.profile.create({
      data: {
        userId: req.userId!,
        alias: uniqueAlias
      }
    });
  }

  return res.json({ alias: profile.alias });
});

router.post('/consent', requireAuth, async (req: Request, res: Response) => {
  const { document, version } = req.body;
  if (!document || !version) {
    return res.status(400).json({ error: 'Missing document or version' });
  }

  await prisma.consent.create({
    data: {
      userId: req.userId!,
      document,
      version
    }
  });

  return res.json({ message: 'Consent recorded' });
});

router.post('/year', requireAuth, async (req: Request, res: Response) => {
  const { correctedYear } = req.body;
  if (typeof correctedYear !== 'number') {
    return res.status(400).json({ error: 'Invalid year' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId }, include: { college: true } });
  if (!user) return res.status(401).json({ error: 'User not found' });

  if (user.yearCorrected) {
    return res.status(400).json({ error: 'Year already corrected once' });
  }

  const result = validateYearCorrection(correctedYear, user.branch, user.college as any, new Date());
  
  if (result.status !== 'active') {
    return res.status(400).json({ error: 'Invalid corrected year' });
  }

  await prisma.user.update({
    where: { id: req.userId },
    data: {
      joiningYear: new Date().getUTCFullYear() - correctedYear + 1, // Store the implied joining year based on current active year
      yearCorrected: true
    }
  });

  return res.json({ message: 'Year corrected' });
});

export default router;
