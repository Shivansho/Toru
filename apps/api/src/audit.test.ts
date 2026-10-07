import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
let hasDb = false;

describe('AuditLog Constraints', () => {
  beforeAll(async () => {
    try {
      await prisma.$connect();
      hasDb = true;
    } catch (_e) {
      console.warn('Database not available. Skipping AuditLog tests.');
      hasDb = false;
    }
  });

  afterAll(async () => {
    if (hasDb) {
      await prisma.$disconnect();
    }
  });

  it('prevents update on AuditLog', async () => {
    if (!hasDb) {
      console.log('Skipping test as database is not reachable.');
      return;
    }
    
    // Setup a fake admin for the log
    const college = await prisma.college.create({
      data: { name: 'Test', domains: [], studentPattern: '', staffPattern: '', programmeLengths: {}, retentionSettings: {}, status: 'ACTIVE', featureFlags: {} }
    });
    const adminUser = await prisma.user.create({
      data: {
        collegeId: college.id, emailHash: 'hash', emailEncrypted: 'enc', joiningYear: 2020, branch: 'test', programme: 'test'
      }
    });
    const admin = await prisma.admin.create({
      data: { userId: adminUser.id, role: 'superadmin' }
    });

    const log = await prisma.auditLog.create({
      data: {
        adminId: admin.id,
        action: 'TEST_ACTION',
        target: 'TEST_TARGET',
        reason: 'Testing'
      }
    });

    // Attempt update
    await expect(
      prisma.auditLog.update({
        where: { id: log.id },
        data: { reason: 'Updated reason' }
      })
    ).rejects.toThrow(/AuditLog records cannot be updated or deleted/);
    
    // Attempt delete
    await expect(
      prisma.auditLog.delete({
        where: { id: log.id }
      })
    ).rejects.toThrow(/AuditLog records cannot be updated or deleted/);
    
    // Cleanup
    await prisma.$executeRawUnsafe(`ALTER TABLE "AuditLog" DISABLE TRIGGER trg_prevent_audit_log_modification;`);
    await prisma.auditLog.delete({ where: { id: log.id } });
    await prisma.admin.delete({ where: { id: admin.id } });
    await prisma.user.delete({ where: { id: adminUser.id } });
    await prisma.college.delete({ where: { id: college.id } });
    await prisma.$executeRawUnsafe(`ALTER TABLE "AuditLog" ENABLE TRIGGER trg_prevent_audit_log_modification;`);
  });
});
