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
  profession?: string;
  /** Recherche plein-texte : prénom, profession, bio, ville. */
  q?: string;
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

    const q = filters.q?.trim();

    // NB : MariaDB/MySQL — pas de `mode: 'insensitive'` (option Postgres only) ;
    // la casse est gérée par la collation utf8mb4_unicode_ci. `contains` = LIKE %..%.
    const where = {
      id: { notIn: Array.from(excludeIds) },
      status: 'ACTIVE' as const,
      isVerified: true,
      ...(targetGender && { gender: targetGender }),
      birthDate: { gte: minBirth, lte: maxBirth },
      ...(filters.city && { city: { contains: filters.city } }),
      ...(filters.country && { country: filters.country }),
      ...(filters.religion && filters.religion !== 'UNDISCLOSED'
        ? { religion: filters.religion as any }
        : {}),
      ...(filters.intent && { intent: filters.intent as any }),
      ...(filters.hasChildren !== undefined && { hasChildren: filters.hasChildren }),
      ...(filters.profession && { profession: { contains: filters.profession } }),
      ...(q && {
        OR: [
          { firstName: { contains: q } },
          { profession: { contains: q } },
          { bio: { contains: q } },
          { city: { contains: q } },
        ],
      }),
    };

    // On récupère un vivier plus large que `limit`, puis on classe par score de
    // pertinence côté application (compatibilité + activité), et on renvoie le top.
    const poolSize = Math.min(Math.max(limit * 5, limit), 200);
    const pool = await prisma.user.findMany({
      where,
      include: { photos: { orderBy: { order: 'asc' } } },
      orderBy: { lastActiveAt: 'desc' },
      take: poolSize,
    });

    const now = Date.now();
    const searcherAge = calculateAge(user.birthDate);

    const scored = pool
      .map((c: any) => ({ c, ...this.compatibilityScore(user, searcherAge, c, now) }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          new Date(b.c.lastActiveAt).getTime() - new Date(a.c.lastActiveAt).getTime(),
      );

    return scored.slice(0, limit).map(({ c, score, sharedTraits }) => ({
      id: c.id,
      firstName: c.firstName,
      age: calculateAge(c.birthDate),
      city: c.city,
      // Téranga couvre 8 pays : la carte l'affiche, comme la ville.
      country: c.country,
      profession: c.profession,
      bio: c.bio,
      intent: c.intent,
      religion: c.religion,
      isVerified: c.isVerified,
      photos: c.photos,
      score,
      sharedTraits,
    }));
  }

  /**
   * Score de compatibilité (0 → ~105) : même ville/pays, intention et religion
   * communes, proximité d'âge, activité récente, présence de photos.
   */
  private compatibilityScore(
    searcher: any,
    searcherAge: number,
    c: any,
    now: number,
  ): { score: number; sharedTraits: Record<string, boolean> } {
    let score = 0;

    const sameCity =
      !!searcher.city && !!c.city && searcher.city.toLowerCase() === c.city.toLowerCase();
    const sameCountry = !!searcher.country && searcher.country === c.country;
    if (sameCity) score += 25;
    else if (sameCountry) score += 10;

    const sameIntent = searcher.intent === c.intent;
    if (sameIntent) score += 20;

    const sameReligion =
      searcher.religion !== 'UNDISCLOSED' &&
      c.religion !== 'UNDISCLOSED' &&
      searcher.religion === c.religion;
    if (sameReligion) score += 15;

    // Proximité d'âge : 15 pts, -1,5 pt par année d'écart.
    const ageDiff = Math.abs(searcherAge - calculateAge(c.birthDate));
    score += Math.max(0, 15 - ageDiff * 1.5);

    // Activité récente : 20 pts, décroissant linéairement sur 30 jours.
    const daysInactive = (now - new Date(c.lastActiveAt).getTime()) / 86_400_000;
    score += Math.max(0, 20 - (daysInactive / 30) * 20);

    // Profil avec photo.
    if (c.photos && c.photos.length > 0) score += 10;

    return {
      score: Math.round(score),
      sharedTraits: { sameCity, sameCountry, sameIntent, sameReligion },
    };
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
