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

  orangeSms: {
    clientId: process.env.ORANGE_SMS_CLIENT_ID || '',
    clientSecret: process.env.ORANGE_SMS_CLIENT_SECRET || '',
    sender: process.env.ORANGE_SMS_SENDER || 'Teranga',
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

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },

  // Pricing in F CFA
  pricing: {
    DISCOVERY: { amount: 3000, months: 1 },
    STANDARD: { amount: 21000, months: 3, monthlyDisplay: 7000 },
    ENGAGEMENT: { amount: 72000, months: 6, monthlyDisplay: 12000 },
  },

  // Free tier limits for men
  freeTierLimits: {
    dailyProfileViews: 10,
    dailyLikes: 5,
    canMessage: false,
  },
};

export default config;
