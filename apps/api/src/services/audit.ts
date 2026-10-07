import { PrismaClient, Prisma } from '@prisma/client';

export async function withAudit<T>(
  prisma: PrismaClient | Prisma.TransactionClient,
  adminId: string,
  action: string,
  target: string,
  reason: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if (!reason || reason.trim() === '') {
    throw new Error('Audit reason cannot be empty');
  }

  // We must cast to any or use a runtime check to see if prisma is already a transaction client
  const isTransaction = '$transaction' in prisma;
  
  if (!isTransaction) {
    // It's a normal client, so we create a transaction
    return (prisma as PrismaClient).$transaction(async (tx) => {
      const result = await operation(tx);
      await tx.auditLog.create({
        data: {
          adminId,
          action,
          target,
          reason
        }
      });
      return result;
    });
  } else {
    // It's already in a transaction
    const tx = prisma as Prisma.TransactionClient;
    const result = await operation(tx);
    await tx.auditLog.create({
      data: {
        adminId,
        action,
        target,
        reason
      }
    });
    return result;
  }
}
