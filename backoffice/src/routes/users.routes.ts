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
    const verification = (req.query.verification as string) || '';

    const clauses: any[] = [];

    if (search) {
      clauses.push({
        OR: [
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName:  { contains: search, mode: 'insensitive' as const } },
          { phone:     { contains: search } },
          { email:     { contains: search, mode: 'insensitive' as const } },
        ],
      });
    }

    // File d'attente de la modération. Le critère est `verificationStatus`,
    // surtout pas `isVerified` : un profil REJETÉ reste `isVerified: false`
    // pour toujours — c'est le sens du rejet. Une file bâtie sur ce booléen
    // le remonterait à chaque chargement, sans aucun moyen de l'en sortir.
    if (verification === 'pending') {
      clauses.push({ verificationStatus: { in: ['PENDING', 'IN_REVIEW'] as const } });
      // Un compte banni ou supprimé n'a plus à être jugé sur son profil.
      clauses.push({ status: { notIn: ['BANNED', 'DELETED'] as const } });
    }

    // Les deux filtres se composent : chercher un nom DANS la file d'attente
    // doit rester possible.
    const where = clauses.length ? { AND: clauses } : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, firstName: true, lastName: true,
          phone: true, email: true, gender: true,
          // `isVerified` est la seconde porte : un compte peut être ACTIVE
          // (il a confirmé son e-mail, il se connecte) tout en restant
          // INVISIBLE dans la découverte, qui filtre dessus. Sans ce champ,
          // la liste ne pouvait pas distinguer les deux, et un profil en
          // attente de validation était indiscernable d'un profil validé.
          // `phoneVerified` répond à une tout autre question.
          status: true, phoneVerified: true, isVerified: true,
          // Sans lui, l'écran ne peut pas distinguer « en attente » de
          // « rejeté » : les deux valent `isVerified: false`, et la liste
          // afficherait « à valider » sur un profil déjà tranché.
          verificationStatus: true,
          createdAt: true, city: true, country: true, birthDate: true,
          // De quoi juger un profil sans ouvrir une seconde page. Le coût est
          // borné : la pagination plafonne à 100 lignes, et la photo
          // principale ne ramène qu'une URL.
          bio: true,
          photos: { where: { isMain: true }, take: 1, select: { url: true } },
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
