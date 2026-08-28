import { prisma } from '../config/prisma';
import { config } from '../config';
import { AppError } from '../utils/AppError';
import { calculateAge } from '../utils/helpers';
import { photosVisibles } from '../utils/photos';

/**
 * Les langues sont persistées encadrées de virgules (",FR,WO,") pour que la
 * recherche par `contains` soit exacte — MySQL ne supporte pas les tableaux
 * Prisma. Ce format reste interne : l'API expose et reçoit un tableau de codes.
 */
export function parseLanguages(stored: string | null | undefined): string[] {
  if (!stored) return [];
  return stored.split(',').map((c) => c.trim()).filter(Boolean);
}

export function formatLanguages(codes: unknown): string | null {
  if (codes === null || codes === undefined) return null;
  const list = Array.isArray(codes) ? codes : String(codes).split(',');
  const unique = Array.from(
    new Set(list.map((c) => String(c).trim().toUpperCase()).filter(Boolean)),
  );
  return unique.length ? `,${unique.join(',')},` : null;
}

export class UsersService {
  async getById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { photos: { orderBy: { order: 'asc' } }, subscription: true },
    });
    if (!user) throw AppError.notFound('Utilisateur introuvable');
    return this.serialize(user);
  }

  async updateProfile(userId: string, data: Record<string, any>) {
    const allowed = [
      'firstName',
      'lastName',
      'bio',
      'profession',
      'city',
      'educationLevel',
      'hasChildren',
      'religion',
      'intent',
      'gender',
      'photosVisibility',
      // Critères de recherche facultatifs (cf. discoveryFiltersSchema).
      'wantsChildren',
      'heightCm',
      'weightKg',
      'bodyType',
      'ethnicity',
      'languages',
    ];
    const updateData: Record<string, any> = {};
    for (const key of allowed) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }

    // `null` efface la valeur ; un tableau (ou une chaîne libre) est normalisé.
    if (updateData.languages !== undefined) {
      updateData.languages = formatLanguages(updateData.languages);
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: { photos: { orderBy: { order: 'asc' } }, subscription: true },
    });
    return this.serialize(user);
  }

  async addPhoto(userId: string, url: string) {
    const { maxPhotos } = config.profile;
    const count = await prisma.photo.count({ where: { userId } });
    if (count >= maxPhotos) {
      throw AppError.badRequest(`Vous avez déjà ${maxPhotos} photos (maximum)`);
    }

    return prisma.photo.create({
      data: {
        userId,
        url,
        order: count,
        isMain: count === 0,
        moderationStatus: 'PENDING',
      },
    });
  }

  async deletePhoto(userId: string, photoId: string) {
    const photo = await prisma.photo.findFirst({ where: { id: photoId, userId } });
    if (!photo) throw AppError.notFound('Photo introuvable');

    await prisma.photo.delete({ where: { id: photoId } });

    // If we deleted the main photo, promote the next one
    if (photo.isMain) {
      const nextPhoto = await prisma.photo.findFirst({
        where: { userId },
        orderBy: { order: 'asc' },
      });
      if (nextPhoto) {
        await prisma.photo.update({
          where: { id: nextPhoto.id },
          data: { isMain: true },
        });
      }
    }

    return { deleted: true };
  }

  async setMainPhoto(userId: string, photoId: string) {
    const photo = await prisma.photo.findFirst({ where: { id: photoId, userId } });
    if (!photo) throw AppError.notFound('Photo introuvable');

    await prisma.$transaction([
      prisma.photo.updateMany({
        where: { userId, isMain: true },
        data: { isMain: false },
      }),
      prisma.photo.update({ where: { id: photoId }, data: { isMain: true } }),
    ]);

    return { updated: true };
  }

  /**
   * Submit a biometric verification video selfie.
   * In prod: forward to Smile Identity / Veriff for real check.
   */
  async submitBiometricVerification(userId: string, _videoSelfieBase64: string) {
    // TODO: call Smile Identity API
    // For now: mark as in_review, auto-approve after a moment in dev

    await prisma.user.update({
      where: { id: userId },
      data: {
        verificationStatus: 'IN_REVIEW',
      },
    });

    // Auto-approve in dev for demo
    if (process.env.NODE_ENV === 'development') {
      setTimeout(async () => {
        await prisma.user.update({
          where: { id: userId },
          data: {
            verificationStatus: 'VERIFIED',
            biometricVerified: true,
            isVerified: true,
          },
        });
      }, 3000);
    }

    return { status: 'IN_REVIEW' };
  }

  /**
   * Mise en pause décidée par le membre : il disparaît de la découverte et
   * n'est plus joignable, mais rien n'est effacé et il revient quand il veut.
   *
   * Le passage n'est admis que DEPUIS `ACTIVE`. Sans cette condition, un
   * compte sanctionné (`SUSPENDED`, `BANNED`) pourrait se « désactiver » puis
   * se « réactiver » pour effacer sa sanction — le même défaut que la
   * promotion de statut sans condition, corrigée dans `verifyOtp`.
   */
  async deactivate(userId: string) {
    const avant = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (avant?.status !== 'ACTIVE') {
      throw AppError.badRequest('Seul un compte actif peut être mis en pause.');
    }
    await prisma.user.update({ where: { id: userId }, data: { status: 'DEACTIVATED' } });
    // La session est conservée volontairement : c'est par elle que le membre
    // revient. Le déconnecter l'obligerait à se reconnecter pour réactiver.
    return { status: 'DEACTIVATED' as const };
  }

  /** Retour en service. N'accepte QUE `DEACTIVATED`, jamais une sanction. */
  async reactivate(userId: string) {
    const avant = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (avant?.status !== 'DEACTIVATED') {
      throw AppError.badRequest("Ce compte n'est pas en pause.");
    }
    await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
    return { status: 'ACTIVE' as const };
  }

  /**
   * Suppression du compte — effacement logique.
   *
   * `status: DELETED` et `deletedAt` suffisent à le faire disparaître de
   * toutes les surfaces publiques, qui filtrent déjà dessus. Les données
   * restent en base : messages reçus par d'autres, signalements, paiements —
   * les effacer réellement casserait les conversations de tiers et les
   * obligations comptables. C'est un choix, il mérite d'être su.
   *
   * Les jetons sont révoqués : un compte supprimé dont la session survit
   * continuerait d'appeler l'API pendant des jours.
   */
  async deleteAccount(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
      },
    });
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { deleted: true };
  }

  /**
   * Profil public d'un autre membre.
   *
   * Liste blanche explicite, et non `serialize` amputé de quelques clés :
   * cette route est consultable **sans être connecté**. Un retrait par
   * soustraction laisserait fuiter la date de naissance exacte, le statut de
   * vérification, l'abonnement et la dernière activité — et tout champ ajouté
   * plus tard au modèle partirait silencieusement avec.
   *
   * Seul l'âge est exposé, jamais `birthDate`.
   */
  /**
   * `viewerId` est facultatif : la fiche reste consultable sans compte. Il ne
   * sert qu'à dire si CE visiteur a déjà aimé ce profil — sans quoi le cœur
   * revient vide à chaque visite et le like paraît sans effet.
   */
  async getPublicProfile(userId: string, viewerId?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { photos: { orderBy: { order: 'asc' } } },
    });
    // Mêmes conditions de visibilité que le fil (`getFeed`) : actif, non
    // supprimé, **et vérifié**. Sans le contrôle de vérification, un profil que
    // la recherche masque délibérément resterait atteignable par son
    // identifiant — les deux surfaces publiques doivent désigner le même monde.
    if (!user || user.status !== 'ACTIVE' || user.deletedAt || !user.isVerified) {
      throw AppError.notFound('Profil introuvable');
    }

    const liked = viewerId
      ? !!(await prisma.like.findUnique({
          where: { senderId_receiverId: { senderId: viewerId, receiverId: userId } },
          select: { senderId: true },
        }))
      : false;

    return {
      id: user.id,
      liked,
      firstName: user.firstName,
      age: calculateAge(user.birthDate),
      city: user.city,
      country: user.country,
      profession: user.profession,
      educationLevel: user.educationLevel,
      bio: user.bio,
      intent: user.intent,
      religion: user.religion,
      isVerified: user.isVerified,
      hasChildren: user.hasChildren,
      wantsChildren: user.wantsChildren,
      heightCm: user.heightCm,
      weightKg: user.weightKg,
      bodyType: user.bodyType,
      ethnicity: user.ethnicity,
      languages: parseLanguages(user.languages),
      // Le membre a choisi de ne pas publier : la fiche n'en dit rien non
      // plus. Les écrans savent déjà se passer de photo — ils affichent
      // l'initiale du prénom.
      photos: photosVisibles(user).map((p: any) => ({
        id: p.id,
        url: p.url,
        isMain: p.isMain,
        order: p.order,
      })),
    };
  }

  /**
   * Sérialisation exposée au client. Quand les photos sont chargées, on ajoute
   * l'état de complétude du profil : le client (inscription, espace membre) s'y
   * fie plutôt que de recoder le seuil de son côté.
   */
  serialize(user: any) {
    const hasPhotos = Array.isArray(user.photos);
    return {
      ...user,
      age: calculateAge(user.birthDate),
      passwordHash: undefined,
      // Format interne (",FR,WO,") converti en tableau : le client n'a pas a
      // connaître les sentinelles, et il réémet ce même tableau à l'écriture.
      languages: parseLanguages(user.languages),
      minPhotos: config.profile.minPhotos,
      maxPhotos: config.profile.maxPhotos,
      // Le client masque tout le tunnel d'abonnement quand c'est false : il ne
      // décide pas du modèle économique, il le lit.
      subscriptionsEnabled: config.subscriptionsEnabled,
      ...(hasPhotos
        ? {
            photosCount: user.photos.length,
            profileComplete: user.photos.length >= config.profile.minPhotos,
          }
        : {}),
    };
  }
}

export const usersService = new UsersService();
