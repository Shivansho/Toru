import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAdmin, requireRole } from '../middleware/admin';
import { withAudit } from '../services/audit';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAdmin);
router.use(requireRole('superadmin'));

// Validation Schema
const SettingsSchema = z.object({
  domains: z.array(z.string()),
  studentPattern: z.string(),
  staffPattern: z.string(),
  programmeLengths: z.record(z.number()),
  retentionSettings: z.object({
    globalMessages: z.number().min(1),
    chatSessions: z.number().min(1)
  }),
  featureFlags: z.object({
    dailyAliasRotation: z.boolean(),
    totpRequired: z.boolean().optional()
  }),
  matcherSettings: z.object({
    timeoutSecs: z.number().min(5).max(60),
    minPoolSize: z.number().min(2)
  }),
  mustPassSamples: z.array(z.string())
});

router.get('/:id', async (req: Request, res: Response) => {
  const college = await prisma.college.findUnique({
    where: { id: req.params.id },
    include: { settingsVersions: { orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true, adminId: true } } }
  });
  if (!college) return res.status(404).json({ error: 'Not found' });
  return res.json(college);
});

router.post('/:id/settings', async (req: Request, res: Response) => {
  try {
    const data = SettingsSchema.parse(req.body);

    const college = await prisma.college.findUnique({ where: { id: req.params.id } });
    if (!college) return res.status(404).json({ error: 'Not found' });

    // Pattern Tester constraint: ensure mustPassSamples actually match the regex
    const studentRegex = new RegExp(data.studentPattern);
    const staffRegex = new RegExp(data.staffPattern);
    
    for (const sample of data.mustPassSamples) {
      if (!studentRegex.test(sample) && !staffRegex.test(sample)) {
        return res.status(400).json({ error: \`Must pass sample failed: \${sample}\` });
      }
    }

    const performAction = async (tx: any) => {
      // 1. Snapshot current version
      await tx.collegeSettingsVersion.create({
        data: {
          collegeId: college.id,
          adminId: req.adminId as string,
          settings: {
            domains: college.domains,
            studentPattern: college.studentPattern,
            staffPattern: college.staffPattern,
            programmeLengths: college.programmeLengths,
            retentionSettings: college.retentionSettings,
            featureFlags: college.featureFlags,
            matcherSettings: college.matcherSettings,
            mustPassSamples: college.mustPassSamples
          }
        }
      });

      // 2. Apply new settings
      return await tx.college.update({
        where: { id: college.id },
        data: {
          domains: data.domains,
          studentPattern: data.studentPattern,
          staffPattern: data.staffPattern,
          programmeLengths: data.programmeLengths,
          retentionSettings: data.retentionSettings,
          featureFlags: data.featureFlags,
          matcherSettings: data.matcherSettings,
          mustPassSamples: data.mustPassSamples
        }
      });
    };

    const updated = await withAudit(
      prisma, 
      req.adminId as string, 
      'UPDATE_COLLEGE_SETTINGS', 
      college.id, 
      'Settings updated via dashboard', 
      performAction
    );

    return res.json(updated);
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: e.errors });
    }
    return res.status(400).json({ error: e.message });
  }
});

router.post('/:id/revert', async (req: Request, res: Response) => {
  const { versionId } = req.body;
  if (!versionId) return res.status(400).json({ error: 'Version ID required' });

  const version = await prisma.collegeSettingsVersion.findUnique({ where: { id: versionId } });
  if (!version || version.collegeId !== req.params.id) return res.status(404).json({ error: 'Version not found' });

  const oldSettings: any = version.settings;

  const performAction = async (tx: any) => {
    return await tx.college.update({
      where: { id: req.params.id },
      data: {
        domains: oldSettings.domains,
        studentPattern: oldSettings.studentPattern,
        staffPattern: oldSettings.staffPattern,
        programmeLengths: oldSettings.programmeLengths,
        retentionSettings: oldSettings.retentionSettings,
        featureFlags: oldSettings.featureFlags,
        matcherSettings: oldSettings.matcherSettings,
        mustPassSamples: oldSettings.mustPassSamples
      }
    });
  };

  try {
    const reverted = await withAudit(prisma, req.adminId as string, 'REVERT_COLLEGE_SETTINGS', req.params.id, \`Reverted to version \${version.id}\`, performAction);
    return res.json(reverted);
  } catch(e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/test-pattern', (req: Request, res: Response) => {
  const { sample, studentPattern, staffPattern } = req.body;
  
  if (!sample || !studentPattern || !staffPattern) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  let result = 'REJECTED';
  let groups = {};

  try {
    const studentRegex = new RegExp(studentPattern);
    const staffRegex = new RegExp(staffPattern);

    const stuMatch = sample.match(studentRegex);
    if (stuMatch) {
      result = 'STUDENT';
      groups = stuMatch.groups || {};
    } else {
      const staffMatch = sample.match(staffRegex);
      if (staffMatch) {
        result = 'STAFF';
        groups = staffMatch.groups || {};
      }
    }

    return res.json({ result, groups });
  } catch(e: any) {
    return res.status(400).json({ error: e.message });
  }
});

export default router;
