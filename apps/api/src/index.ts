import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { setupSocketIO } from './socket';
import { startCronJobs } from './services/jobs';
import pino from 'pino';
import pinoHttp from 'pino-http';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth';
import onboardingRoutes from './routes/onboarding';
import chatRoutes from './routes/chat';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});

const app = express();
export const httpServer = createServer(app);
export const io = setupSocketIO(httpServer);

app.use(express.json());
app.use(cookieParser());
app.use(pinoHttp({ logger }));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/auth', authRoutes);
app.use('/onboarding', onboardingRoutes);
app.use('/chat', chatRoutes);

// Central error handler
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  logger.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 4000;

let server: ReturnType<typeof httpServer.listen>;

if (process.env.NODE_ENV !== 'test') {
  server = httpServer.listen(PORT, () => {
    logger.info(\`Server running on port \${PORT}\`);
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
