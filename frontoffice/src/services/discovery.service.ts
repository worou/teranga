import { prisma } from '../config/prisma';
import { config } from '../config';
import { AppError } from '../utils/AppError';
import { calculateAge } from '../utils/helpers';

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
  /**
   * Fil de profils. `userId` vaut `null` pour un visiteur non connecté : il voit
   * la même liste, en moins personnalisée — pas d'exclusion de ses propres
   * interactions (il n'en a pas), pas de score de compatibilité ni de traits
   * communs (il n'y a personne à comparer), et aucun genre cible par défaut.
   * Le tri retombe alors sur l'activité récente.
   */
  async getFeed(userId: string | null, filters: DiscoveryFilters = {}, limit = 20) {
    const user = userId
      ? await prisma.user.findUnique({
          where: { id: userId },
          include: { subscription: true },
        })
      : null;
    if (userId && !user) throw AppError.notFound('Utilisateur introuvable');

    // Free-tier daily limit for men
    if (user && user.gender === 'MALE') {
      const isSubscribed = !config.subscriptionsEnabled || this.isSubscribed(user.subscription);
      if (!isSubscribed) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const viewedToday = await prisma.like.count({
          where: { senderId: user.id, createdAt: { gte: startOfDay } },
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
    else if (user?.gender === 'MALE') targetGender = 'FEMALE';
    else if (user?.gender === 'FEMALE') targetGender = 'MALE';
    // NON_BINARY / UNDISCLOSED sans filtre : tout le monde.

    // Un visiteur anonyme n'a ni likes passés ni blocages : rien à exclure.
    const excludeIds = new Set<string>();
    if (userId) {
      const [alreadyInteracted, blockedByMe, blockedMe] = await Promise.all([
        prisma.like.findMany({ where: { senderId: userId }, select: { receiverId: true } }),
        prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
        prisma.block.findMany({ where: { blockedId: userId }, select: { blockerId: true } }),
      ]);
      excludeIds.add(userId);
      alreadyInteracted.forEach((l: { receiverId: string }) => excludeIds.add(l.receiverId));
      blockedByMe.forEach((b: { blockedId: string }) => excludeIds.add(b.blockedId));
      blockedMe.forEach((b: { blockerId: string }) => excludeIds.add(b.blockerId));
    }

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
      // « Avec photo » désigne une photo qu'on VERRA. Un profil qui en a
      // déposé mais ne les publie pas ne satisfait pas cette demande : il
      // s'afficherait avec une initiale, comme un profil sans photo.
      ...(filters.hasPhoto && { photos: { some: {} }, photosVisibility: 'PUBLIC' as const }),
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

    // Sans chercheur, on garde l'ordre du vivier (activité récente) et on
    // n'invente ni score ni traits communs.
    const scored = user
      ? pool
          .map((c: any) => ({
            c,
            ...this.compatibilityScore(user, calculateAge(user.birthDate), c, now),
          }))
          .sort(
            (a, b) =>
              b.score - a.score ||
              new Date(b.c.lastActiveAt).getTime() - new Date(a.c.lastActiveAt).getTime(),
          )
      : pool.map((c: any) => ({ c, score: undefined, sharedTraits: undefined }));

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
      // Asymétrie voulue, et ce n'est pas un oubli : les photos disparaissent
      // du fil quand le membre ne les publie pas, mais le score plus bas
      // continue de compter leur présence. Le bonus récompense d'avoir
      // déposé une photo — la preuve qu'il y a quelqu'un derrière le compte —
      // pas de l'avoir exposée. Choisir la discrétion ne doit pas reléguer en
      // fin de liste.
      photos: c.photosVisibility === 'PRIVATE' ? [] : c.photos,
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

    // Le like ne crée plus rien d'autre que lui-même.
    //
    // Il ouvrait auparavant une conversation dès qu'il était réciproque : c'est
    // le système de match, retiré. Écrire ne suppose plus d'accord préalable
    // (voir `conversations.service`), le like n'est donc qu'un signal d'intérêt.
    // On indique tout de même la réciprocité : elle reste une information utile
    // à afficher, elle ne débloque simplement plus rien.
    const reciprocal = await prisma.like.findUnique({
      where: { senderId_receiverId: { senderId: receiverId, receiverId: senderId } },
    });

    return { liked: true, reciprocal: !!reciprocal };
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
