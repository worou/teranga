import dotenv from 'dotenv';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:3001').split(','),

  database: {
    url: process.env.DATABASE_URL || '',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  cinetpay: {
    apiKey: process.env.CINETPAY_API_KEY || '',
    siteId: process.env.CINETPAY_SITE_ID || '',
    secretKey: process.env.CINETPAY_SECRET_KEY || '',
    notifyUrl: process.env.CINETPAY_NOTIFY_URL || '',
    returnUrl: process.env.CINETPAY_RETURN_URL || '',
  },

  paypal: {
    // Compte marchand (email PayPal qui reçoit les fonds) — via l'environnement.
    email: process.env.PAYPAL_EMAIL || '',
    // 'sandbox' (test) ou 'live' (production).
    env: process.env.PAYPAL_ENV || 'sandbox',
    // Devise de facturation : le F CFA n'étant pas supporté par PayPal, on
    // facture en EUR au taux fixe de parité CFA (voir utils/paypal.ts).
    currency: 'EUR',
    // Retour utilisateur après paiement (écran d'abonnement côté client).
    returnUrl: process.env.PAYPAL_RETURN_URL || 'http://localhost:5173/abonnement?paypal=done',
    cancelUrl: process.env.PAYPAL_CANCEL_URL || 'http://localhost:5173/abonnement?paypal=cancel',
  },

  // Virement bancaire (SEPA / EUR) — validation manuelle par un admin.
  // ⚠️ Coordonnées bancaires = données sensibles : lues depuis l'environnement,
  //    jamais en dur dans le code. Le moyen n'est proposé que si l'IBAN est
  //    renseigné (voir payments.service.getMethodsForCountry).
  bankTransfer: {
    beneficiary: process.env.BANK_TRANSFER_BENEFICIARY || '',
    iban: process.env.BANK_TRANSFER_IBAN || '',
    bic: process.env.BANK_TRANSFER_BIC || '',
    bankName: process.env.BANK_TRANSFER_BANK || '',
  },

  // Secret partagé backoffice → frontoffice pour les actions admin internes
  // (validation d'un virement). DOIT être défini en production : le middleware
  // interne refuse tout si la valeur reste le défaut de dev (fail-closed).
  internalApiSecret: process.env.INTERNAL_API_SECRET || 'dev-internal-secret',

  // Twilio — fournisseur d'envoi des SMS OTP (par défaut). Sans ces valeurs,
  // le code est journalisé en repli (dev local). En production, renseigner
  // accountSid + authToken + (from OU messagingServiceSid).
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    // Numéro émetteur SMS Twilio au format E.164 (ex. +12025550123), OU un
    // Messaging Service (recommandé pour l'Afrique de l'Ouest : permet un
    // Sender ID alphanumérique et le routage par pays).
    from: process.env.TWILIO_FROM || '',
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || '',
  },

  // Orange SMS — fournisseur historique (désormais optionnel). Conservé pour
  // compatibilité ; l'envoi OTP passe par Twilio (voir utils/twilioSms).
  orangeSms: {
    clientId: process.env.ORANGE_SMS_CLIENT_ID || '',
    clientSecret: process.env.ORANGE_SMS_CLIENT_SECRET || '',
    // Numéro émetteur provisionné chez Orange (obligatoire pour l'envoi réel).
    // Format E.164 sans espaces, ex. +221771234567. C'est ce numéro qui est
    // encodé dans l'URL (tel:+…) ET dans senderAddress du corps.
    senderNumber: process.env.ORANGE_SMS_SENDER_NUMBER || '',
    // Nom alphanumérique optionnel (≤ 11 car.) affiché comme expéditeur.
    // Nécessite un whitelisting préalable par Orange, sinon ignoré.
    senderName: process.env.ORANGE_SMS_SENDER || 'Teranga',
  },

  smileIdentity: {
    partnerId: process.env.SMILE_PARTNER_ID || '',
    apiKey: process.env.SMILE_API_KEY || '',
  },

  s3: {
    endpoint: process.env.S3_ENDPOINT || '',
    region: process.env.S3_REGION || 'fr-par',
    bucket: process.env.S3_BUCKET || 'teranga-media',
    accessKey: process.env.S3_ACCESS_KEY || '',
    secretKey: process.env.S3_SECRET_KEY || '',
  },

  sightengine: {
    apiUser: process.env.SIGHTENGINE_API_USER || '',
    apiSecret: process.env.SIGHTENGINE_API_SECRET || '',
  },

  /**
   * Nombre de reverse proxys de confiance devant l'application
   * (`app.set('trust proxy', n)`). 0 = aucun.
   *
   * À renseigner impérativement en production derrière nginx, un load balancer
   * ou une plateforme type Heroku/Render : sans cela, express-rate-limit voit
   * l'adresse du proxy et compte tous les utilisateurs dans un seul seau.
   *
   * Le défaut est 0, et non 1, parce que se tromper dans l'autre sens est pire :
   * faire confiance à `X-Forwarded-For` sans proxy devant permet à n'importe qui
   * de forger son adresse et d'échapper à la limitation de débit.
   */
  trustProxy: parseInt(process.env.TRUST_PROXY || '0', 10),

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    /**
     * 300 requêtes / 15 min, soit 20 par minute.
     *
     * L'ancien plafond de 100 (6,6/min) était intenable pour une application à
     * page unique : le fil de conversation s'actualise toutes les 8 secondes,
     * soit 7,5 requêtes/minute à lui seul — 112 sur la fenêtre. Tout membre
     * gardant une conversation ouverte un quart d'heure se prenait un 429.
     *
     * Les routes d'authentification gardent leur plafond strict de 20/15 min,
     * posé séparément dans server.ts.
     */
    max: parseInt(process.env.RATE_LIMIT_MAX || '300', 10),
  },

  // Système d'abonnement. DÉSACTIVÉ par défaut (version 1 : accès complet et
  // gratuit pour tout le monde). Mettre SUBSCRIPTIONS_ENABLED=true réactive le
  // modèle freemium sans rien remettre en place : le code de paiement, les
  // quotas et le cycle de vie sont conservés et testés.
  subscriptionsEnabled: process.env.SUBSCRIPTIONS_ENABLED === 'true',

  // Pricing in F CFA
  pricing: {
    DISCOVERY: { amount: 1000, months: 1 },
    STANDARD: { amount: 1500, months: 3, monthlyDisplay: 500 },
    ENGAGEMENT: { amount: 5000, months: 6, monthlyDisplay: 833 },
  },

  // Complétude du profil exigée à l'inscription. Un compte dont le profil n'est
  // pas complet est créé et authentifié (il faut un token pour uploader les
  // photos), mais n'accède pas à l'application tant que le minimum n'est pas
  // atteint. `maxPhotos` est la limite haute déjà appliquée par `addPhoto`.
  profile: {
    minPhotos: parseInt(process.env.PROFILE_MIN_PHOTOS || '3', 10),
    maxPhotos: parseInt(process.env.PROFILE_MAX_PHOTOS || '6', 10),
  },

  // Free tier limits for men
  freeTierLimits: {
    dailyProfileViews: 10,
    dailyLikes: 5,
    canMessage: false,
  },

  messaging: {
    /**
     * Nombre de conversations qu'un membre peut **ouvrir** par jour.
     *
     * Frein anti-spam, apparu avec la messagerie ouverte : tant qu'écrire
     * supposait un match, personne ne pouvait être démarché sans son accord.
     * Ce n'est plus vrai, et l'IA anti-brouteur détecte des motifs — argent,
     * harcèlement — pas du volume.
     *
     * La limite ne porte que sur les conversations **nouvelles** : répondre
     * dans une conversation déjà entamée n'est jamais compté, quel qu'en soit
     * le nombre. Elle s'applique à tout le monde, abonnés compris — c'est une
     * mesure de sécurité, pas un palier commercial.
     */
    dailyNewConversations: parseInt(process.env.MESSAGING_DAILY_NEW_CONVERSATIONS || '30', 10),
  },

  // Cycle de vie des abonnements (auto-renouvellement)
  subscriptions: {
    // Envoi du rappel de renouvellement N jours avant l'expiration.
    reminderDaysBefore: parseInt(process.env.SUB_REMINDER_DAYS_BEFORE || '3', 10),
    // Planification du job quotidien (cron). Par défaut : tous les jours à 08h00.
    cronSchedule: process.env.SUB_CRON_SCHEDULE || '0 8 * * *',
    // Fuseau horaire du cron (zone UEMOA).
    cronTimezone: process.env.SUB_CRON_TIMEZONE || 'Africa/Dakar',
    // Chemin (côté client) de l'écran d'abonnement, pour le lien de renouvellement.
    renewPath: process.env.SUB_RENEW_PATH || '/abonnement',
  },
};

export default config;
