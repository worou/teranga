import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { AppError } from '../utils/AppError';

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(AppError.unauthorized('Token manquant'));
  }
  try {
    const payload = verifyAccessToken(header.slice(7));
    if (!(payload as any).isAdmin) {
      return next(AppError.forbidden('Accès réservé aux administrateurs'));
    }
    (req as any).admin = payload;
    next();
  } catch {
    next(AppError.unauthorized('Token invalide ou expiré'));
  }
}
