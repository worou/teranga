import { Request, Response, NextFunction } from 'express';
import { verifyAdminToken } from '../utils/jwt';
import { AppError } from '../utils/AppError';

/**
 * Garde d'accès du back-office. Exige un token admin valide (signé avec
 * `ADMIN_SECRET`). Un token utilisateur du frontoffice échoue à la vérification
 * de signature → rejet.
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(AppError.unauthorized('Token manquant'));
  }
  try {
    const payload = verifyAdminToken(header.slice(7));
    (req as any).admin = payload;
    next();
  } catch {
    next(AppError.unauthorized('Token invalide ou expiré'));
  }
}

/**
 * Réserve l'accès aux SUPER administrateurs. À chaîner APRÈS `requireAdmin`
 * (qui a déjà validé le token et posé `req.admin`).
 */
export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  const admin = (req as any).admin;
  if (!admin) return next(AppError.unauthorized('Token manquant'));
  if (admin.role !== 'SUPERADMIN') {
    return next(AppError.forbidden('Réservé aux super administrateurs'));
  }
  next();
}
