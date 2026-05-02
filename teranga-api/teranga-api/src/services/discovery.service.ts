import { prisma } from '../config/prisma';
import { config } from '../config';
import { AppError } from '../utils/AppError';
import { calculateAge, orderUserIds } from '../utils/helpers';

export interface DiscoveryFilters {
  minAge?: number;
  maxAge?: number;
  city?: string;
  country?: string;
  religion?: string;
  intent?: string;
  hasChildren?: boolean;
}

export class DiscoveryService {
  /**
   * Get a feed of candidate profiles, excluding:
   *  - the user themselves
   *  - users already liked / passed
   *  - users blocked or who blocked them
   */
  async getFeed(userId: string, filters: DiscoveryFilters = {}, limit = 20) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });
    if (!user) throw AppError.notFound('Utilisateur introuvable');

    // Free-tier daily limit for men
    if (user.gender === 'MALE') {
      const isSubscribed = this.isSubscribed(user.subscription);
      if (!isSubscribed) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const viewedToday = await prisma.like.count({
          where: { senderId: userId, createdAt: { gte: startOfDay } },
        });
        if (viewedToday >= config.freeTierLimits.dailyProfileViews) {
          throw AppError.forbidden(
            `Limite quotidienne atteinte (${config.freeTierLimits.dailyProfileViews} profils/jour). Abonnez-vous pour un accès illimité.`,
          );
        }
      }
    }

    // Target gender: simple heteronormative default - swap as needed
    let targetGender: 'FEMALE' | 'MALE' | undefined;
    if (user.gender === 'MALE') targetGender = 'FEMALE';
    else if (user.gender === 'FEMALE') targetGender = 'MALE';
    // NON_BINARY / UNDISCLOSED: see everyone

    const alreadyInteracted = await prisma.like.findMany({
      where: { senderId: userId },
      select: { receiverId: true },
    });
    const blockedByMe = await prisma.block.findMany({
      where: { blockerId: userId },
      select: { blockedId: true },
    });
    const blockedMe = await prisma.block.findMany({
      where: { blockedId: userId },
      select: { blockerId: true },
    });
    const excludeIds = new Set<string>([
      userId,
      ...alreadyInteracted.map((l: { receiverId: string }) => l.receiverId),
      ...blockedByMe.map((b: { blockedId: string }) => b.blockedId),
      ...blockedMe.map((b: { blockerId: string }) => b.blockerId),
    ]);

    const minAge = filters.minAge ?? 18;
    const maxAge = filters.maxAge ?? 99;
    const maxBirth = new Date();
    maxBirth.setFullYear(maxBirth.getFullYear() - minAge);
    const minBirth = new Date();
    minBirth.setFullYear(minBirth.getFullYear() - maxAge - 1);

    const candidates = await prisma.user.findMany({
      where: {
        id: { notIn: Array.from(excludeIds) },
        status: 'ACTIVE',
        isVerified: true,
        ...(targetGender && { gender: targetGender }),
        birthDate: { gte: minBirth, lte: maxBirth },
        ...(filters.city && { city: { equals: filters.city, mode: 'insensitive' } }),
        ...(filters.country && { country: filters.country }),
        ...(filters.religion && filters.religion !== 'UNDISCLOSED'
          ? { religion: filters.religion as any }
          : {}),
        ...(filters.intent && { intent: filters.intent as any }),
        ...(filters.hasChildren !== undefined && { hasChildren: filters.hasChildren }),
      },
      include: { photos: { orderBy: { order: 'asc' } } },
      orderBy: { lastActiveAt: 'desc' },
      take: limit,
    });

    return candidates.map((c: any) => ({
      id: c.id,
      firstName: c.firstName,
      age: calculateAge(c.birthDate),
      city: c.city,
      profession: c.profession,
      bio: c.bio,
      intent: c.intent,
      religion: c.religion,
      isVerified: c.isVerified,
      photos: c.photos,
    }));
  }

  async like(senderId: string, receiverId: string, isSuperLike = false) {
    if (senderId === receiverId) throw AppError.badRequest('Vous ne pouvez pas vous liker');

    const sender = await prisma.user.findUnique({
      where: { id: senderId },
      include: { subscription: true },
    });
    if (!sender) throw AppError.notFound();

    // Daily like limit for free-tier men
    if (sender.gender === 'MALE') {
      const isSubscribed = this.isSubscribed(sender.subscription);
      if (!isSubscribed) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const likesToday = await prisma.like.count({
          where: { senderId, createdAt: { gte: startOfDay } },
        });
        if (likesToday >= config.freeTierLimits.dailyLikes) {
          throw AppError.forbidden(
            `Limite quotidienne de likes atteinte (${config.freeTierLimits.dailyLikes}/jour).`,
          );
        }
      }
    }

    // Check receiver exists and is active
    const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
    if (!receiver || receiver.status !== 'ACTIVE') {
      throw AppError.notFound('Profil introuvable');
    }

    // Save the like (idempotent)
    await prisma.like.upsert({
      where: { senderId_receiverId: { senderId, receiverId } },
      create: { senderId, receiverId, isSuperLike },
      update: { isSuperLike },
    });

    // Did the receiver also like the sender? → Match !
    const reciprocal = await prisma.like.findUnique({
      where: { senderId_receiverId: { senderId: receiverId, receiverId: senderId } },
    });

    if (reciprocal) {
      const [userAId, userBId] = orderUserIds(senderId, receiverId);
      const match = await prisma.match.upsert({
        where: { userAId_userBId: { userAId, userBId } },
        create: { userAId, userBId, status: 'MATCHED' },
        update: { status: 'MATCHED', unmatchedAt: null, unmatchedBy: null },
        include: {
          userA: { include: { photos: true } },
          userB: { include: { photos: true } },
        },
      });
      return { isMatch: true, match };
    }

    return { isMatch: false, match: null };
  }

  async pass(senderId: string, receiverId: string) {
    // Pass is tracked as a "like=false" row via non-creation (we just do nothing)
    // Alternative: track "Pass" in a separate table if we want to let users redo passed profiles
    return { passed: true };
  }

  private isSubscribed(sub: any): boolean {
    if (!sub) return false;
    const now = new Date();
    return (
      sub.status === 'ACTIVE' &&
      sub.plan !== 'FREE' &&
      sub.expiresAt &&
      new Date(sub.expiresAt) > now
    );
  }
}

export const discoveryService = new DiscoveryService();
