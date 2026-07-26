import { z } from 'zod';
import { isXofCountry, dialingCodeForCountry, OPERATORS } from '../config/mobileMoney';

const phoneRegex = /^\+\d{8,15}$/;

// ==================== AUTH ====================

export const registerSchema = z
  .object({
    phone: z.string().regex(phoneRegex, 'Numéro invalide (format E.164)'),
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    firstName: z.string().min(1).max(60),
    lastName: z.string().max(60).optional(),
    birthDate: z.coerce.date().refine(
      (d) => {
        const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
        return age >= 18 && age <= 100;
      },
      { message: 'Vous devez avoir au moins 18 ans' },
    ),
    gender: z.enum(['FEMALE', 'MALE', 'NON_BINARY', 'UNDISCLOSED']),
    intent: z.enum(['SERIOUS_RELATIONSHIP', 'MARRIAGE', 'FAMILY']),
    religion: z.enum(['CHRISTIAN', 'MUSLIM', 'OTHER', 'UNDISCLOSED']).optional(),
    city: z.string().min(1).max(80),
    country: z.string().length(2),
    profession: z.string().max(80).optional(),
  })
  // Garde-fou : pour un pays de la zone F CFA (où le paiement mobile money et
  // l'OTP dépendent de l'indicatif), le numéro doit porter cet indicatif. Les
  // pays hors zone ne sont pas contraints (numéro étranger de la diaspora).
  .refine(
    (d) => {
      if (!isXofCountry(d.country)) return true;
      const code = dialingCodeForCountry(d.country);
      return !code || d.phone.startsWith(code);
    },
    {
      message: "Le numéro doit commencer par l'indicatif du pays sélectionné.",
      path: ['phone'],
    },
  );

export const loginSchema = z.object({
  phone: z.string().regex(phoneRegex),
  password: z.string().min(1),
});

export const otpRequestSchema = z.object({
  phone: z.string().regex(phoneRegex),
  purpose: z.enum(['registration', 'login', 'password_reset']).default('registration'),
});

export const otpVerifySchema = z.object({
  phone: z.string().regex(phoneRegex),
  code: z.string().length(6),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(10),
});

// ==================== USERS ====================

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(60).optional(),
  lastName: z.string().max(60).optional(),
  bio: z.string().max(500).optional(),
  profession: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  educationLevel: z.string().max(80).optional(),
  hasChildren: z.boolean().optional(),
  religion: z.enum(['CHRISTIAN', 'MUSLIM', 'OTHER', 'UNDISCLOSED']).optional(),
  intent: z.enum(['SERIOUS_RELATIONSHIP', 'MARRIAGE', 'FAMILY']).optional(),
});

export const addPhotoSchema = z.object({
  url: z.string().url(),
});

export const biometricSchema = z.object({
  videoSelfieBase64: z.string().min(100),
});

// ==================== DISCOVERY ====================

export const discoveryFiltersSchema = z.object({
  minAge: z.coerce.number().min(18).max(99).optional(),
  maxAge: z.coerce.number().min(18).max(99).optional(),
  city: z.string().max(80).optional(),
  country: z.string().length(2).optional(),
  religion: z.enum(['CHRISTIAN', 'MUSLIM', 'OTHER', 'UNDISCLOSED']).optional(),
  intent: z.enum(['SERIOUS_RELATIONSHIP', 'MARRIAGE', 'FAMILY']).optional(),
  hasChildren: z.coerce.boolean().optional(),
  profession: z.string().max(80).optional(),
  q: z.string().trim().min(1).max(60).optional(), // recherche plein-texte
  limit: z.coerce.number().min(1).max(50).default(20),
});

export const likeSchema = z.object({
  receiverId: z.string().uuid(),
  isSuperLike: z.boolean().default(false),
});

// ==================== MESSAGES ====================

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(2000),
});

// ==================== SUBSCRIPTIONS / PAYMENTS ====================

export const subscribeSchema = z
  .object({
    plan: z.enum(['DISCOVERY', 'STANDARD', 'ENGAGEMENT']),
    // Moyens mobile money (zone F CFA), carte, PayPal ou virement — cf. mobileMoney.ts
    method: z.enum([
      'ORANGE_MONEY',
      'WAVE',
      'MTN_MOMO',
      'MOOV_MONEY',
      'FREE_MONEY',
      'WIZALL',
      'CARD',
      'CARRIER_BILLING',
      'PAYPAL',
      'BANK_TRANSFER',
    ]),
    // Optionnel : requis seulement pour le mobile money (validé ci-dessous).
    phoneNumber: z.string().regex(phoneRegex).optional(),
    autoRenew: z.boolean().default(true),
  })
  // Le numéro n'est exigé que pour un portefeuille mobile money (Carte et
  // PayPal n'en ont pas besoin).
  .refine((d) => !OPERATORS[d.method]?.isMobileMoney || !!d.phoneNumber, {
    message: 'Numéro de téléphone requis pour ce moyen de paiement',
    path: ['phoneNumber'],
  });

// ==================== MODERATION ====================

export const reportSchema = z.object({
  reportedUserId: z.string().uuid(),
  reason: z.enum(['HARASSMENT', 'FAKE_PROFILE', 'SCAM', 'INAPPROPRIATE_CONTENT', 'SPAM', 'OTHER']),
  description: z.string().max(1000).optional(),
});

export const blockSchema = z.object({
  blockedUserId: z.string().uuid(),
  reason: z.string().max(200).optional(),
});

// ==================== TRUSTED CIRCLE ====================

export const addTrustedSchema = z.object({
  relation: z.string().min(1).max(40),
  trusteePhone: z.string().regex(phoneRegex).optional(),
  trusteeName: z.string().max(80).optional(),
});

// ==================== PAGINATION ====================

export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});
