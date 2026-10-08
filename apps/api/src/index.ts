import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { setupSocketIO } from './socket';
import { startCronJobs } from './services/jobs';
import { refreshWordlists } from './services/moderation';
import { redisClient } from './redis';
import pino from 'pino';
import pinoHttp from 'pino-http';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth';
import onboardingRoutes from './routes/onboarding';
import adminRoutes from './routes/admin';
import chatRoutes from './routes/chat';
import helmet from 'helmet';
import cors from 'cors';
import { csrfProtection } from './middleware/csrf';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: [
    'req.headers.authorization', 
    'req.headers.cookie',
    'req.body.email',
    'req.body.otp',
    'req.body.body', // for messages
    'req.body.note' // for reports
  ],
});

const app = express();

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    nodeProfilingIntegration(),
  ],
  tracesSampleRate: 1.0, 
  profilesSampleRate: 1.0,
  beforeSend(event) {
    if (event.request) {
      delete event.request.cookies;
      if (event.request.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      if (event.request.data) {
        let data = event.request.data;
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch (e) {}
        }
        if (typeof data === 'object') {
          if (data.email) data.email = '[Scrubbed]';
          if (data.otp) data.otp = '[Scrubbed]';
          if (data.body) data.body = '[Scrubbed]';
          if (data.note) data.note = '[Scrubbed]';
        }
        event.request.data = data;
      }
    }
    return event;
  }
});

export const httpServer = createServer(app);
export const io = setupSocketIO(httpServer);

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.use(csrfProtection);
app.use(pinoHttp({ logger }));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/auth', authRoutes);
app.use('/onboarding', onboardingRoutes);
app.use('/chat', chatRoutes);
app.use('/admin', adminRoutes);

// Central error handler
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  logger.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 4000;

let server: ReturnType<typeof httpServer.listen>;

if (process.env.NODE_ENV !== 'test') {
  server = httpServer.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down gracefully...');
    server.close(() => {
      logger.info('Closed out remaining connections.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

export { app };
