import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdmin } from '../middleware/requireAdmin';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';

const router = Router();
router.use(requireAdmin);

/** GET /api/admin/subscriptions — liste paginée (filtres status / plan). */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const status = req.query.status as string | undefined;
    const plan = req.query.plan as string | undefined;

    const where: any = {};
    if (status) where.status = status;
    if (plan) where.plan = plan;

    const [items, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, phone: true, country: true } },
        },
      }),
      prisma.subscription.count({ where }),
    ]);

    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  }),
);

/** GET /api/admin/subscriptions/:id */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const sub = await prisma.subscription.findUnique({
      where: { id: req.params.id },
      include: { user: true, payments: { orderBy: { createdAt: 'desc' } } },
    });
    if (!sub) throw AppError.notFound('Abonnement introuvable');
    res.json(sub);
  }),
);

export default router;
