import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdmin, requireSuperAdmin } from '../middleware/requireAdmin';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';

const router = Router();
// Gestion des comptes admin : réservée aux super administrateurs.
router.use(requireAdmin, requireSuperAdmin);

const publicFields = {
  id: true, email: true, name: true, role: true,
  isActive: true, lastLoginAt: true, createdAt: true,
} as const;

/** GET /api/admin/admins — liste des comptes d'administration. */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const admins = await prisma.admin.findMany({
      orderBy: { createdAt: 'asc' },
      select: publicFields,
    });
    res.json({ admins });
  }),
);

/** POST /api/admin/admins — créer un administrateur. */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const name = req.body?.name ? String(req.body.name).trim() : null;
    const role = req.body?.role === 'SUPERADMIN' ? 'SUPERADMIN' : 'ADMIN';
    const password = String(req.body?.password || '');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw AppError.badRequest('Email invalide');
    if (password.length < 8) throw AppError.badRequest('Mot de passe : 8 caractères minimum');

    const exists = await prisma.admin.findUnique({ where: { email } });
    if (exists) throw AppError.conflict('Un administrateur existe déjà avec cet email');

    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await prisma.admin.create({
      data: { email, name, role, passwordHash, isActive: true },
      select: publicFields,
    });
    res.status(201).json({ admin });
  }),
);

/**
 * PATCH /api/admin/admins/:id — activer/désactiver ou changer le rôle.
 * Garde-fou : un super admin ne peut pas se désactiver ni se rétrograder
 * lui-même (évite de se verrouiller dehors).
 */
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const me = (req as any).admin;
    const target = await prisma.admin.findUnique({ where: { id: req.params.id } });
    if (!target) throw AppError.notFound('Administrateur introuvable');

    const data: { isActive?: boolean; role?: string } = {};
    if (typeof req.body?.isActive === 'boolean') data.isActive = req.body.isActive;
    if (req.body?.role === 'ADMIN' || req.body?.role === 'SUPERADMIN') data.role = req.body.role;
    if (Object.keys(data).length === 0) throw AppError.badRequest('Aucune modification fournie');

    const isSelf = target.id === me.adminId;
    if (isSelf && data.isActive === false) {
      throw AppError.badRequest('Vous ne pouvez pas désactiver votre propre compte');
    }
    if (isSelf && data.role === 'ADMIN') {
      throw AppError.badRequest('Vous ne pouvez pas retirer votre propre rôle super admin');
    }

    const admin = await prisma.admin.update({
      where: { id: req.params.id },
      data,
      select: publicFields,
    });
    res.json({ admin });
  }),
);

export default router;
