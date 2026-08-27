import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { prisma } from '../config/prisma';
import { config } from '../config';
import { AppError } from '../utils/AppError';
import { signAccessToken } from '../utils/jwt';
import { addDays, generateOtpCode } from '../utils/helpers';
import { logger } from '../utils/logger';
import { otpDelivery } from '../utils/otpDelivery';

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

/**
 * Délai d'attente, en français lisible.
 *
 * Annoncer une durée fausse est pire que de n'en annoncer aucune : l'ancien
 * message promettait « 1 heure » quel que soit le temps réellement restant,
 * si bien qu'une personne bloquée trois minutes renonçait pour la journée.
 */
export function formatAttente(ms: number): string {
  if (ms <= 0) return 'quelques instants';
  if (ms <= 60_000) return 'moins d’une minute';
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} minutes`;
  const heures = Math.ceil(minutes / 60);
  return heures === 1 ? '1 heure' : `${heures} heures`;
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

  /**
   * Téléphone du compte désigné par l'identifiant fourni.
   *
   * Les codes sont stockés par téléphone ; une adresse e-mail doit donc être
   * traduite avant toute écriture. Renvoie `null` si l'adresse ne correspond à
   * aucun compte — l'appelant décide alors quoi en faire.
   */
  private async resolvePhone(id: { phone?: string; email?: string }): Promise<string | null> {
    if (id.phone) return id.phone;
    if (!id.email) return null;
    const user = await prisma.user.findUnique({
      where: { email: id.email.trim().toLowerCase() },
      select: { phone: true },
    });
    return user?.phone ?? null;
  }

  /**
   * Demande un code à partir d'un e-mail ou d'un téléphone.
   *
   * Une adresse inconnue reçoit la MÊME réponse qu'une adresse connue, sans
   * qu'aucun code ne soit créé ni envoyé. Répondre « ce compte n'existe pas »
   * dirait à qui le demande quelles adresses sont inscrites sur un site de
   * rencontres — une information qu'on ne peut pas donner.
   *
   * La résolution précède l'appel à `requestOtp`, donc le quota de 3 codes par
   * heure — compté par téléphone — s'applique bien aux deux points d'entrée.
   * Résoudre après l'aurait contourné.
   */
  async requestOtpFor(
    id: { phone?: string; email?: string },
    purpose: 'registration' | 'login' | 'password_reset',
  ) {
    const phone = await this.resolvePhone(id);
    if (!phone) return { sent: true, expiresAt: new Date(Date.now() + config.otp.ttlMs) };
    return this.requestOtp(phone, purpose);
  }

  /** Vérifie un code à partir d'un e-mail ou d'un téléphone. */
  async verifyOtpFor(id: { phone?: string; email?: string }, code: string) {
    const phone = await this.resolvePhone(id);
    // Même message que pour un code faux : l'échec ne doit pas distinguer
    // « adresse inconnue » de « code erroné ».
    if (!phone) throw AppError.badRequest('Code expiré ou inexistant. Demandez un nouveau code.');
    return this.verifyOtp(phone, code);
  }

  async requestOtp(phone: string, purpose: 'registration' | 'login' | 'password_reset') {
    // Quota anti-abus : au plus `quotaMax` demandes par téléphone dans une
    // fenêtre glissante. On lit les dates plutôt que de compter, afin
    // d'annoncer un délai EXACT : le message précédent promettait « 1 heure »
    // quelle que soit la réalité, ce qui était faux dès la deuxième minute.
    const debutFenetre = new Date(Date.now() - config.otp.quotaWindowMs);
    const recentes = await prisma.otpCode.findMany({
      where: { phone, createdAt: { gte: debutFenetre } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    if (recentes.length >= config.otp.quotaMax) {
      // La place se libère quand la PLUS ANCIENNE demande sort de la fenêtre.
      const attenteMs =
        recentes[0].createdAt.getTime() + config.otp.quotaWindowMs - Date.now();
      throw AppError.tooManyRequests(
        `Trop de demandes de code. Réessayez dans ${formatAttente(attenteMs)}.`,
      );
    }

    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + config.otp.ttlMs);

    const user = await prisma.user.findUnique({ where: { phone } });

    const destination = { phone, email: user?.email ?? null };

    const otpRow = await prisma.otpCode.create({
      data: {
        userId: user?.id,
        phone,
        code: await bcrypt.hash(code, 8),
        purpose,
        expiresAt,
      },
    });

    // Acheminement par e-mail puis SMS (cf. otpDelivery) ; sinon repli sur
    // journalisation (dev local sans canal — le code reste dans les logs).
    if (otpDelivery.isConfigured(destination)) {
      try {
        const { channel, provider, failures } = await otpDelivery.send(destination, code);
        // Le canal est consigné : c'est lui qui dira, à la vérification, si
        // l'on a prouvé la possession du téléphone ou celle de l'adresse.
        await prisma.otpCode
          .update({ where: { id: otpRow.id }, data: { channel } })
          .catch(() => { /* colonne absente sur une base non migrée */ });
        logger.info('OTP delivered', { phone, purpose, channel, provider, fallbacks: failures.length });
      } catch (err) {
        // Le quota (3 demandes par heure) ne doit compter que les codes
        // réellement partis. Sans cette suppression, trois pannes d'affilée
        // du fournisseur enfermaient l'utilisateur une heure sans qu'il ait
        // jamais reçu le moindre SMS.
        await prisma.otpCode
          .delete({ where: { id: otpRow.id } })
          .catch(() => { /* déjà disparu : rien à rattraper */ });
        logger.error('OTP delivery failed', { phone, purpose, error: (err as Error).message });
        throw new AppError("Impossible d'envoyer le code de vérification. Réessayez.", 502);
      }
      return { sent: true, expiresAt };
    }

    // Aucun fournisseur configuré : le code est journalisé, et — en
    // développement uniquement — renvoyé à l'appelant pour que l'inscription
    // reste testable sans compte SMS. `config.env` vaut 'production' en prod :
    // ce champ n'y est jamais présent.
    logger.warn('OTP generated (aucun canal configuré — repli journalisation)', {
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

  /**
   * Consomme un code valide, ou lève. Renvoie la ligne consommée — l'appelant
   * a besoin de son `channel` pour savoir ce qui a été prouvé.
   *
   * Le compteur `attempts` monte AUSSI quand le code est faux : c'est lui qui
   * plafonne la force brute à cinq essais par code. Le déplacer après le test
   * de correspondance viderait la garde de son sens.
   *
   * `purpose` est facultatif. `verifyOtp` ne le passe pas, par une décision
   * ancienne : un code sert à prouver qu'on relève bien cette boîte, quel que
   * soit l'écran qui l'a demandé. La réinitialisation de mot de passe, elle,
   * l'exige — voir `resetPassword`.
   */
  private async consommerCode(phone: string, code: string, purpose?: string) {
    const otp = await prisma.otpCode.findFirst({
      where: {
        phone,
        expiresAt: { gt: new Date() },
        consumedAt: null,
        ...(purpose ? { purpose } : {}),
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
    return otp;
  }

  /**
   * Promotion de statut admise après un code vérifié : UNIQUEMENT la sortie de
   * `PENDING_VERIFICATION`.
   *
   * Le code posait `status: 'ACTIVE'` sans condition. Un compte BANNED ou
   * SUSPENDED pouvait donc se remettre en service tout seul en demandant un
   * code par e-mail — la sanction ne tenait qu'aussi longtemps que son
   * destinataire l'ignorait.
   */
  private statutApresVerification(actuel: string) {
    return actuel === 'PENDING_VERIFICATION' ? ('ACTIVE' as const) : undefined;
  }

  async verifyOtp(phone: string, code: string) {
    const otp = await this.consommerCode(phone, code);

    // On ne certifie que ce qui a été prouvé : un code reçu par e-mail
    // n'atteste rien du téléphone, et inversement. Un code d'avant l'ajout du
    // canal e-mail n'a pas de `channel` — il venait forcément du SMS.
    const parEmail = otp.channel === 'email';
    const avant = await prisma.user.findUnique({ where: { phone }, select: { status: true } });

    const user = await prisma.user.update({
      where: { phone },
      data: {
        ...(parEmail ? { emailVerified: true } : { phoneVerified: true }),
        status: this.statutApresVerification(avant?.status ?? ''),
      },
      include: { subscription: true, photos: true },
    });

    return user;
  }

  /**
   * Réinitialisation du mot de passe par code.
   *
   * Trois choix qui méritent d'être dits :
   *
   * 1. Le code doit avoir été demandé POUR CELA (`purpose: 'password_reset'`).
   *    `verifyOtp` reste aveugle au motif, mais ici la conséquence n'est plus
   *    d'ouvrir une session : c'est de changer la serrure. Un code de
   *    connexion qui vaudrait changement de mot de passe équivaudrait à une
   *    prise de contrôle du compte.
   *
   * 2. Aucune session n'est ouverte en retour. On révoque au contraire tous
   *    les jetons de rafraîchissement : si le compte était compromis, la
   *    réinitialisation doit mettre l'intrus dehors. Délivrer un jeton neuf
   *    dans la même réponse contredirait exactement ce qu'on vient de faire.
   *
   * 3. Une adresse inconnue produit le MÊME refus qu'un code faux. Distinguer
   *    les deux dirait quelles adresses ont un compte sur un site de
   *    rencontres — l'information la plus sensible qu'on puisse laisser fuir
   *    ici.
   */
  async resetPassword(id: { phone?: string; email?: string }, code: string, password: string) {
    const phone = await this.resolvePhone(id);
    if (!phone) throw AppError.badRequest('Code expiré ou inexistant. Demandez un nouveau code.');

    const otp = await this.consommerCode(phone, code, 'password_reset');
    const parEmail = otp.channel === 'email';
    const avant = await prisma.user.findUnique({ where: { phone }, select: { status: true } });

    const user = await prisma.user.update({
      where: { phone },
      data: {
        passwordHash: await bcrypt.hash(password, 10),
        ...(parEmail ? { emailVerified: true } : { phoneVerified: true }),
        status: this.statutApresVerification(avant?.status ?? ''),
      },
      select: { id: true },
    });

    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { reset: true };
  }

  /**
   * Connexion par mot de passe, à partir d'un e-mail ou d'un téléphone.
   *
   * Une adresse inconnue produit le MÊME refus qu'un mot de passe faux —
   * « Identifiants invalides ». Distinguer les deux permettrait de savoir
   * quelles adresses ont un compte, en une simple tentative de connexion.
   */
  async loginFor(id: { phone?: string; email?: string }, password: string) {
    const phone = await this.resolvePhone(id);
    if (!phone) throw AppError.unauthorized('Identifiants invalides');
    return this.login(phone, password);
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
