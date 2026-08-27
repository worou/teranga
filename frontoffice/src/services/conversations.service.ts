import { prisma } from '../config/prisma';
import { config } from '../config';
import { AppError } from '../utils/AppError';
import { calculateAge, orderUserIds } from '../utils/helpers';

/**
 * Anti-brouteur (scam) filter — detects money / emergency / impersonation patterns.
 * In production, would call a model API (OpenAI moderation, Sightengine, or custom).
 */
const SCAM_PATTERNS = [
  /envoi?(er|s)?\s+.*(de\s+l['']?\s*)?argent/i,
  /transfert\s+d['']?\s*argent/i,
  /mobile\s*money\s+.*(envoi|transfer)/i,
  /western\s*union/i,
  /moneygram/i,
  /ria\s+transfer/i,
  /besoin\s+de\s+\d+/i,
  /urgence\s+(argent|financi)/i,
  /maman\s+(est\s+)?malade/i,
  /mère\s+(est\s+)?malade/i,
  /papa\s+(est\s+)?à\s+l['']?hôpital/i,
  /hôpital.*argent/i,
  /bloqué\s+à\s+l['']?aéroport/i,
  /visa\s+.*(urgent|besoin|manque)/i,
  /gift\s+card/i,
  /bitcoin/i,
  /crypto/i,
  /iban/i,
  /rib\b/i,
];

const HARASSMENT_PATTERNS = [
  /\bbitch\b/i,
  /\bputain\b/i,
  /salope/i,
  /connard/i,
  /imb[eé]cile/i,
  /\bnique\b/i,
];

export function analyzeMessageForSafety(content: string): {
  blocked: boolean;
  flagged: boolean;
  reason?: 'scam_money_request' | 'harassment' | 'sexual_content' | 'hate_speech';
} {
  if (SCAM_PATTERNS.some((r) => r.test(content))) {
    return { blocked: true, flagged: true, reason: 'scam_money_request' };
  }
  if (HARASSMENT_PATTERNS.some((r) => r.test(content))) {
    return { blocked: true, flagged: true, reason: 'harassment' };
  }
  return { blocked: false, flagged: false };
}

/**
 * Message tel qu'exposé par l'API.
 *
 * Deux écarts volontaires avec la ligne en base :
 *
 * - `matchId` est publié sous le nom `conversationId`. La table s'appelle
 *   toujours `Match` (voir l'en-tête du modèle dans le schéma), mais la notion
 *   de match n'existe plus côté produit : l'API ne doit pas la faire survivre.
 * - `flaggedByAi`, `flagReason` et `blockedByAi` ne sortent pas. Ce sont des
 *   champs de modération ; les exposer renseignerait un expéditeur malveillant
 *   sur ce que le filtre détecte.
 */
function toMessage(m: {
  id: string;
  matchId: string;
  senderId: string;
  content: string;
  readAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: m.id,
    conversationId: m.matchId,
    senderId: m.senderId,
    content: m.content,
    readAt: m.readAt,
    createdAt: m.createdAt,
  };
}

/**
 * Violation de contrainte d'unicité Prisma (P2002).
 *
 * Testé sur le nom du constructeur plutôt que par `instanceof` : c'est la
 * convention déjà retenue dans `errorHandler.ts`, qui évite d'importer le
 * runtime Prisma pour un simple test de type.
 */
function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    err.constructor?.name === 'PrismaClientKnownRequestError' &&
    (err as { code?: string }).code === 'P2002'
  );
}

export class ConversationsService {
  /**
   * Deux membres peuvent-ils s'écrire ?
   *
   * ⚠️ Garde-fou central depuis l'ouverture de la messagerie à tous. Tant
   * qu'écrire supposait un match, la réciprocité du like suffisait à écarter
   * les importuns : personne ne pouvait vous atteindre sans votre accord.
   * Ce n'est plus vrai — le blocage est désormais la seule barrière, et sans
   * ce contrôle « bloquer » ne bloquerait rien.
   *
   * Le message reste neutre dans les deux sens : dire « cette personne vous a
   * bloqué » renseignerait l'expéditeur sur une décision qui ne le regarde pas.
   */
  private async assertNotBlocked(userId: string, otherUserId: string) {
    const block = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: otherUserId },
          { blockerId: otherUserId, blockedId: userId },
        ],
      },
    });
    if (block) {
      throw AppError.forbidden("Vous ne pouvez pas écrire à ce membre.");
    }
  }

  /**
   * Ouvre — ou retrouve — la conversation entre deux membres.
   *
   * La ligne n'est créée qu'ici, c'est-à-dire au premier message effectivement
   * envoyé. Consulter une fiche n'en crée aucune : sans quoi une simple visite
   * ferait apparaître une conversation vide dans la liste de l'autre.
   */
  async openConversation(userId: string, otherUserId: string) {
    // Atteignable depuis que la conversation naît d'un identifiant de membre :
    // rien n'empêche d'y passer le sien. `like()` pose la même garde.
    if (userId === otherUserId) {
      throw AppError.badRequest("Vous ne pouvez pas vous écrire à vous-même");
    }

    const other = await prisma.user.findUnique({ where: { id: otherUserId } });
    if (!other || other.status !== 'ACTIVE') throw AppError.notFound('Profil introuvable');

    await this.assertNotBlocked(userId, otherUserId);

    const [userAId, userBId] = orderUserIds(userId, otherUserId);
    const key = { userAId_userBId: { userAId, userBId } };

    const existing = await prisma.match.findUnique({ where: key });
    if (existing) return existing;

    // Le quota ne se vérifie qu'ici, sur la branche « nouvelle conversation » :
    // répondre à quelqu'un ne consomme rien.
    await this.assertDailyQuota(userId);

    try {
      return await prisma.match.create({ data: { userAId, userBId, status: 'MATCHED' } });
    } catch (err) {
      // Course : la lecture et la création ne sont pas atomiques, et deux
      // premiers messages partis en même temps — un double-clic suffit —
      // trouvent tous deux `null` puis tentent tous deux la création. Le
      // second heurte `Match_userAId_userBId_key` et remontait en 409
      // « Cette ressource existe déjà », ce qui n'a aucun sens pour un
      // expéditeur.
      //
      // Un `upsert` serait atomique, mais ne laisserait pas la place au
      // contrôle de quota, qui doit distinguer ouverture et réponse. On
      // rattrape donc la collision : elle prouve que la conversation existe.
      if (isUniqueConstraintError(err)) {
        const raced = await prisma.match.findUnique({ where: key });
        if (raced) return raced;
      }
      throw err;
    }
  }

  /**
   * Frein anti-spam : nombre de conversations ouvertes aujourd'hui.
   *
   * On ne peut pas simplement compter les conversations créées ce jour où le
   * membre figure — il serait pénalisé par les gens qui lui écrivent. C'est
   * l'auteur du **premier** message qui a ouvert la conversation, et lui seul.
   */
  private async assertDailyQuota(userId: string) {
    const max = config.messaging.dailyNewConversations;
    if (!Number.isFinite(max) || max <= 0) return;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const startedToday = await prisma.match.findMany({
      where: {
        matchedAt: { gte: startOfDay },
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      select: {
        // Le premier message, bloqué ou non : une conversation ouverte pour y
        // déposer une arnaque a bel et bien été ouverte.
        messages: { orderBy: { createdAt: 'asc' }, take: 1, select: { senderId: true } },
      },
    });

    const openedByMe = startedToday.filter((c) => c.messages[0]?.senderId === userId).length;
    if (openedByMe >= max) {
      throw AppError.forbidden(
        `Vous avez ouvert ${max} conversations aujourd'hui, la limite est atteinte. Vous pouvez continuer à répondre dans vos conversations en cours.`,
      );
    }
  }

  /**
   * Total des messages non lus, en une requête.
   *
   * L'en-tête a besoin de ce seul chiffre et le relit à chaque navigation.
   * Il passait par la liste complète des conversations — acceptable quand une
   * conversation exigeait un like réciproque, plus du tout depuis que
   * n'importe qui peut écrire à n'importe qui : la liste grandit sans borne, et
   * elle comptait les non-lus par un `count()` **par conversation**.
   */
  async getUnreadCount(userId: string) {
    const unread = await prisma.message.count({
      where: {
        senderId: { not: userId },
        readAt: null,
        blockedByAi: false,
        match: {
          status: 'MATCHED',
          OR: [{ userAId: userId }, { userBId: userId }],
        },
      },
    });
    return { unread };
  }

  /**
   * La conversation avec ce membre, si elle existe — sans jamais la créer.
   * Sert à la fiche de profil, qui doit pouvoir afficher un historique sans
   * laisser de trace du seul fait qu'on l'a consultée.
   */
  async findConversationWith(userId: string, otherUserId: string) {
    const [userAId, userBId] = orderUserIds(userId, otherUserId);
    const conversation = await prisma.match.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
      include: {
        messages: {
          where: { blockedByAi: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!conversation) return null;

    const unreadCount = await prisma.message.count({
      where: {
        matchId: conversation.id,
        senderId: { not: userId },
        readAt: null,
        blockedByAi: false,
      },
    });

    return {
      id: conversation.id,
      startedAt: conversation.matchedAt,
      lastMessage: conversation.messages[0] ? toMessage(conversation.messages[0]) : null,
      unreadCount,
    };
  }

  /**
   * Conversations du membre.
   *
   * Filtrées sur « au moins un message visible » : une conversation ouverte
   * puis abandonnée, ou dont le premier message a été arrêté par l'IA
   * anti-brouteur, n'a rien à faire dans la liste de personne.
   */
  /**
   * Colonnes du correspondant réellement affichées dans la liste.
   *
   * `select` et non `include` : `include` ramenait toute la ligne User —
   * `phone`, `passwordHash`, `birthDate` — pour n'en garder ensuite qu'une
   * poignée. La projection manuelle qui suit empêchait la fuite, mais rien ne
   * l'imposait ; ici la base ne renvoie que le nécessaire.
   */
  private static readonly CORRESPONDENT_SELECT = {
    id: true,
    firstName: true,
    birthDate: true,
    city: true,
    profession: true,
    isVerified: true,
    photos: { orderBy: { order: 'asc' as const }, take: 1 },
    // Nécessaire pour honorer le choix du correspondant : la messagerie est
    // une surface publique comme les autres. Une photo masquée dans le fil
    // qui réapparaîtrait dans la liste des conversations ne serait pas
    // masquée du tout.
    photosVisibility: true,
  };

  async getConversations(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const where = {
      AND: [
        { OR: [{ userAId: userId }, { userBId: userId }] },
        { status: 'MATCHED' as const },
        { messages: { some: { blockedByAi: false } } },
      ],
    };

    const [conversations, total] = await Promise.all([
      prisma.match.findMany({
        where,
        select: {
          id: true,
          userAId: true,
          matchedAt: true,
          userA: { select: ConversationsService.CORRESPONDENT_SELECT },
          userB: { select: ConversationsService.CORRESPONDENT_SELECT },
          // `blockedByAi: false` — même filtre que `getMessages`. Sans lui, un
          // message arrêté par l'IA anti-brouteur reste invisible dans le fil
          // mais s'affiche en aperçu dans la liste : la demande d'argent
          // atteindrait sa cible par la porte de derrière.
          messages: { where: { blockedByAi: false }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { matchedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.match.count({ where }),
    ]);

    // Compteurs de non-lus : un seul groupBy pour toute la page.
    //
    // Auparavant, un `count()` était émis par conversation à l'intérieur d'un
    // `Promise.all` — vingt conversations affichées, vingt allers-retours
    // supplémentaires. Le coût croissait avec la taille de la page, alors que
    // la question posée est la même pour toutes.
    //
    // Idem que ci-dessus : compter un message bloqué gonflerait une pastille
    // que rien ne permet de faire retomber, puisque le fil ne le montre jamais.
    const unreadByConversation = new Map<string, number>();
    if (conversations.length > 0) {
      const grouped = await prisma.message.groupBy({
        by: ['matchId'],
        where: {
          matchId: { in: conversations.map((c: any) => c.id) },
          senderId: { not: userId },
          readAt: null,
          blockedByAi: false,
        },
        _count: { _all: true },
      });
      for (const row of grouped as any[]) {
        unreadByConversation.set(row.matchId, row._count._all);
      }
    }

    const formatted = conversations.map((c: any) => {
      const other = c.userAId === userId ? c.userB : c.userA;
      return {
        id: c.id,
        otherUser: {
          id: other.id,
          firstName: other.firstName,
          age: calculateAge(other.birthDate),
          city: other.city,
          profession: other.profession,
          isVerified: other.isVerified,
          photos: other.photosVisibility === 'PRIVATE' ? [] : other.photos,
        },
        startedAt: c.matchedAt,
        lastMessage: c.messages[0] ? toMessage(c.messages[0]) : null,
        unreadCount: unreadByConversation.get(c.id) ?? 0,
      };
    });

    return {
      data: formatted,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Vrai si `userId` participe à cette conversation.
   *
   * Variante sans exception d'`assertParticipant`, pour les appelants qui ne
   * répondent pas en HTTP — la couche socket, notamment, qui doit refuser une
   * inscription à une salle sans faire tomber la connexion.
   */
  async isParticipant(userId: string, conversationId: string): Promise<boolean> {
    const conversation = await prisma.match.findUnique({
      where: { id: conversationId },
      select: { userAId: true, userBId: true, status: true },
    });
    if (!conversation || conversation.status !== 'MATCHED') return false;
    return conversation.userAId === userId || conversation.userBId === userId;
  }

  /** Participant de cette conversation, ou 403. */
  private async assertParticipant(userId: string, conversationId: string) {
    const conversation = await prisma.match.findUnique({ where: { id: conversationId } });
    if (!conversation) throw AppError.notFound('Conversation introuvable');
    if (conversation.userAId !== userId && conversation.userBId !== userId) {
      throw AppError.forbidden();
    }
    // `status` n'est plus jamais mis à UNMATCHED : rompre un match n'existe
    // plus. Le contrôle reste en place — il redeviendrait la garde d'une
    // fermeture de conversation, si elle est un jour ajoutée — mais il ne peut
    // pas se déclencher aujourd'hui. Ne pas le lire comme une protection active.
    if (conversation.status !== 'MATCHED') {
      throw AppError.forbidden("Cette conversation est fermée");
    }
    return conversation;
  }

  /**
   * Fil d'une conversation.
   *
   * Lisible même après un blocage : bloquer arrête les messages à venir, cela
   * n'efface pas ceux qui ont été échangés. Seul `sendMessage` refuse.
   *
   * ⚠️ Effet de bord assumé : marque les messages reçus comme lus.
   */
  async getMessages(
    userId: string,
    conversationId: string,
    page = 1,
    limit = 50,
    since?: Date,
  ) {
    await this.assertParticipant(userId, conversationId);

    // Lecture incrémentale : le client redemande seulement ce qui a suivi le
    // dernier message qu'il détient. Sans elle, chaque sondage — toutes les
    // huit secondes, pour chaque fil ouvert — relisait cinquante messages et
    // les retransmettait intégralement.
    //
    // `gte` et non `gt` : deux messages peuvent partager la milliseconde, et un
    // `gt` en perdrait un. Le recouvrement d'une borne est assumé, le client
    // dédoublonne par identifiant.
    const incremental = since !== undefined;

    const where = {
      matchId: conversationId,
      blockedByAi: false,
      ...(incremental ? { createdAt: { gte: since } } : {}),
    };

    const messages = await prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...(incremental ? {} : { skip: (page - 1) * limit }),
      take: limit,
    });

    // Le total ne sert qu'à la pagination du premier chargement. Une lecture
    // incrémentale ne pagine rien : on économise le COUNT et on annonce
    // `total: null` plutôt que de faire passer la taille du fragment pour la
    // taille du fil.
    const total = incremental
      ? null
      : await prisma.message.count({ where: { matchId: conversationId, blockedByAi: false } });

    // Rien de neuf à marquer comme lu : c'est le cas qui se présente à chaque
    // sondage d'un fil au repos, autant ne pas écrire pour rien.
    if (!incremental || messages.length > 0) {
      await prisma.message.updateMany({
        where: { matchId: conversationId, senderId: { not: userId }, readAt: null },
        data: { readAt: new Date() },
      });
    }

    return {
      data: messages.reverse().map(toMessage), // du plus ancien au plus récent
      pagination: {
        page,
        limit,
        total,
        totalPages: total === null ? null : Math.ceil(total / limit),
      },
    };
  }

  /** Envoie un message dans une conversation déjà ouverte. */
  async sendMessage(userId: string, conversationId: string, content: string) {
    const conversation = await this.assertParticipant(userId, conversationId);

    // Le blocage se vérifie à *chaque* envoi, pas seulement à l'ouverture :
    // une conversation ouverte avant le blocage garde un identifiant valide,
    // et rien n'empêcherait d'y écrire indéfiniment.
    const otherId = conversation.userAId === userId ? conversation.userBId : conversation.userAId;
    await this.assertNotBlocked(userId, otherId);

    return this.persist(userId, conversationId, otherId, content);
  }

  /**
   * Envoie un message à un membre, en ouvrant la conversation si besoin.
   * C'est le chemin d'entrée de la messagerie ouverte : on écrit à une
   * personne, plus à un match.
   */
  async sendMessageTo(userId: string, otherUserId: string, content: string) {
    const conversation = await this.openConversation(userId, otherUserId);
    return this.persist(userId, conversation.id, otherUserId, content);
  }

  /** Analyse anti-brouteur puis enregistrement. Commun aux deux chemins d'envoi. */
  private async persist(
    userId: string,
    conversationId: string,
    otherId: string,
    content: string,
  ) {
    const analysis = analyzeMessageForSafety(content);

    if (analysis.blocked) {
      // Le message refusé est conservé pour la modération, mais n'est jamais
      // rendu — ni au destinataire, ni à son auteur.
      await prisma.message.create({
        data: {
          matchId: conversationId,
          senderId: userId,
          content,
          flaggedByAi: true,
          flagReason: analysis.reason,
          blockedByAi: true,
        },
      });

      if (analysis.reason === 'scam_money_request') {
        await prisma.report.create({
          data: {
            reporterId: otherId, // signalé POUR lui : c'est la victime potentielle
            reportedId: userId,
            reason: 'SCAM',
            description: `Auto-signalement: demande d'argent détectée par IA. Message: "${content.slice(0, 200)}"`,
            status: 'PENDING',
          },
        });
      }

      throw AppError.forbidden(
        analysis.reason === 'scam_money_request'
          ? "Votre message a été bloqué par notre IA anti-brouteur. Ne jamais envoyer d'argent à une personne rencontrée ici."
          : analysis.reason === 'harassment'
          ? 'Votre message contient des propos inappropriés et a été bloqué.'
          : 'Votre message a été bloqué par notre modération.',
      );
    }

    const message = await prisma.message.create({
      data: {
        matchId: conversationId,
        senderId: userId,
        content,
        flaggedByAi: analysis.flagged,
      },
    });

    return toMessage(message);
  }
}

export const conversationsService = new ConversationsService();
