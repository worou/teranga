import cron from 'node-cron';
import { prisma } from '../config/prisma';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Cycle de vie des abonnements (auto-renouvellement).
 *
 * Le mobile money ouest-africain ne permet pas de prélèvement récurrent
 * automatique fiable (pas de tokenisation généralisée). L'« auto-renouvellement »
 * consiste donc à :
 *   1. marquer EXPIRED les abonnements arrivés à échéance ;
 *   2. envoyer un rappel J-3 aux utilisateurs ayant activé `autoRenew`, avec un
 *      lien de re-paiement (relance vers l'écran d'abonnement pré-rempli).
 *
 * `runSubscriptionLifecycle()` est la fonction cœur, sans dépendance au cron :
 * elle est appelée par le planificateur et peut être déclenchée manuellement
 * (endpoint admin, script, test).
 */

/** Construit le lien de re-paiement pour un plan donné. */
function renewLink(plan: string): string {
  return `${config.apiBaseUrl}${config.subscriptions.renewPath}?renew=1&plan=${plan}`;
}

/**
 * Marque EXPIRED les abonnements ACTIVE dont la date d'expiration est passée,
 * et notifie chaque utilisateur concerné.
 */
export async function expireSubscriptions(now = new Date()): Promise<number> {
  const expired = await prisma.subscription.findMany({
    where: { status: 'ACTIVE', expiresAt: { lt: now } },
    select: { id: true, userId: true, plan: true },
  });
  if (expired.length === 0) return 0;

  await prisma.$transaction([
    prisma.subscription.updateMany({
      where: { id: { in: expired.map((s) => s.id) } },
      data: { status: 'EXPIRED' },
    }),
    prisma.notification.createMany({
      data: expired.map((s) => ({
        userId: s.userId,
        type: 'subscription_expired',
        title: 'Votre abonnement a expiré',
        body: 'Renouvelez votre abonnement Téranga pour continuer à échanger.',
        data: { plan: s.plan, action: 'renew', url: renewLink(s.plan) },
      })),
    }),
  ]);

  logger.info('Subscriptions expired', { count: expired.length });
  return expired.length;
}

/**
 * Envoie un rappel de renouvellement aux abonnements actifs (auto-renew) qui
 * expirent dans les `reminderDaysBefore` jours et n'ont pas encore été relancés
 * pour ce cycle. Un seul rappel par cycle grâce à `lastReminderAt`.
 */
export async function sendRenewalReminders(now = new Date()): Promise<number> {
  const windowMs = config.subscriptions.reminderDaysBefore * 24 * 60 * 60 * 1000;
  const windowEnd = new Date(now.getTime() + windowMs);

  const candidates = await prisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
      autoRenew: true,
      plan: { not: 'FREE' },
      expiresAt: { gt: now, lte: windowEnd },
    },
    include: { user: { select: { firstName: true } } },
  });

  // Un rappel par cycle : pas encore relancé (null) ou relancé avant l'entrée
  // dans la fenêtre courante (cas d'un renouvellement entre-temps).
  const due = candidates.filter(
    (s) => s.expiresAt && (!s.lastReminderAt || s.lastReminderAt.getTime() < s.expiresAt.getTime() - windowMs),
  );
  if (due.length === 0) return 0;

  for (const sub of due) {
    const days = Math.max(1, Math.ceil((sub.expiresAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
    await prisma.$transaction([
      prisma.notification.create({
        data: {
          userId: sub.userId,
          type: 'subscription_expiring',
          title: `Votre abonnement expire dans ${days} jour${days > 1 ? 's' : ''}`,
          body: `Bonjour ${sub.user.firstName}, renouvelez votre abonnement Téranga pour ne pas perdre l'accès à la messagerie.`,
          data: {
            plan: sub.plan,
            expiresAt: sub.expiresAt,
            action: 'renew',
            url: renewLink(sub.plan),
          },
        },
      }),
      prisma.subscription.update({
        where: { id: sub.id },
        data: { lastReminderAt: now },
      }),
    ]);
  }

  logger.info('Renewal reminders sent', { count: due.length });
  return due.length;
}

/** Exécute une passe complète du cycle de vie. Retourne un résumé. */
export async function runSubscriptionLifecycle(now = new Date()) {
  // Expiration d'abord, puis rappels (les deux ensembles sont disjoints, mais
  // on garde l'ordre séquentiel pour éviter deux transactions concurrentes).
  const expired = await expireSubscriptions(now);
  const reminded = await sendRenewalReminders(now);
  return { expired, reminded };
}

/** Planifie le job quotidien. À appeler une fois au démarrage du serveur. */
export function startSubscriptionScheduler() {
  if (config.env === 'test') return; // pas de cron sous les tests
  const { cronSchedule, cronTimezone } = config.subscriptions;

  if (!cron.validate(cronSchedule)) {
    logger.error('Invalid subscription cron schedule', { cronSchedule });
    return;
  }

  cron.schedule(
    cronSchedule,
    async () => {
      try {
        const result = await runSubscriptionLifecycle();
        logger.info('Subscription lifecycle run', result);
      } catch (err) {
        logger.error('Subscription lifecycle failed', { error: (err as Error).message });
      }
    },
    { timezone: cronTimezone },
  );

  logger.info('Subscription scheduler started', { cronSchedule, cronTimezone });
}
