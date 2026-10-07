import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { redisClient } from '../redis';

const prisma = new PrismaClient();

export const SAFETY_PERCENTAGE = 0.50; // Max 50% can be deleted per run

export async function runRetentionJob(dryRun = false, force = false): Promise<any> {
  // Try to acquire distributed lock
  const lockKey = 'job:retention:lock';
  const acquired = await redisClient.set(lockKey, 'locked', 'EX', 300, 'NX');
  if (!acquired) {
    return { status: 'LOCKED', message: 'Job already running' };
  }

  const jobRun = await prisma.jobRun.create({
    data: { jobName: 'retention', status: dryRun ? 'DRY_RUN' : 'RUNNING' }
  });

  let totalDeleted = 0;
  const report = [];

  try {
    const colleges = await prisma.college.findMany();

    // 1. Expired OTP codes
    const otpTotal = await prisma.otpCode.count();
    const otpExpired = await prisma.otpCode.count({ where: { expiresAt: { lt: new Date() } } });
    if (otpExpired > 0) {
      if (!force && otpTotal > 0 && (otpExpired / otpTotal) > SAFETY_PERCENTAGE) {
        throw new Error('Safety limit exceeded for OTP codes');
      }
      report.push({ type: 'OTP', count: otpExpired });
      if (!dryRun) {
        await prisma.otpCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });
        totalDeleted += otpExpired;
      }
    }

    // 2. Expired sanctions
    const sancTotal = await prisma.sanction.count();
    const sancExpired = await prisma.sanction.count({ where: { expiresAt: { lt: new Date() } } });
    if (sancExpired > 0) {
      if (!force && sancTotal > 0 && (sancExpired / sancTotal) > SAFETY_PERCENTAGE) {
        throw new Error('Safety limit exceeded for Sanctions');
      }
      report.push({ type: 'Sanctions', count: sancExpired });
      if (!dryRun) {
        // Find users to lift status from MUTED/SUSPENDED back to ACTIVE if their last sanction expired
        const expiredSanctions = await prisma.sanction.findMany({ where: { expiresAt: { lt: new Date() } } });
        const userIds = expiredSanctions.map(s => s.userId);
        await prisma.user.updateMany({ where: { id: { in: userIds }, status: { in: ['MUTED', 'SUSPENDED'] } }, data: { status: 'ACTIVE' } });
        
        await prisma.sanction.deleteMany({ where: { expiresAt: { lt: new Date() } } });
        totalDeleted += sancExpired;
      }
    }

    // Per college retentions
    for (const college of colleges) {
      const settings = (college.retentionSettings || {}) as any;
      
      // Global messages
      const globalDays = settings.globalMessages || 30;
      const globalCutoff = new Date(Date.now() - globalDays * 24 * 60 * 60 * 1000);
      
      const globalTotal = await prisma.globalMessage.count({ where: { collegeId: college.id } });
      const globalTargets = await prisma.globalMessage.findMany({
        where: {
          collegeId: college.id,
          createdAt: { lt: globalCutoff }
        },
        include: { reports: true }
      });
      // Filter out hidden ones attached to open reports
      const globalToDelete = globalTargets.filter(g => {
        if (!g.hidden) return true;
        return !g.reports.some(r => r.status === 'OPEN' || r.status === 'IN_REVIEW');
      }).map(g => g.id);

      if (globalToDelete.length > 0) {
         if (!force && globalTotal > 0 && (globalToDelete.length / globalTotal) > SAFETY_PERCENTAGE) {
           throw new Error(`Safety limit exceeded for GlobalMessages college ${college.id}`);
         }
         report.push({ type: 'GlobalMessage', college: college.id, count: globalToDelete.length });
         if (!dryRun) {
           await prisma.globalMessage.deleteMany({ where: { id: { in: globalToDelete } } });
           totalDeleted += globalToDelete.length;
         }
      }

      // Chat sessions
      const sessionDays = settings.chatSessions || 3;
      const sessionCutoff = new Date(Date.now() - sessionDays * 24 * 60 * 60 * 1000);

      const sessionTotal = await prisma.chatSession.count({ where: { collegeId: college.id } });
      const sessionTargets = await prisma.chatSession.findMany({
        where: {
          collegeId: college.id,
          startedAt: { lt: sessionCutoff },
          locked: false
        },
        select: { id: true }
      });
      const sessionIds = sessionTargets.map(s => s.id);

      if (sessionIds.length > 0) {
        if (!force && sessionTotal > 0 && (sessionIds.length / sessionTotal) > SAFETY_PERCENTAGE) {
           throw new Error(`Safety limit exceeded for ChatSession college ${college.id}`);
        }
        
        const messagesCount = await prisma.sessionMessage.count({ where: { sessionId: { in: sessionIds } } });
        
        report.push({ type: 'ChatSession', college: college.id, count: sessionIds.length, messagesCount });
        
        if (!dryRun) {
          await prisma.sessionMessage.deleteMany({ where: { sessionId: { in: sessionIds } } });
          await prisma.chatSession.deleteMany({ where: { id: { in: sessionIds } } });
          totalDeleted += sessionIds.length;
        }
      }
      
      // Alias rotation
      const flags = (college.featureFlags || {}) as any;
      if (flags.dailyAliasRotation) {
        // Rotate aliases older than 24h
        const aliasCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const aliases = await prisma.profile.findMany({
          where: { user: { collegeId: college.id }, aliasRotatedAt: { lt: aliasCutoff } }
        });
        if (aliases.length > 0) {
          report.push({ type: 'AliasRotation', college: college.id, count: aliases.length });
          if (!dryRun) {
            for (const profile of aliases) {
              const newAlias = `Alias_${Math.floor(Math.random() * 9000) + 1000}`; // Simplified generator
              await prisma.profile.update({
                where: { userId: profile.userId },
                data: { alias: newAlias, aliasRotatedAt: new Date() }
              });
            }
          }
        }
      }
    }

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: { status: 'COMPLETED', completedAt: new Date(), recordsDeleted: totalDeleted }
    });

    await redisClient.del(lockKey);
    return { status: dryRun ? 'DRY_RUN' : 'COMPLETED', report, totalDeleted };

  } catch (error: any) {
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: { status: 'FAILED', completedAt: new Date(), error: error.message }
    });
    await redisClient.del(lockKey);
    throw error;
  }
}

export function startCronJobs() {
  // Run every hour
  cron.schedule('0 * * * *', () => {
    runRetentionJob().catch(console.error);
  });
}
