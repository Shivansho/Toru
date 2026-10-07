import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAdmin, requireRole } from '../middleware/admin';
import { withAudit } from '../services/audit';
import { redisClient } from '../redis';
import { refreshWordlists } from '../services/moderation';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAdmin);
router.use(requireRole('superadmin'));

router.get('/', async (req: Request, res: Response) => {
  const { collegeId } = req.query;

  const where: any = {};
  if (collegeId) where.collegeId = collegeId;

  const lists = await prisma.wordlist.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { college: { select: { name: true } } }
  });

  return res.json(lists);
});

router.post('/', async (req: Request, res: Response) => {
  const { term, kind, collegeId } = req.body; // kind: BLOCK or REVIEW

  if (!term || !kind || !collegeId) return res.status(400).json({ error: 'Missing fields' });

  const performAction = async (tx: any) => {
    return await tx.wordlist.create({ data: { term, kind, collegeId } });
  };

  try {
    const item = await withAudit(prisma, req.adminId as string, 'ADD_WORDLIST_TERM', collegeId, \`Added \${kind} term: \${term}\`, performAction);
    return res.json(item);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const item = await prisma.wordlist.findUnique({ where: { id: req.params.id } });
  if (!item) return res.status(404).json({ error: 'Not found' });

  const performAction = async (tx: any) => {
    return await tx.wordlist.delete({ where: { id: req.params.id } });
  };

  try {
    await withAudit(prisma, req.adminId as string, 'DELETE_WORDLIST_TERM', item.collegeId, \`Deleted \${item.kind} term: \${item.term}\`, performAction);
    return res.json({ message: 'Deleted' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Refresh signal across instances
router.post('/refresh', async (req: Request, res: Response) => {
  // Emit to redis pubsub so all instances reload
  // Wait, does redisClient have pubsub exposed? Typically you need a separate publisher client.
  // We can just call it locally for now if pubsub isn't fully wired for cross-instance broadcasts.
  // Let's do it locally and also simulate a broadcast.
  try {
    await refreshWordlists(prisma);
    await redisClient.publish('moderation:wordlists_refresh', 'refresh');
    return res.json({ message: 'Refresh triggered' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
