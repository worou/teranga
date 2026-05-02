import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { createServer } from 'http';

import { config } from './config';
import { swaggerSpec } from './config/swagger';
import { prisma } from './config/prisma';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';

// Routes
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import discoveryRoutes from './routes/discovery.routes';
import paymentsRoutes from './routes/payments.routes';
import webhooksRoutes from './routes/webhooks.routes';
import otherRoutes from './routes/other.routes';

// Sockets
import { initSockets } from './sockets';

const app = express();
const server = createServer(app);

// ========== SECURITY & MIDDLEWARE ==========

app.use(
  helmet({
    contentSecurityPolicy: false, // let swagger-ui load its assets
  }),
);

app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  }),
);

app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' })); // biometric selfies are base64
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global rate limit
app.use(
  '/api/v1',
  rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Trop de requêtes. Réessayez plus tard.',
    },
  }),
);

// Stricter limit on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    statusCode: 429,
    error: 'Too Many Requests',
    message: "Trop de tentatives. Réessayez dans 15 minutes.",
  },
});

// ========== ROUTES ==========

// Health check (public)
app.get('/health', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.env,
      version: '1.0.0',
    });
  } catch (err) {
    res.status(503).json({
      status: 'degraded',
      database: 'unreachable',
    });
  }
});

// Swagger UI — The API documentation
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: `
      .topbar { display: none; }
      .swagger-ui .info .title { color: #5B2E0C; font-family: Georgia, serif; }
      .swagger-ui .btn.authorize { background: #B8691A; border-color: #B8691A; color: white; }
      .swagger-ui .btn.authorize:hover { background: #5B2E0C; border-color: #5B2E0C; }
      .swagger-ui .opblock.opblock-post { border-color: #B8691A; background: rgba(212, 144, 96, 0.05); }
      .swagger-ui .opblock.opblock-post .opblock-summary-method { background: #B8691A; }
      .swagger-ui .opblock.opblock-get { border-color: #5B2E0C; background: rgba(91, 46, 12, 0.05); }
      .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #5B2E0C; }
    `,
    customSiteTitle: 'Téranga API — Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      tryItOutEnabled: true,
    },
  }),
);

// OpenAPI JSON spec (for tools like Postman)
app.get('/api-docs.json', (_req, res) => {
  res.json(swaggerSpec);
});

// Webhook routes mounted BEFORE the auth-gated router group (public, must not be rate-limited as aggressively)
app.use('/api/v1/payments/webhook', webhooksRoutes);

// API v1 routes
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1', discoveryRoutes); // /discovery/*, /matches/*
app.use('/api/v1', paymentsRoutes); // /pricing, /subscriptions/me, /payments/*
app.use('/api/v1', otherRoutes); // /events, /moderation, /trusted-circle, /notifications, /admin

// Root
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Téranga API',
    version: '1.0.0',
    docs: `${config.apiBaseUrl}/api-docs`,
    health: `${config.apiBaseUrl}/health`,
  });
});

// 404
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    statusCode: 404,
    error: 'Not Found',
    message: 'Endpoint inconnu',
  });
});

// Error handler (must be last)
app.use(errorHandler);

// ========== SOCKETS ==========

const io = initSockets(server);
app.set('io', io);

// ========== STARTUP ==========

async function start() {
  try {
    await prisma.$connect();
    logger.info('Database connected');

    server.listen(config.port, () => {
      logger.info(`Téranga API running`, {
        port: config.port,
        env: config.env,
        docs: `${config.apiBaseUrl}/api-docs`,
      });
      // eslint-disable-next-line no-console
      console.log(`
  ╔══════════════════════════════════════════════════════╗
  ║                                                      ║
  ║   Téranga API — v1.0.0                               ║
  ║                                                      ║
  ║   🌍 Server:     ${config.apiBaseUrl.padEnd(36)}║
  ║   📚 Swagger:    ${config.apiBaseUrl}/api-docs${' '.repeat(Math.max(0, 26 - config.apiBaseUrl.length))}║
  ║   ❤️  Health:     ${config.apiBaseUrl}/health${' '.repeat(Math.max(0, 28 - config.apiBaseUrl.length))}║
  ║                                                      ║
  ╚══════════════════════════════════════════════════════╝
      `);
    });
  } catch (err) {
    logger.error('Failed to start server', { error: (err as Error).message });
    process.exit(1);
  }
}

// ========== GRACEFUL SHUTDOWN ==========

async function shutdown(signal: string) {
  logger.info(`${signal} received, closing server...`);
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('Server closed');
    process.exit(0);
  });
  // Force exit after 10s
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason: String(reason) });
});

start();

export { app, server };
