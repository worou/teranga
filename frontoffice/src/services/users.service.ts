import { prisma } from '../config/prisma';
import { config } from '../config';
import { AppError } from '../utils/AppError';
import { calculateAge } from '../utils/helpers';

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

    // Les langues sont stockées encadrées de virgules (",FR,WO,") pour que la
    // recherche par `contains` soit exacte. On accepte un tableau ou une chaîne
    // libre et on normalise ici, seul endroit qui écrit ce champ.
    if (updateData.languages !== undefined) {
      const codes = (Array.isArray(updateData.languages)
        ? updateData.languages
        : String(updateData.languages).split(','))
        .map((c: string) => c.trim().toUpperCase())
        .filter(Boolean);
      const unique = Array.from(new Set(codes));
      updateData.languages = unique.length ? `,${unique.join(',')},` : null;
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

  async deleteAccount(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
      },
    });
    return { deleted: true };
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
