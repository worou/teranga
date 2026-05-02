import { prisma } from '../config/prisma';
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
    ];
    const updateData: Record<string, any> = {};
    for (const key of allowed) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: { photos: { orderBy: { order: 'asc' } }, subscription: true },
    });
    return this.serialize(user);
  }

  async addPhoto(userId: string, url: string) {
    const count = await prisma.photo.count({ where: { userId } });
    if (count >= 6) throw AppError.badRequest('Vous avez déjà 6 photos (maximum)');

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

  serialize(user: any) {
    return {
      ...user,
      age: calculateAge(user.birthDate),
      passwordHash: undefined,
    };
  }
}

export const usersService = new UsersService();
