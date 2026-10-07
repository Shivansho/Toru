import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisClient } from '../redis';
import { Request } from 'express';

export const requestOtpLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.call(...args),
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Attempt to rate limit by email hash if provided in body, else fallback to IP
    const emailHash = req.body?.emailHash || '';
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return `rl:otp:${ip}:${emailHash}`;
  },
});
