import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisClient } from '../redis';
import { Request } from 'express';

export const requestOtpLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.call(...args),
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 100 : 5, // Limit each IP to 5 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const email = req.body?.email || 'anonymous';
    const deviceToken = req.headers['x-device-token'] || 'no-device';
    return `rl:otp:${email}:${deviceToken}`;
  },
});

export const reportLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.call(...args),
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'test' ? 100 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id || 'anon';
    const deviceToken = req.headers['x-device-token'] || 'no-device';
    return `rl:report:${userId}:${deviceToken}`;
  },
});
