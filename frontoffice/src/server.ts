import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { createServer } from 'http';
import path from 'path';

import { config } from './config';
import { swaggerSpec } from './config/swagger';
import { prisma } from './config/prisma';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { requireSubscriptionsEnabled } from './middleware/auth';

// Routes
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import discoveryRoutes from './routes/discovery.routes';
import paymentsRoutes from './routes/payments.routes';
import adminPaymentsRoutes from './routes/adminPayments.routes';
import webhooksRoutes from './routes/webhooks.routes';
import featuresRoutes from './routes/features.routes';

// Sockets
import { initSockets } from './sockets';

// Jobs planifiés
import { startSubscriptionScheduler } from './jobs/subscriptionLifecycle';

const app = express();
const server = createServer(app);

// ========== SECURITY & MIDDLEWARE ==========

app.use(helmet({ contentSecurityPolicy: false }));

// Static pages
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(cors({ origin: config.corsOrigin, credentials: true }));

app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));
// On conserve le corps brut : la validation IPN PayPal exige de renvoyer le
// message reçu à l'octet près (cf. utils/paypal.ts / payments.service).
const keepRawBody = (req: any, _res: unknown, buf: Buffer) => {
  req.rawBody = buf;
};
app.use(express.json({ limit: '10mb', verify: keepRawBody }));
app.use(express.urlencoded({ extended: true, limit: '10mb', verify: keepRawBody }));

// Global rate limit
app.use(
  '/api/v1',
  rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { statusCode: 429, error: 'Too Many Requests', message: 'Trop de requêtes. Réessayez plus tard.' },
  }),
);

// Stricter limit on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { statusCode: 429, error: 'Too Many Requests', message: "Trop de tentatives. Réessayez dans 15 minutes." },
});

// ========== ROUTES ==========

app.get('/health', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', timestamp: new Date().toISOString(), environment: config.env, version: '1.0.0', service: 'frontoffice' });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'unreachable' });
  }
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.topbar { display: none; } .swagger-ui .info .title { color: #5B2E0C; font-family: Georgia, serif; }',
  customSiteTitle: 'Téranga Frontoffice — Documentation',
  swaggerOptions: { persistAuthorization: true, docExpansion: 'none', filter: true, tryItOutEnabled: true },
}));

app.get('/api-docs.json', (_req, res) => { res.json(swaggerSpec); });

// Webhooks (publics, avant rate-limit)
app.use('/api/v1/payments/webhook', webhooksRoutes);

// API v1
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/users', usersRoutes);
// Interne (backoffice → frontoffice) : monté AVANT les routers génériques
// `/api/v1` dont le `requireAuth` global intercepterait sinon /admin/*.
app.use('/api/v1/admin', adminPaymentsRoutes); // validation virements
app.use('/api/v1', discoveryRoutes);   // /discovery/*, /matches/*
// Tunnel d'abonnement (/pricing, /subscriptions/me, /payments/*) : n'existe
// que si le système est activé. Les webhooks (montés plus haut) et les routes
// admin internes restent ouverts pour régulariser un paiement encore en vol.
app.use('/api/v1', requireSubscriptionsEnabled, paymentsRoutes);
app.use('/api/v1', featuresRoutes);    // /events, /moderation, /trusted-circle, /notifications

// SPA fallback — React Router gère le routing côté client
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use(errorHandler);

// ========== SOCKETS ==========
const io = initSockets(server);
app.set('io', io);

// ========== STARTUP ==========
async function start() {
  try {
    await prisma.$connect();
    logger.info('Database connected');
    // Sans abonnements, il n'y a ni expiration ni rappel de renouvellement à
    // planifier. `runSubscriptionLifecycle()` reste appelable directement.
    if (config.subscriptionsEnabled) startSubscriptionScheduler();
    server.listen(config.port, () => {
      logger.info('Téranga Frontoffice running', { port: config.port, env: config.env });
      console.log(`\n  ✅ Frontoffice API démarré sur ${config.apiBaseUrl}\n  📚 Docs: ${config.apiBaseUrl}/api-docs\n`);
    });
  } catch (err) {
    logger.error('Failed to start', { error: (err as Error).message });
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  logger.info(`${signal} received`);
  server.close(async () => { await prisma.$disconnect(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => { logger.error('Unhandled Rejection', { reason: String(reason) }); });

start();
export { app, server };
