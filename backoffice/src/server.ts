import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import rateLimit from 'express-rate-limit';

import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

// ── Routes ──────────────────────────────────────────────
import authRouter from './routes/auth.routes';
import usersRouter from './routes/users.routes';
import statsRouter from './routes/stats.routes';
import subscriptionsRouter from './routes/subscriptions.routes';
import paymentsRouter from './routes/payments.routes';
import reportsRouter from './routes/reports.routes';
import adminsRouter from './routes/admins.routes';

const app = express();

// ── Middlewares de sécurité ──────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // CSP désactivé pour servir le dashboard HTML
app.use(cors({
  origin: config.cors.origin.split(','),
  credentials: true,
}));
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting global
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez dans 15 minutes.' },
}));

// ── Tableau de bord admin (HTML statique) ───────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── API Admin ────────────────────────────────────────────
app.use('/api/admin/auth',  authRouter);
app.use('/api/admin/users', usersRouter);
app.use('/api/admin/stats', statsRouter);
app.use('/api/admin/subscriptions', subscriptionsRouter);
app.use('/api/admin/payments', paymentsRouter);
app.use('/api/admin/reports', reportsRouter);
app.use('/api/admin/admins', adminsRouter);

// ── Health check ─────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'teranga-backoffice', env: config.env });
});

// ── SPA fallback : toutes les routes inconnues → index.html ──
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Gestion d'erreurs ────────────────────────────────────
app.use(errorHandler);

// ── Démarrage ────────────────────────────────────────────
app.listen(config.port, () => {
  logger.info(`🚀 Backoffice Téranga démarré`, {
    url: `http://localhost:${config.port}`,
    env: config.env,
  });
});

export default app;
