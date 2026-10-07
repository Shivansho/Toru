import crypto from 'crypto';
import cryptoRandomString from 'crypto-random-string';
import { redisClient } from '../redis';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SESSION_EXPIRY = 60 * 60 * 2; // 2 hours

export function generateOtp(): string {
  return cryptoRandomString({ length: 6, type: 'numeric' });
}

export function hashOtp(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export function verifyOtpHash(storedHash: string, providedCode: string): boolean {
  const attemptHash = hashOtp(providedCode);
  const buf1 = Buffer.from(storedHash, 'hex');
  const buf2 = Buffer.from(attemptHash, 'hex');
  if (buf1.length !== buf2.length) return false;
  return crypto.timingSafeEqual(buf1, buf2);
}

export async function createSession(userId: string): Promise<string> {
  const sessionId = crypto.randomUUID();
  // Store session mapping
  await redisClient.set(`session:${sessionId}`, userId, 'EX', SESSION_EXPIRY);
  // Track user's active sessions for logout-all
  await redisClient.sadd(`user_sessions:${userId}`, sessionId);
  await redisClient.expire(`user_sessions:${userId}`, SESSION_EXPIRY);
  return sessionId;
}

export async function destroySession(userId: string, sessionId: string) {
  await redisClient.del(`session:${sessionId}`);
  await redisClient.srem(`user_sessions:${userId}`, sessionId);
}

export async function destroyAllUserSessions(userId: string) {
  const sessions = await redisClient.smembers(`user_sessions:${userId}`);
  if (sessions.length > 0) {
    const keys = sessions.map((s) => `session:${s}`);
    await redisClient.del(...keys);
  }
  await redisClient.del(`user_sessions:${userId}`);
}

export async function getSessionUser(sessionId: string): Promise<string | null> {
  return await redisClient.get(`session:${sessionId}`);
}
