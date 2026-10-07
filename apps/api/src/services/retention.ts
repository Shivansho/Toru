import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function runRetentionJob() {
  const colleges = await prisma.college.findMany();
  
  for (const college of colleges) {
    const settings = (college.retentionSettings || {}) as any;
    
    // Global messages retention (default 30 days)
    const globalDays = settings.globalMessages || 30;
    const globalCutoff = new Date(Date.now() - globalDays * 24 * 60 * 60 * 1000);
    
    await prisma.globalMessage.deleteMany({
      where: {
        collegeId: college.id,
        createdAt: { lt: globalCutoff }
      }
    });

    // Chat sessions retention (default 3 days for transcripts unless locked)
    const sessionDays = settings.chatSessions || 3;
    const sessionCutoff = new Date(Date.now() - sessionDays * 24 * 60 * 60 * 1000);

    // Delete session messages where session is older than cutoff AND NOT locked
    // Also delete the sessions themselves
    
    const sessionsToDelete = await prisma.chatSession.findMany({
      where: {
        collegeId: college.id,
        startedAt: { lt: sessionCutoff },
        locked: false // DO NOT delete locked transcripts!
      },
      select: { id: true }
    });

    const sessionIds = sessionsToDelete.map(s => s.id);

    if (sessionIds.length > 0) {
      await prisma.sessionMessage.deleteMany({
        where: { sessionId: { in: sessionIds } }
      });
      await prisma.chatSession.deleteMany({
        where: { id: { in: sessionIds } }
      });
    }
  }
}
