import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { prisma } from '../config/prisma';
import { config } from '../config';
import { AppError } from '../utils/AppError';
import { signAccessToken } from '../utils/jwt';
import { addDays, generateOtpCode } from '../utils/helpers';
import { logger } from '../utils/logger';

export interface RegisterInput {
  phone: string;
  email?: string;
  password?: string;
  firstName: string;
  lastName?: string;
  birthDate: Date;
  gender: 'FEMALE' | 'MALE' | 'NON_BINARY' | 'UNDISCLOSED';
  intent: 'SERIOUS_RELATIONSHIP' | 'MARRIAGE' | 'FAMILY';
  religion?: 'CHRISTIAN' | 'MUSLIM' | 'OTHER' | 'UNDISCLOSED';
  city: string;
  country: string;
  profession?: string;
}

export class AuthService {
  async register(input: RegisterInput) {
    // Uniqueness check
    const existing = await prisma.user.findFirst({
      where: { OR: [{ phone: input.phone }, ...(input.email ? [{ email: input.email }] : [])] },
    });
    if (existing) {
      throw AppError.conflict('Un compte existe déjà avec ce numéro ou cet email');
    }

    const passwordHash = input.password ? await bcrypt.hash(input.password, 10) : null;

    const user = await prisma.user.create({
      data: {
        phone: input.phone,
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        birthDate: new Date(input.birthDate),
        gender: input.gender,
        intent: input.intent,
        religion: input.religion || 'UNDISCLOSED',
        city: input.city,
        country: input.country,
        profession: input.profession,
        subscription: {
          create: {
            plan: 'FREE',
            status: 'ACTIVE', // free tier is active by default
          },
        },
      },
      include: { subscription: true, photos: true },
    });

    // Request OTP for phone verification
    await this.requestOtp(user.phone, 'registration');

    return user;
  }

  async requestOtp(phone: string, purpose: 'registration' | 'login' | 'password_reset') {
    // Rate limiting: max 3 OTP per phone per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await prisma.otpCode.count({
      where: { phone, createdAt: { gte: oneHourAgo } },
    });
    if (recentCount >= 3) {
      throw AppError.tooManyRequests('Trop de demandes de code. Réessayez dans 1 heure.');
    }

    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    const user = await prisma.user.findUnique({ where: { phone } });

    await prisma.otpCode.create({
      data: {
        userId: user?.id,
        phone,
        code: await bcrypt.hash(code, 8),
        purpose,
        expiresAt,
      },
    });

    // TODO: actually send via Orange SMS API / Africa's Talking
    logger.info('OTP generated', { phone, purpose, code: process.env.NODE_ENV === 'development' ? code : '***' });

    return { sent: true, expiresAt };
  }

  async verifyOtp(phone: string, code: string) {
    const otp = await prisma.otpCode.findFirst({
      where: {
        phone,
        expiresAt: { gt: new Date() },
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) throw AppError.badRequest('Code expiré ou inexistant. Demandez un nouveau code.');

    if (otp.attempts >= 5) {
      throw AppError.tooManyRequests('Trop de tentatives. Demandez un nouveau code.');
    }

    const matches = await bcrypt.compare(code, otp.code);

    await prisma.otpCode.update({
      where: { id: otp.id },
      data: {
        attempts: otp.attempts + 1,
        consumedAt: matches ? new Date() : null,
      },
    });

    if (!matches) throw AppError.badRequest('Code incorrect');

    const user = await prisma.user.update({
      where: { phone },
      data: {
        phoneVerified: true,
        status: 'ACTIVE',
      },
      include: { subscription: true, photos: true },
    });

    return user;
  }

  async login(phone: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { phone },
      include: { subscription: true, photos: true },
    });

    if (!user || !user.passwordHash) throw AppError.unauthorized('Identifiants invalides');
    if (user.status === 'BANNED') throw AppError.forbidden('Compte banni');
    if (user.status === 'DELETED') throw AppError.unauthorized('Compte supprimé');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw AppError.unauthorized('Identifiants invalides');

    return user;
  }

  issueTokens(user: {
    id: string;
    gender: string;
    subscription?: { plan: string; status: string; expiresAt: Date | null } | null;
  }) {
    const now = new Date();
    const isSubscribed = !!(
      user.subscription &&
      user.subscription.status === 'ACTIVE' &&
      user.subscription.plan !== 'FREE' &&
      user.subscription.expiresAt &&
      user.subscription.expiresAt > now
    );

    const accessToken = signAccessToken({
      userId: user.id,
      gender: user.gender,
      isSubscribed,
    });

    // Simple refresh token (opaque UUID stored in DB)
    const refreshToken = uuid();

    return { accessToken, refreshToken };
  }

  async saveRefreshToken(userId: string, token: string) {
    const expiresAt = addDays(new Date(), 30);
    return prisma.refreshToken.create({
      data: { userId, token, expiresAt },
    });
  }

  async refresh(token: string) {
    const stored = await prisma.refreshToken.findUnique({
      where: { token },
      include: {
        user: {
          include: { subscription: true, photos: true },
        },
      },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw AppError.unauthorized('Refresh token invalide ou expiré');
    }
    return stored.user;
  }

  async revokeRefreshToken(token: string) {
    await prisma.refreshToken.updateMany({
      where: { token },
      data: { revokedAt: new Date() },
    });
  }
}

export const authService = new AuthService();
