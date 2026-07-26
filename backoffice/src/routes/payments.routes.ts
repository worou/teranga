import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdmin } from '../middleware/requireAdmin';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';
import { config } from '../config';

const router = Router();
router.use(requireAdmin);

/**
 * Relaie une action de validation de virement au frontoffice (serveur à
 * serveur), qui détient la logique canonique d'activation d'abonnement. Le
 * secret partagé authentifie l'appel ; l'identité admin a déjà été vérifiée
 * par requireAdmin. Fait remonter une erreur claire si le frontoffice est
 * injoignable (plutôt qu'un 500 opaque).
 */
async function relayToFrontoffice(pathname: string, body?: unknown): Promise<unknown> {
  const url = `${config.frontofficeApiUrl}/api/v1/admin${pathname}`;
  let res: { ok: boolean; status: number; json: () => Promise<any> };
  try {
    res = await (globalThis as any).fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': config.internalApiSecret,
      },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new AppError(
      "Le service de paiement (frontoffice) est injoignable. Vérifiez qu'il est démarré.",
      502,
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AppError(data?.message || 'Action refusée par le service de paiement.', res.status);
  }
  return data;
}

/** GET /api/admin/payments — liste paginée (filtres status / method). */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const status = req.query.status as string | undefined;
    const method = req.query.method as string | undefined;

    const where: any = {};
    if (status) where.status = status;
    if (method) where.method = method;

    const [items, total, completedAgg] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, plan: true, method: true, status: true,
          amountFcfa: true, currency: true, createdAt: true, completedAt: true,
          failureReason: true, providerRef: true,
          user: { select: { id: true, firstName: true, lastName: true, phone: true } },
        },
      }),
      prisma.payment.count({ where }),
      prisma.payment.aggregate({ _sum: { amountFcfa: true }, where: { ...where, status: 'COMPLETED' } }),
    ]);

    res.json({
      items,
      total,
      page,
      pages: Math.ceil(total / limit),
      completedTotalFcfa: Number(completedAgg._sum.amountFcfa ?? 0),
    });
  }),
);

/** GET /api/admin/payments/:id */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } } },
    });
    if (!payment) throw AppError.notFound('Paiement introuvable');
    res.json(payment);
  }),
);

/**
 * POST /api/admin/payments/:id/confirm — valide un virement bancaire reçu.
 * Relayé au frontoffice qui active l'abonnement.
 */
router.post(
  '/:id/confirm',
  asyncHandler(async (req, res) => {
    const result = await relayToFrontoffice(`/payments/${req.params.id}/confirm`);
    res.json(result);
  }),
);

/**
 * POST /api/admin/payments/:id/reject — rejette un virement non reçu.
 */
router.post(
  '/:id/reject',
  asyncHandler(async (req, res) => {
    const result = await relayToFrontoffice(`/payments/${req.params.id}/reject`, {
      reason: req.body?.reason,
    });
    res.json(result);
  }),
);

export default router;
