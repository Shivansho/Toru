import { PrismaClient, VerificationLevel, UserStatus, ReportStatus } from '@prisma/client';
import { hashEmail, encrypt } from '../apps/api/src/crypto';

const prisma = new PrismaClient();

const DATA_ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY || '12345678901234567890123456789012';
const EMAIL_HASH_PEPPER = process.env.EMAIL_HASH_PEPPER || 'some-secret-pepper';
const ADMIN_BOOTSTRAP_EMAIL = process.env.ADMIN_BOOTSTRAP_EMAIL || 'superadmin@college.example';

async function main() {
  console.log('Seeding database...');

  // 1. Create a Fake College
  const college = await prisma.college.create({
    data: {
      name: 'Fake University of Tech',
      domains: ['college.example'],
      studentPattern: '^[a-z]+\\.[a-z]+_(cs|ee|me)\\.h?\\d{2}@college\\.example$',
      staffPattern: '^[a-z]+\\.[a-z]+@college\\.example$',
      programmeLengths: {
        cs: 4,
        ee: 4,
        me: 4,
        bba: 3,
        arch: 5
      },
      retentionSettings: {
        transcripts: 30,
        globalMessages: 30,
        reports: 365
      },
      status: 'ACTIVE',
      featureFlags: {
        enableTopicRooms: false
      }
    }
  });

  console.log('Created College:', college.name);

  // 2. Create Superadmin
  const adminEmailHash = hashEmail(ADMIN_BOOTSTRAP_EMAIL, EMAIL_HASH_PEPPER);
  const adminEmailEncrypted = encrypt(ADMIN_BOOTSTRAP_EMAIL, DATA_ENCRYPTION_KEY);

  const adminUser = await prisma.user.create({
    data: {
      collegeId: college.id,
      emailHash: adminEmailHash,
      emailEncrypted: adminEmailEncrypted,
      ageVerified: true,
      ageVerifiedAt: new Date(),
      verificationLevel: VerificationLevel.COLLEGE_VERIFIED,
      joiningYear: 2020,
      branch: 'staff',
      programme: 'staff',
      status: UserStatus.ACTIVE,
      profile: {
        create: {
          alias: 'SuperModerator99'
        }
      },
      adminRole: {
        create: {
          role: 'superadmin',
          emailHash: adminEmailHash
        }
      }
    }
  });

  console.log('Created Admin User:', adminUser.id);

  // 3. Create 30 Fake Users
  const branches = ['cs', 'ee', 'me', 'bba', 'arch'];
  const years = [22, 23, 24, 25, 26];
  const users = [];

  for (let i = 1; i <= 30; i++) {
    const branch = branches[i % branches.length];
    const year = years[i % years.length];
    const email = `student${i}.fake_${branch}.${year}@college.example`;
    const emailHash = hashEmail(email, EMAIL_HASH_PEPPER);
    const emailEncrypted = encrypt(email, DATA_ENCRYPTION_KEY);

    const user = await prisma.user.create({
      data: {
        collegeId: college.id,
        emailHash,
        emailEncrypted,
        ageVerified: true,
        ageVerifiedAt: new Date(),
        verificationLevel: VerificationLevel.DECLARED,
        joiningYear: 2000 + year,
        branch,
        programme: branch,
        status: UserStatus.ACTIVE,
        profile: {
          create: {
            alias: `FakeStudent${i}`
          }
        },
        preference: {
          create: {
            yearFilter: []
          }
        }
      }
    });
    users.push(user);
  }

  console.log('Created 30 Fake Users');

  // 4. Create Fake Sessions and Reports
  const session1 = await prisma.chatSession.create({
    data: {
      collegeId: college.id,
      userAId: users[0].id,
      userBId: users[1].id,
      startedAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago
      endedAt: new Date(Date.now() - 1800 * 1000),   // 30 mins ago
      locked: true,
      messages: {
        create: [
          {
            senderId: users[0].id,
            body: encrypt('Hi there, this is a fake message', DATA_ENCRYPTION_KEY)
          },
          {
            senderId: users[1].id,
            body: encrypt('Hello! This is a terrible toxic message.', DATA_ENCRYPTION_KEY)
          }
        ]
      }
    }
  });

  await prisma.report.create({
    data: {
      reporterId: users[0].id,
      reportedId: users[1].id,
      sessionId: session1.id,
      reason: 'toxic behavior',
      priority: 2,
      status: ReportStatus.OPEN,
    }
  });
  
  await prisma.globalMessage.create({
    data: {
      collegeId: college.id,
      userId: users[2].id,
      body: 'Hello global chat!'
    }
  });

  console.log('Created fake sessions and reports');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
