import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import rateLimit from 'express-rate-limit';

import { config } from './config';
import { assertProductionConfig } from './config/preflight';
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

// Derrière un reverse proxy, `req.ip` vaut l'adresse du proxy tant qu'on ne le
// déclare pas : la limitation de débit compterait alors tous les
// administrateurs dans un seul seau. Voir `config.trustProxy`.
if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);

// ── Middlewares de sécurité ──────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // CSP désactivé pour servir le dashboard HTML
app.use(cors({
  origin: config.cors.origin.split(','),
  credentials: true,
}));
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Tableau de bord admin (HTML statique) ───────────────
// Servi AVANT la limitation de débit, et non après : la page charge React,
// Babel et ses feuilles de style depuis cette même origine. Comptées dans le
// quota, ces ressources l'épuisaient en quelques rechargements, alors qu'elles
// ne sollicitent ni la base ni l'authentification.
app.use(express.static(path.join(__dirname, '..', 'public')));

// Limitation de débit, restreinte à l'API : c'est elle qu'il s'agit de
// protéger. Le quota est par adresse IP — ce qui suppose `trust proxy`
// correctement réglé, sans quoi il est partagé par tout le monde.
app.use('/api/admin', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez dans 15 minutes.' },
}));

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
// Un serveur qui démarrerait avec une clé de signature publique ne doit pas
// démarrer : un jeton forgé donne ici accès aux membres et aux paiements.
try {
  assertProductionConfig();
} catch (err) {
  const message = (err as Error).message;
  logger.error('Failed to start', { error: message });
  console.error(`
  ❌ ${message}
`);
  process.exit(1);
}

/**
 * Montage sous un sous-chemin (`BASE_URI=/admin`).
 *
 * Derrière Passenger, une application servie sur `/admin` reçoit le chemin
 * COMPLET — `/admin/api/admin/auth/login` — et non le chemin relatif. Sans
 * remontage, toutes les routes tombent en 404 alors que l'application tourne.
 *
 * Vide (le cas en développement, et en production sur un domaine dédié),
 * l'application est servie telle quelle : aucun changement de comportement.
 */
const baseUri = (process.env.BASE_URI || '').replace(/\/+$/, '');
const listener = baseUri ? express().use(baseUri, app) : app;

listener.listen(config.port, () => {
  logger.info(`🚀 Backoffice Téranga démarré`, {
    url: `http://localhost:${config.port}${baseUri}`,
    baseUri: baseUri || '/',
    env: config.env,
  });
});

export default app;
