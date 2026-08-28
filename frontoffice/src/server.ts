import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { createServer } from 'http';
import path from 'path';

import { config } from './config';
import { assertProductionConfig, warnProductionConfig } from './config/preflight';
import { swaggerSpec } from './config/swagger';
import { prisma } from './config/prisma';
import { uploadDir } from './config/upload';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';

// Routes
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import discoveryRoutes from './routes/discovery.routes';
import conversationsRoutes from './routes/conversations.routes';
import paymentsRoutes from './routes/payments.routes';
import adminPaymentsRoutes from './routes/adminPayments.routes';
import webhooksRoutes from './routes/webhooks.routes';
import featuresRoutes from './routes/features.routes';

// Sockets
import { initSockets } from './sockets';

// Jobs planifiés
import { startSubscriptionScheduler } from './jobs/subscriptionLifecycle';

// Version réellement déployée, plutôt qu'une constante figée qui ne suit
// aucune livraison.
const APP_VERSION: string = require('../package.json').version;

const app = express();
const server = createServer(app);

// ========== SECURITY & MIDDLEWARE ==========

// Derrière un reverse proxy, `req.ip` vaut l'adresse du proxy tant qu'on ne le
// déclare pas : la limitation de débit compterait alors tous les utilisateurs
// dans un seul seau. Voir `config.trustProxy` pour le choix du défaut.
if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);

// HSTS n'est envoyé QUE si un certificat valide est en place (HSTS_ENABLED).
//
// Cet en-tête ordonne au navigateur de n'utiliser que HTTPS pendant six mois.
// Tant que le site n'a qu'un certificat auto-signé, il ne peut qu'enfermer les
// visiteurs sur une adresse qui échoue avec ERR_CERT_AUTHORITY_INVALID, sans
// possibilité de revenir en HTTP.
//
// Le risque est différé plutôt qu'immédiat : un navigateur ignore HSTS reçu
// sur une connexion au certificat invalide. Mais il suffit d'un certificat
// valide, puis d'une expiration ou d'un renouvellement manqué, pour que le
// blocage devienne total et dure jusqu'à l'expiration du max-age.
//
// À remettre à `true` une fois le certificat Let's Encrypt émis — c'est alors
// une protection utile contre l'interception.
app.use(
  helmet({
    contentSecurityPolicy: false,
    hsts: config.hstsEnabled ? undefined : false,
  }),
);

// Static pages
// Photos de membres : servies depuis `uploads/`, en dehors de `public/` que
// `vite build` vide à chaque construction. Monté avant le statique du build
// pour que l'URL `/uploads/...` ne dépende pas de la sortie de compilation.
app.use(
  '/uploads',
  express.static(uploadDir, {
    dotfiles: 'ignore',
    // Contenu déposé par des membres : jamais interprété comme du code. Helmet
    // pose déjà `X-Content-Type-Options: nosniff` globalement.
    index: false,
    maxAge: '7d',
  }),
);

// Sortie de `vite build` (SPA + assets).
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
    res.json({ status: 'ok', timestamp: new Date().toISOString(), environment: config.env, version: APP_VERSION, service: 'frontoffice' });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'unreachable' });
  }
});

// Documentation interactive. Publiée hors production seulement : elle décrit
// toute la surface de l'API, jeton compris, et son bouton « try it out »
// exécute de vraies requêtes. ENABLE_API_DOCS=true la rouvre sur un
// environnement de recette.
const apiDocsEnabled = config.env !== 'production' || process.env.ENABLE_API_DOCS === 'true';

if (apiDocsEnabled) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.topbar { display: none; } .swagger-ui .info .title { color: #5B2E0C; font-family: Georgia, serif; }',
    customSiteTitle: 'Téranga Frontoffice — Documentation',
    swaggerOptions: { persistAuthorization: true, docExpansion: 'none', filter: true, tryItOutEnabled: true },
  }));

  app.get('/api-docs.json', (_req, res) => { res.json(swaggerSpec); });
} else {
  // Sans cela, le repli SPA renverrait index.html : une URL de documentation
  // qui sert l'application est plus déroutante qu'un 404 franc.
  app.all(['/api-docs', '/api-docs/*', '/api-docs.json'], (_req, res) => {
    res.status(404).json({ statusCode: 404, error: 'Not Found', message: 'Documentation non publiée' });
  });
}

// Webhooks (publics, avant rate-limit)
app.use('/api/v1/payments/webhook', webhooksRoutes);

// API v1
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/users', usersRoutes);
// Interne (backoffice → frontoffice) : monté AVANT les routers génériques
// `/api/v1` dont le `requireAuth` global intercepterait sinon /admin/*.
app.use('/api/v1/admin', adminPaymentsRoutes); // validation virements
app.use('/api/v1', discoveryRoutes);   // /discovery/*
// Messagerie ouverte : écrire ne suppose plus de match, seulement un compte
// complet et l'absence de blocage (contrôlé dans le service).
app.use('/api/v1', conversationsRoutes); // /conversations/*
// Tunnel d'abonnement (/pricing, /subscriptions/me, /payments/*) : n'existe
// que si le système est activé. Les webhooks (montés plus haut) et les routes
// admin internes restent ouverts pour régulariser un paiement encore en vol.
//
// Le garde vit DANS le routeur, pas ici : monté sur le préfixe, il s'appliquait
// à tout `/api/v1` et tuait les routes déclarées après lui.
app.use('/api/v1', paymentsRoutes);
app.use('/api/v1', featuresRoutes);    // /events, /moderation, /trusted-circle, /notifications

// SPA fallback — React Router gère le routing côté client.
//
// ⚠️ `/.well-known/` en est exclu. Ce chemin est réservé aux vérifications
// automatisées : Let's Encrypt y dépose un jeton et le relit par HTTP pour
// prouver que le domaine nous appartient. Servir la page d'accueil à sa place
// fait échouer l'émission du certificat — sans message compréhensible, puisque
// la réponse est un honnête 200.
//
// Le serveur web est censé servir ce dossier avant même d'atteindre Node (voir
// public_html/.well-known/.htaccess). Ce garde-fou couvre le cas où il ne le
// ferait pas : mieux vaut un 404 franc qu'une page qui ment.
app.get('*', (req: Request, res: Response) => {
  if (req.path.startsWith('/.well-known/')) {
    res.status(404).type('text/plain').send('Not found');
    return;
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use(errorHandler);

// ========== SOCKETS ==========
const io = initSockets(server);
app.set('io', io);

// ========== STARTUP ==========
async function start() {
  try {
    // Avant toute chose : un serveur qui démarrerait avec une clé de signature
    // publique ne doit pas démarrer.
    assertProductionConfig();
    warnProductionConfig().forEach((w) => logger.warn(w));

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
    const message = (err as Error).message;
    logger.error('Failed to start', { error: message });
    // Le journal structuré peut n'être lu nulle part au premier démarrage :
    // une configuration refusée doit être lisible dans la sortie du conteneur.
    console.error(`
  ❌ ${message}
`);
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
