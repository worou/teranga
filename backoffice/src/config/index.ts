import dotenv from 'dotenv';
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },
  adminSecret: process.env.ADMIN_SECRET || 'admin-secret-change-me',
  // Système d'abonnement. DOIT valoir la même chose que le SUBSCRIPTIONS_ENABLED
  // du frontoffice : le backoffice ne fait que masquer les écrans correspondants
  // (onglets Abonnements/Paiements et indicateurs de revenus). Les routes de
  // l'API restent servies — l'historique garde sa valeur et un virement en
  // attente doit rester régularisable.
  subscriptionsEnabled: process.env.SUBSCRIPTIONS_ENABLED === 'true',
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:5173',
  },
  // Frontoffice : cible des actions admin internes (validation de virement).
  // Le backoffice relaie l'action au frontoffice, qui détient la logique
  // canonique d'activation d'abonnement, via un secret partagé.
  frontofficeApiUrl: process.env.FRONTOFFICE_API_URL || 'http://localhost:3000',
  internalApiSecret: process.env.INTERNAL_API_SECRET || 'dev-internal-secret',
};
