import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdmin } from '../middleware/requireAdmin';
import { prisma } from '../config/prisma';

const router = Router();
router.use(requireAdmin);

/** GET /api/admin/stats — KPIs principaux */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [
      totalUsers,
      activeWomen,
      activeMen,
      activeSubscriptions,
      totalMatches,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { gender: 'FEMALE', status: 'ACTIVE' } }),
      prisma.user.count({ where: { gender: 'MALE',   status: 'ACTIVE' } }),
      prisma.subscription.count({ where: { status: 'ACTIVE', plan: { not: 'FREE' } } }),
      (prisma as any).match?.count() ?? 0,
    ]);

    res.json({
      totalUsers,
      activeWomen,
      activeMen,
      ratioMaleFemale: activeMen > 0 ? +(activeMen / activeWomen).toFixed(2) : 0,
      activeSubscriptions,
      conversionRate: totalUsers > 0 ? +(activeSubscriptions / totalUsers).toFixed(2) : 0,
      totalMatches,
    });
  }),
);

export default router;
