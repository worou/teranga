import { prisma } from '../config/prisma';
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

export class MatchesService {
  async getMatches(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const matches = await prisma.match.findMany({
      where: {
        AND: [
          { OR: [{ userAId: userId }, { userBId: userId }] },
          { status: 'MATCHED' },
        ],
      },
      include: {
        userA: { include: { photos: { orderBy: { order: 'asc' }, take: 1 } } },
        userB: { include: { photos: { orderBy: { order: 'asc' }, take: 1 } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { matchedAt: 'desc' },
      skip,
      take: limit,
    });

    const total = await prisma.match.count({
      where: {
        AND: [
          { OR: [{ userAId: userId }, { userBId: userId }] },
          { status: 'MATCHED' },
        ],
      },
    });

    const formatted = await Promise.all(
      matches.map(async (m: any) => {
        const other = m.userAId === userId ? m.userB : m.userA;
        const unread = await prisma.message.count({
          where: { matchId: m.id, senderId: { not: userId }, readAt: null },
        });
        return {
          id: m.id,
          otherUser: {
            id: other.id,
            firstName: other.firstName,
            age: calculateAge(other.birthDate),
            city: other.city,
            profession: other.profession,
            isVerified: other.isVerified,
            photos: other.photos,
          },
          matchedAt: m.matchedAt,
          lastMessage: m.messages[0] || null,
          unreadCount: unread,
        };
      }),
    );

    return {
      data: formatted,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async unmatch(userId: string, matchId: string) {
    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw AppError.notFound('Match introuvable');
    if (match.userAId !== userId && match.userBId !== userId) {
      throw AppError.forbidden();
    }

    await prisma.match.update({
      where: { id: matchId },
      data: { status: 'UNMATCHED', unmatchedAt: new Date(), unmatchedBy: userId },
    });
    return { unmatched: true };
  }

  async getMessages(userId: string, matchId: string, page = 1, limit = 50) {
    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw AppError.notFound('Match introuvable');
    if (match.userAId !== userId && match.userBId !== userId) {
      throw AppError.forbidden();
    }
    if (match.status !== 'MATCHED') throw AppError.forbidden('Ce match n\'est plus actif');

    const skip = (page - 1) * limit;

    const messages = await prisma.message.findMany({
      where: { matchId, blockedByAi: false },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    const total = await prisma.message.count({ where: { matchId, blockedByAi: false } });

    // Mark received messages as read
    await prisma.message.updateMany({
      where: { matchId, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    });

    return {
      data: messages.reverse(), // return oldest first
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async sendMessage(userId: string, matchId: string, content: string) {
    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw AppError.notFound('Match introuvable');
    if (match.userAId !== userId && match.userBId !== userId) {
      throw AppError.forbidden();
    }
    if (match.status !== 'MATCHED') throw AppError.forbidden('Ce match n\'est plus actif');

    // Anti-brouteur + harassment analysis
    const analysis = analyzeMessageForSafety(content);

    if (analysis.blocked) {
      // Save the blocked message (for moderation review) but don't expose it
      await prisma.message.create({
        data: {
          matchId,
          senderId: userId,
          content,
          flaggedByAi: true,
          flagReason: analysis.reason,
          blockedByAi: true,
        },
      });

      // If scam: auto-report to moderation
      if (analysis.reason === 'scam_money_request') {
        const otherId = match.userAId === userId ? match.userBId : match.userAId;
        await prisma.report.create({
          data: {
            reporterId: otherId, // reported FOR them (they are the potential victim)
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
        matchId,
        senderId: userId,
        content,
        flaggedByAi: analysis.flagged,
      },
    });

    return message;
  }
}

export const matchesService = new MatchesService();
