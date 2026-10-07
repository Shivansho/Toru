import { beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { redisClient } from './src/redis';

const prisma = new PrismaClient();

beforeAll(async () => {
  const tablenames = await prisma.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
  for (const { tablename } of tablenames) {
    if (tablename !== '_prisma_migrations') {
      try {
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" CASCADE;`);
      } catch (e) {}
    }
  }
  await redisClient.flushdb();
});
