import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { prisma } from '../config/prisma';
import { config } from '../config';

const router = Router();

/**
 * POST /api/admin/auth/login
 * Connexion d'un administrateur (via email + mot de passe)
 */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) throw AppError.badRequest('Email et mot de passe requis');

    const admin = await (prisma as any).admin?.findUnique({ where: { email } });
    if (!admin) throw AppError.unauthorized('Identifiants invalides');

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) throw AppError.unauthorized('Identifiants invalides');

    const token = jwt.sign(
      { userId: admin.id, isAdmin: true, email: admin.email },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as any,
    );

    res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name } });
  }),
);

export default router;
