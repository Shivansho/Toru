import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAdmin, requireRole } from '../middleware/admin';
import { withAudit } from '../services/audit';
import { redisClient } from '../redis';
import { refreshWordlists, moderateMessage, HttpClassifier, StubClassifier } from '../services/moderation';

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
  const { term, kind, collegeId } = req.body; 

  if (!term || !kind || !collegeId) return res.status(400).json({ error: 'Missing fields' });

  const performAction = async (tx: any) => {
    return await tx.wordlist.create({ data: { term, kind, collegeId } });
  };

  try {
    const item = await withAudit(prisma, req.adminId as string, 'ADD_WORDLIST_TERM', collegeId, `Added ${kind} term: ${term}`, performAction);
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
    await withAudit(prisma, req.adminId as string, 'DELETE_WORDLIST_TERM', item.collegeId, `Deleted ${item.kind} term: ${item.term}`, performAction);
    return res.json({ message: 'Deleted' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Bulk import (CSV simple format: term,kind)
router.post('/import', async (req: Request, res: Response) => {
  const { collegeId, csv } = req.body;
  if (!collegeId || !csv) return res.status(400).json({ error: 'Missing fields' });

  const lines = csv.split('\n');
  let added = 0;

  const performAction = async (tx: any) => {
    for (const line of lines) {
      if (!line.trim()) continue;
      const [term, kindStr] = line.split(',');
      if (!term || !kindStr) continue;
      const kind = kindStr.trim().toUpperCase();
      if (['BLOCK', 'REVIEW', 'ALLOWED'].includes(kind)) {
        await tx.wordlist.create({ data: { term: term.trim(), kind, collegeId } });
        added++;
      }
    }
  };

  try {
    await withAudit(prisma, req.adminId as string, 'IMPORT_WORDLIST', collegeId, `Imported ${added} terms`, performAction);
    return res.json({ message: 'Imported', added });
  } catch(e: any) {
    return res.status(400).json({ error: e.message });
  }
});

// Test Pipeline
router.post('/test', async (req: Request, res: Response) => {
  const { text, collegeId } = req.body;
  if (!text || !collegeId) return res.status(400).json({ error: 'Missing fields' });
  
  // Use stub for predictable testing
  const classifier = new StubClassifier();
  const result = await moderateMessage(text, collegeId, classifier);
  return res.json(result);
});

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    await refreshWordlists(prisma);
    await redisClient.publish('moderation:wordlists_refresh', 'refresh');
    return res.json({ message: 'Refresh triggered' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
