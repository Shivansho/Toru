import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Setting up AuditLog triggers...');
  
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'AuditLog records cannot be updated or deleted';
    END;
    $$ LANGUAGE plpgsql;
  `);

  await prisma.$executeRawUnsafe(`
    DROP TRIGGER IF EXISTS trg_prevent_audit_log_modification ON "AuditLog";
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER trg_prevent_audit_log_modification
    BEFORE UPDATE OR DELETE ON "AuditLog"
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_log_modification();
  `);

  console.log('AuditLog triggers created successfully.');
}

main()
  .catch((e) => {
    console.error('Error setting up triggers:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
