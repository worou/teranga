import { prisma } from '../config/prisma';
import { config } from '../config';
import { AppError } from '../utils/AppError';
import { calculateAge, orderUserIds } from '../utils/helpers';

export interface DiscoveryFilters {
  /** Pseudo / recherche plein-texte : prénom, profession, bio, ville. */
  q?: string;
  gender?: string;
  minAge?: number;
  maxAge?: number;
  city?: string;
  country?: string;
  religion?: string;
  intent?: string;
  profession?: string;
  minHeightCm?: number;
  maxHeightCm?: number;
  minWeightKg?: number;
  maxWeightKg?: number;
  bodyType?: string;
  ethnicity?: string;
  /** Code ISO d'une langue parlée (ex. FR, WO). */
  language?: string;
  hasChildren?: boolean;
  wantsChildren?: boolean;
  hasPhoto?: boolean;
  lastActive?: 'all' | 'recent' | 'online';
  /** Inclure les profils n'ayant pas renseigné le critère filtré (défaut : oui). */
  includeUnspecified?: boolean;
}

/**
 * Actif « à l'instant » : fenêtre alignée sur le pas de rafraîchissement de
 * `lastActiveAt` (cf. touchLastActive dans le middleware d'authentification).
 */
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
/** Actif « récemment ». */
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
      const isSubscribed = !config.subscriptionsEnabled || this.isSubscribed(user.subscription);
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

    // Genre recherché. Un filtre explicite l'emporte sur la cible déduite du
    // genre du chercheur : c'est un choix produit, le membre décide qui il veut
    // voir. Sans filtre, on retombe sur le défaut hétéro habituel.
    let targetGender: string | undefined;
    if (filters.gender) targetGender = filters.gender;
    else if (user.gender === 'MALE') targetGender = 'FEMALE';
    else if (user.gender === 'FEMALE') targetGender = 'MALE';
    // NON_BINARY / UNDISCLOSED sans filtre : tout le monde.

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
    const now = Date.now();

    // NB : MariaDB/MySQL — pas de `mode: 'insensitive'` (option Postgres only) ;
    // la casse est gérée par la collation utf8mb4_unicode_ci. `contains` = LIKE %..%.
    // Les critères facultatifs du profil (physique, origine, langues, souhait
    // d'enfants) sont `null` tant que le membre ne les a pas renseignés.
    // `includeUnspecified` (activé par défaut) élargit chaque condition avec
    // « ou non renseigné » : sinon un seul filtre viderait la liste de tous les
    // profils encore incomplets.
    const optional = filters.includeUnspecified !== false;
    const opt = (field: string, condition: unknown) =>
      optional
        ? { OR: [{ [field]: condition }, { [field]: null }] }
        : { [field]: condition };

    // Conditions optionnelles cumulées dans un AND : chacune porte son propre
    // OR « ou non renseigné », qu'un OR de premier niveau écraserait.
    const optionalClauses: Record<string, unknown>[] = [];
    if (filters.bodyType) optionalClauses.push(opt('bodyType', filters.bodyType));
    if (filters.ethnicity) optionalClauses.push(opt('ethnicity', filters.ethnicity));
    if (filters.wantsChildren !== undefined) {
      optionalClauses.push(opt('wantsChildren', filters.wantsChildren));
    }
    if (filters.language) {
      // Sentinelles : « ,FR, » ne peut pas matcher « ,FRA, ».
      optionalClauses.push(opt('languages', { contains: `,${filters.language.toUpperCase()},` }));
    }
    if (filters.minHeightCm !== undefined || filters.maxHeightCm !== undefined) {
      optionalClauses.push(
        opt('heightCm', {
          ...(filters.minHeightCm !== undefined && { gte: filters.minHeightCm }),
          ...(filters.maxHeightCm !== undefined && { lte: filters.maxHeightCm }),
        }),
      );
    }
    if (filters.minWeightKg !== undefined || filters.maxWeightKg !== undefined) {
      optionalClauses.push(
        opt('weightKg', {
          ...(filters.minWeightKg !== undefined && { gte: filters.minWeightKg }),
          ...(filters.maxWeightKg !== undefined && { lte: filters.maxWeightKg }),
        }),
      );
    }

    // Statut de connexion : approximation par `lastActiveAt`, rafraîchi à chaque
    // requête authentifiée. Il n'existe pas de registre de présence temps réel
    // (les sockets ne tiennent pas d'annuaire) — « Connecté » signifie donc
    // « actif il y a moins de 5 minutes », pas « socket ouverte ».
    let activeSince: Date | undefined;
    if (filters.lastActive === 'online') activeSince = new Date(now - ONLINE_WINDOW_MS);
    else if (filters.lastActive === 'recent') activeSince = new Date(now - RECENT_WINDOW_MS);

    const where = {
      id: { notIn: Array.from(excludeIds) },
      status: 'ACTIVE' as const,
      isVerified: true,
      ...(targetGender && { gender: targetGender as any }),
      birthDate: { gte: minBirth, lte: maxBirth },
      ...(filters.city && { city: { contains: filters.city } }),
      ...(filters.country && { country: filters.country }),
      ...(filters.religion && filters.religion !== 'UNDISCLOSED'
        ? { religion: filters.religion as any }
        : {}),
      ...(filters.intent && { intent: filters.intent as any }),
      // `hasChildren` n'est pas nullable (défaut false) : « non renseigné » n'y
      // est pas représentable, le filtre reste donc strict.
      ...(filters.hasChildren !== undefined && { hasChildren: filters.hasChildren }),
      ...(filters.profession && { profession: { contains: filters.profession } }),
      ...(filters.hasPhoto && { photos: { some: {} } }),
      ...(activeSince && { lastActiveAt: { gte: activeSince } }),
      ...(optionalClauses.length && { AND: optionalClauses }),
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
      const isSubscribed = !config.subscriptionsEnabled || this.isSubscribed(sender.subscription);
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

  /**
   * Accès payant actif. Quand le système d'abonnement est désactivé (version 1),
   * les appelants court-circuitent ce prédicat : tout le monde a l'accès complet.
   */
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
