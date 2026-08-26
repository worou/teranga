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
  /**
   * Nombre de proxys de confiance devant l'application
   * (`app.set('trust proxy', n)`). 0 = aucun.
   *
   * Indispensable en production derrière LiteSpeed/Passenger, nginx ou un
   * répartiteur de charge : sans cela `req.ip` vaut l'adresse du proxy, et
   * express-rate-limit compte TOUS les administrateurs dans un seul seau. La
   * console devient alors inutilisable après quelques écrans consultés, sur
   * un « Erreur » sans explication — le 429 n'étant pas lu par la page.
   *
   * Le défaut est 0, et non 1, parce que se tromper dans l'autre sens est
   * pire : faire confiance à `X-Forwarded-For` sans proxy devant permet à
   * n'importe qui de forger son adresse et d'échapper à la limitation.
   *
   * Même variable et même valeur que le frontoffice.
   */
  trustProxy: parseInt(process.env.TRUST_PROXY || '0', 10),

  /** Voir frontoffice : HSTS reste muet tant qu'aucun certificat n'est valide. */
  hstsEnabled: process.env.HSTS_ENABLED === 'true',
  // Frontoffice : cible des actions admin internes (validation de virement).
  // Le backoffice relaie l'action au frontoffice, qui détient la logique
  // canonique d'activation d'abonnement, via un secret partagé.
  frontofficeApiUrl: process.env.FRONTOFFICE_API_URL || 'http://localhost:3000',
  internalApiSecret: process.env.INTERNAL_API_SECRET || 'dev-internal-secret',
};
