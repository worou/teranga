import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { prisma } from '../config/prisma';
import { signAdminToken } from '../utils/jwt';
import { requireAdmin } from '../middleware/requireAdmin';

const router = Router();

/**
 * POST /api/admin/auth/login — connexion administrateur (email + mot de passe).
 */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) throw AppError.badRequest('Email et mot de passe requis');

    const admin = await prisma.admin.findUnique({ where: { email } });
    // Message générique : ne pas révéler si l'email existe.
    if (!admin || !admin.isActive) throw AppError.unauthorized('Identifiants invalides');

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) throw AppError.unauthorized('Identifiants invalides');

    await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });

    const token = signAdminToken({ adminId: admin.id, email: admin.email, role: admin.role });
    res.json({
      token,
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    });
  }),
);

/**
 * GET /api/admin/auth/me — profil de l'admin connecté (valide le token).
 */
router.get(
  '/me',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const payload = (req as any).admin;
    const admin = await prisma.admin.findUnique({
      where: { id: payload.adminId },
      select: { id: true, email: true, name: true, role: true, lastLoginAt: true },
    });
    if (!admin) throw AppError.unauthorized('Session invalide');
    res.json({ admin });
  }),
);

export default router;
