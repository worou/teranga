import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdmin } from '../middleware/requireAdmin';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';

const router = Router();
router.use(requireAdmin);

/** GET /api/admin/users — liste paginée */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const skip  = (page - 1) * limit;
    const search = (req.query.search as string) || '';

    const where = search
      ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName:  { contains: search, mode: 'insensitive' as const } },
            { phone:     { contains: search } },
            { email:     { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, firstName: true, lastName: true,
          phone: true, email: true, gender: true,
          status: true, phoneVerified: true,
          createdAt: true, city: true, country: true,
          subscription: { select: { plan: true, status: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  }),
);

/** GET /api/admin/users/:id */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { subscription: true, photos: true },
    });
    if (!user) throw AppError.notFound('Utilisateur introuvable');
    res.json(user);
  }),
);

/** PATCH /api/admin/users/:id/status — bannir / réactiver */
router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!['ACTIVE', 'BANNED', 'SUSPENDED'].includes(status)) {
      throw AppError.badRequest('Statut invalide');
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status },
      select: { id: true, status: true, firstName: true, lastName: true },
    });
    res.json(user);
  }),
);

/** PATCH /api/admin/users/:id/verify — approuver / rejeter la vérification. */
router.patch(
  '/:id/verify',
  asyncHandler(async (req, res) => {
    const { action } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      throw AppError.badRequest('Action invalide (approve | reject)');
    }
    const data =
      action === 'approve'
        ? { isVerified: true, verificationStatus: 'VERIFIED' as const }
        : { isVerified: false, verificationStatus: 'REJECTED' as const };

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, isVerified: true, verificationStatus: true, firstName: true },
    });
    res.json(user);
  }),
);

export default router;
