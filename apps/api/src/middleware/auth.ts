import { Request, Response, NextFunction } from 'express';
import { getSessionUser } from '../services/auth';
import { PrismaClient, UserStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Add session userId to Request type
declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.cookies?.sessionId;
  if (!sessionId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = await getSessionUser(sessionId);
  if (!userId) {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }

  req.userId = userId;
  next();
}

export async function requireAgeVerified(req: Request, res: Response, next: NextFunction) {
  if (!req.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user || !user.ageVerified) {
    return res.status(403).json({ error: 'Age verification required' });
  }

  // Also check if user is banned/suspended
  if (['BANNED', 'SUSPENDED', 'DELETED', 'GRADUATED'].includes(user.status)) {
    return res.status(403).json({ error: 'Account unavailable' });
  }

  next();
}
