import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdmin } from '../middleware/requireAdmin';
import { prisma } from '../config/prisma';

const router = Router();
router.use(requireAdmin);

const n = (v: unknown) => Number(v ?? 0); // MySQL COUNT/SUM renvoie des BigInt

/** GET /api/admin/stats — KPIs + séries pour le tableau de bord. */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeWomen,
      activeMen,
      activeSubscriptions,
      totalMatches,
      pendingReports,
      revenueAgg,
      planGroups,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { gender: 'FEMALE', status: 'ACTIVE' } }),
      prisma.user.count({ where: { gender: 'MALE', status: 'ACTIVE' } }),
      prisma.subscription.count({ where: { status: 'ACTIVE', plan: { not: 'FREE' } } }),
      prisma.match.count(),
      prisma.report.count({ where: { status: 'PENDING' } }),
      prisma.payment.aggregate({
        _sum: { amountFcfa: true },
        where: { status: 'COMPLETED', completedAt: { gte: since30 } },
      }),
      prisma.subscription.groupBy({
        by: ['plan'],
        _count: { _all: true },
        where: { status: 'ACTIVE' },
      }),
    ]);

    // Croissance mensuelle (6 derniers mois) — regroupement SQL.
    const growth = await prisma.$queryRawUnsafe<
      { ym: string; users: bigint; women: bigint; men: bigint }[]
    >(
      `SELECT DATE_FORMAT(createdAt, '%Y-%m') AS ym,
              COUNT(*) AS users,
              SUM(gender = 'FEMALE') AS women,
              SUM(gender = 'MALE') AS men
       FROM User
       WHERE createdAt >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY ym ORDER BY ym`,
    );

    const revenueByMonth = await prisma.$queryRawUnsafe<
      { ym: string; amount: bigint }[]
    >(
      `SELECT DATE_FORMAT(completedAt, '%Y-%m') AS ym, SUM(amountFcfa) AS amount
       FROM Payment
       WHERE status = 'COMPLETED' AND completedAt >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY ym ORDER BY ym`,
    );

    res.json({
      kpis: {
        totalUsers,
        activeWomen,
        activeMen,
        ratioMaleFemale: activeWomen > 0 ? +(activeMen / activeWomen).toFixed(2) : 0,
        activeSubscriptions,
        conversionRate: totalUsers > 0 ? +(activeSubscriptions / totalUsers).toFixed(3) : 0,
        totalMatches,
        pendingReports,
        revenue30dFcfa: n(revenueAgg._sum.amountFcfa),
      },
      usersGrowth: growth.map((r) => ({
        month: r.ym,
        users: n(r.users),
        women: n(r.women),
        men: n(r.men),
      })),
      revenueByMonth: revenueByMonth.map((r) => ({ month: r.ym, amount: n(r.amount) })),
      planDistribution: planGroups.map((g) => ({ plan: g.plan, count: g._count._all })),
    });
  }),
);

export default router;
