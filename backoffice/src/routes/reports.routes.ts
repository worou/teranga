import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdmin } from '../middleware/requireAdmin';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';

const router = Router();
router.use(requireAdmin);

const userBrief = {
  select: { id: true, firstName: true, lastName: true, phone: true, status: true },
};

/** GET /api/admin/reports — signalements (filtre status, défaut PENDING d'abord). */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const status = req.query.status as string | undefined;
    const where = status ? { status: status as any } : {};

    const [items, total] = await Promise.all([
      prisma.report.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        // Les signalements en attente en premier, puis les plus récents.
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: { reporter: userBrief, reported: userBrief },
      }),
      prisma.report.count({ where }),
    ]);

    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  }),
);

/**
 * PATCH /api/admin/reports/:id — traiter un signalement (résoudre / rejeter).
 * Optionnellement, bannir/suspendre l'utilisateur signalé dans la foulée.
 */
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { status, resolution, sanction } = req.body as {
      status?: string;
      resolution?: string;
      sanction?: 'BAN' | 'SUSPEND' | 'NONE';
    };
    if (!['RESOLVED', 'DISMISSED', 'REVIEWING'].includes(status || '')) {
      throw AppError.badRequest('Statut invalide (RESOLVED | DISMISSED | REVIEWING)');
    }

    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report) throw AppError.notFound('Signalement introuvable');

    const admin = (req as any).admin;
    const updated = await prisma.report.update({
      where: { id: req.params.id },
      data: {
        status: status as any,
        resolution: resolution ?? null,
        reviewedAt: new Date(),
        reviewedBy: admin?.email ?? admin?.adminId ?? 'admin',
      },
      include: { reported: userBrief },
    });

    // Sanction éventuelle de l'utilisateur signalé.
    if (sanction === 'BAN' || sanction === 'SUSPEND') {
      await prisma.user.update({
        where: { id: report.reportedId },
        data: { status: sanction === 'BAN' ? 'BANNED' : 'SUSPENDED' },
      });
    }

    res.json(updated);
  }),
);

export default router;
