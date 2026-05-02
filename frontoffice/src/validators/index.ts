import { z } from 'zod';

const phoneRegex = /^\+\d{8,15}$/;

// ==================== AUTH ====================

export const registerSchema = z.object({
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
});

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
  city: z.string().optional(),
  country: z.string().length(2).optional(),
  religion: z.enum(['CHRISTIAN', 'MUSLIM', 'OTHER', 'UNDISCLOSED']).optional(),
  intent: z.enum(['SERIOUS_RELATIONSHIP', 'MARRIAGE', 'FAMILY']).optional(),
  hasChildren: z.coerce.boolean().optional(),
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

export const subscribeSchema = z.object({
  plan: z.enum(['DISCOVERY', 'STANDARD', 'ENGAGEMENT']),
  method: z.enum([
    'ORANGE_MONEY',
    'WAVE',
    'MTN_MOMO',
    'MOOV_MONEY',
    'M_PESA',
    'AIRTEL_MONEY',
    'CARD',
    'CARRIER_BILLING',
  ]),
  phoneNumber: z.string().regex(phoneRegex),
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
