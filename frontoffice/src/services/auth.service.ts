import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { prisma } from '../config/prisma';
import { config } from '../config';
import { AppError } from '../utils/AppError';
import { signAccessToken } from '../utils/jwt';
import { addDays, generateOtpCode } from '../utils/helpers';
import { logger } from '../utils/logger';
import { smsSender } from '../utils/smsSender';

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
      include: { subscription: true, photos: true },
    });

    if (existing) {
      // Inscription abandonnée avant la vérification du numéro : le compte
      // existe mais n'a jamais servi. On renvoie simplement un nouveau code
      // plutôt que de condamner le numéro par un 409 définitif. Les données du
      // compte ne sont PAS écrasées : seul le détenteur du téléphone pourra le
      // vérifier, et rien ne doit pouvoir être modifié sans cette preuve.
      const resumable =
        existing.phone === input.phone &&
        !existing.phoneVerified &&
        existing.status === 'PENDING_VERIFICATION';

      if (!resumable) {
        throw AppError.conflict('Un compte existe déjà avec ce numéro ou cet email');
      }

      const otp = await this.requestOtp(existing.phone, 'registration');
      return {
        user: existing,
        devCode: (otp as { devCode?: string }).devCode,
        resumed: true,
      };
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

    // Request OTP for phone verification. En développement sans fournisseur
    // SMS, `requestOtp` renvoie le code : on le fait remonter pour que le
    // premier envoi soit exploitable comme le renvoi.
    const otp = await this.requestOtp(user.phone, 'registration');

    return { user, devCode: (otp as { devCode?: string }).devCode, resumed: false };
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

    const otpRow = await prisma.otpCode.create({
      data: {
        userId: user?.id,
        phone,
        code: await bcrypt.hash(code, 8),
        purpose,
        expiresAt,
      },
    });

    // Envoi réel via la chaîne de fournisseurs (Twilio puis Orange) ; sinon
    // repli sur journalisation (dev local sans identifiants — le code reste
    // récupérable dans les logs).
    const smsText = `Téranga : votre code de vérification est ${code}. Il expire dans 10 minutes.`;
    if (smsSender.isConfigured()) {
      try {
        const { provider, failures } = await smsSender.send(phone, smsText);
        logger.info('OTP sent by SMS', { phone, purpose, provider, fallbacks: failures.length });
      } catch (err) {
        // Le quota (3 demandes par heure) ne doit compter que les codes
        // réellement partis. Sans cette suppression, trois pannes d'affilée
        // du fournisseur enfermaient l'utilisateur une heure sans qu'il ait
        // jamais reçu le moindre SMS.
        await prisma.otpCode
          .delete({ where: { id: otpRow.id } })
          .catch(() => { /* déjà disparu : rien à rattraper */ });
        logger.error('OTP SMS delivery failed', { phone, purpose, error: (err as Error).message });
        throw new AppError("Impossible d'envoyer le SMS de vérification. Réessayez.", 502);
      }
      return { sent: true, expiresAt };
    }

    // Aucun fournisseur configuré : le code est journalisé, et — en
    // développement uniquement — renvoyé à l'appelant pour que l'inscription
    // reste testable sans compte SMS. `config.env` vaut 'production' en prod :
    // ce champ n'y est jamais présent.
    logger.warn('OTP generated (SMS non configuré — repli journalisation)', {
      phone,
      purpose,
      code: config.env === 'development' ? code : '***',
    });

    return {
      sent: true,
      expiresAt,
      ...(config.env === 'development' ? { devCode: code } : {}),
    };
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
    // Sans système d'abonnement, l'accès est complet pour tous : le claim doit
    // le refléter, sinon tout code qui s'y fierait afficherait une relance.
    const isSubscribed = !config.subscriptionsEnabled || !!(
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
