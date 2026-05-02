import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';

export class EventsService {
  async list(userId: string, country?: string, city?: string) {
    const now = new Date();
    const events = await prisma.event.findMany({
      where: {
        endsAt: { gte: now },
        ...(country && { country }),
        ...(city && { city }),
      },
      orderBy: { startsAt: 'asc' },
      include: {
        participants: { where: { userId } },
        _count: { select: { participants: true } },
      },
    });
    return events.map((e: any) => ({
      ...e,
      participantsCount: e._count.participants,
      hasJoined: e.participants.length > 0,
      participants: undefined,
      _count: undefined,
    }));
  }

  async join(userId: string, eventId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { _count: { select: { participants: true } } },
    });
    if (!event) throw AppError.notFound('Événement introuvable');
    if (event.endsAt < new Date()) throw AppError.badRequest('Événement terminé');

    if (event.maxParticipants && event._count.participants >= event.maxParticipants) {
      throw AppError.badRequest('Événement complet');
    }

    await prisma.eventParticipant.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId },
      update: {},
    });

    return { joined: true };
  }

  async leave(userId: string, eventId: string) {
    await prisma.eventParticipant.deleteMany({ where: { eventId, userId } });
    return { left: true };
  }
}

export const eventsService = new EventsService();

// ================= MODERATION =================

export class ModerationService {
  async report(reporterId: string, reportedUserId: string, reason: any, description?: string) {
    if (reporterId === reportedUserId) {
      throw AppError.badRequest('Vous ne pouvez pas vous signaler vous-même');
    }
    return prisma.report.create({
      data: { reporterId, reportedId: reportedUserId, reason, description, status: 'PENDING' },
    });
  }

  async block(blockerId: string, blockedId: string, reason?: string) {
    if (blockerId === blockedId) throw AppError.badRequest('Vous ne pouvez pas vous bloquer');
    return prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId, reason },
      update: { reason },
    });
  }

  async unblock(blockerId: string, blockedId: string) {
    await prisma.block.deleteMany({ where: { blockerId, blockedId } });
    return { unblocked: true };
  }

  async listBlocks(blockerId: string) {
    return prisma.block.findMany({
      where: { blockerId },
      include: { blocked: { select: { id: true, firstName: true, photos: { take: 1 } } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const moderationService = new ModerationService();

// ================= TRUSTED CIRCLE =================

export class TrustedCircleService {
  async list(ownerId: string) {
    return prisma.trustedCircle.findMany({
      where: { ownerId },
      include: {
        trustee: { select: { id: true, firstName: true, photos: { take: 1 } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async add(ownerId: string, data: { relation: string; trusteePhone?: string; trusteeName?: string }) {
    let trusteeId: string | null = null;
    if (data.trusteePhone) {
      const trustee = await prisma.user.findUnique({ where: { phone: data.trusteePhone } });
      if (trustee) trusteeId = trustee.id;
    }
    return prisma.trustedCircle.create({
      data: {
        ownerId,
        trusteeId,
        trusteeContact: data.trusteePhone || data.trusteeName,
        relation: data.relation,
        canReview: true,
      },
    });
  }

  async remove(ownerId: string, circleId: string) {
    const entry = await prisma.trustedCircle.findUnique({ where: { id: circleId } });
    if (!entry || entry.ownerId !== ownerId) throw AppError.notFound();
    await prisma.trustedCircle.delete({ where: { id: circleId } });
    return { removed: true };
  }
}

export const trustedCircleService = new TrustedCircleService();

// ================= NOTIFICATIONS =================

export class NotificationsService {
  async list(userId: string, page = 1, limit = 30) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where: { userId } }),
    ]);
    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async markRead(userId: string, notificationId: string) {
    const notif = await prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notif || notif.userId !== userId) throw AppError.notFound();
    return prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { markedRead: true };
  }

  async create(userId: string, type: string, title: string, body: string, data?: any) {
    return prisma.notification.create({
      data: { userId, type, title, body, data },
    });
  }
}

export const notificationsService = new NotificationsService();
