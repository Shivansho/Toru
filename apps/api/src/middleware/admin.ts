import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { redisClient } from '../redis';

const prisma = new PrismaClient();

// Add adminRole to Request type
declare module 'express-serve-static-core' {
  interface Request {
    adminRole?: string;
    adminId?: string;
  }
}

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const adminSessionId = req.cookies.adminSessionId;
  if (!adminSessionId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const adminId = await redisClient.get(\`admin_session:\${adminSessionId}\`);
    if (!adminId) {
      return res.status(401).json({ error: 'Session expired' });
    }

    const admin = await prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin) {
      return res.status(403).json({ error: 'Admin not found' });
    }

    // Renew idle timeout
    await redisClient.expire(\`admin_session:\${adminSessionId}\`, 3600);

    req.adminId = admin.id;
    req.adminRole = admin.role;
    next();
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
};

export const requireRole = (role: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.adminRole !== role) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
};
