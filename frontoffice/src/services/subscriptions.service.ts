import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';

export class SubscriptionsService {
  async getMySubscription(userId: string) {
    const sub = await prisma.subscription.findUnique({
      where: { userId },
    });
    if (!sub) return { plan: 'FREE', status: 'ACTIVE' };
    return sub;
  }

  async cancel(userId: string) {
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (!sub) throw AppError.notFound('Aucun abonnement');
    if (sub.plan === 'FREE') throw AppError.badRequest('Rien à annuler');

    // Mark as non-renewing (keep access until expiration)
    const updated = await prisma.subscription.update({
      where: { userId },
      data: { autoRenew: false, cancelledAt: new Date() },
    });
    return updated;
  }
}

export const subscriptionsService = new SubscriptionsService();
