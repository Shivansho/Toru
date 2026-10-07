import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireAgeVerified } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// History: on join, load the last 50 messages with cursor-based pagination for older ones.
// Never include user ids or emails: only alias and timestamp.
router.get('/global/history', requireAuth, requireAgeVerified, async (req: Request, res: Response) => {
  const { cursor } = req.query;
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(401).json({ error: 'User not found' });

  const messages = await prisma.globalMessage.findMany({
    where: { 
      collegeId: user.collegeId,
      hidden: false 
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

// Stub for reporting
router.post('/report', requireAuth, requireAgeVerified, async (req: Request, res: Response) => {
  // Stub
  return res.json({ message: 'Report submitted' });
});

// Stub for blocking
router.post('/block', requireAuth, requireAgeVerified, async (req: Request, res: Response) => {
  // Stub
  return res.json({ message: 'User blocked' });
});

export default router;
