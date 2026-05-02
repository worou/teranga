import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../utils/jwt';
import { AppError } from '../utils/AppError';
import { prisma } from '../config/prisma';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

/**
 * Verifies JWT in Authorization header and attaches payload to req.auth.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw AppError.unauthorized('Token manquant');
    }
    const token = header.substring(7);
    const payload = verifyAccessToken(token);
    req.auth = payload;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * For endpoints that require an active subscription (MALE users only).
 * Female and non-binary users pass through.
 */
export async function requireSubscriptionForMessaging(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth) throw AppError.unauthorized();

    const user = await prisma.user.findUnique({
      where: { id: req.auth.userId },
      include: { subscription: true },
    });

    if (!user) throw AppError.unauthorized('Utilisateur introuvable');

    // Women and non-binary: always allowed
    if (user.gender !== 'MALE') return next();

    // Men: must have active subscription
    const sub = user.subscription;
    const now = new Date();
    const hasActive =
      sub &&
      sub.status === 'ACTIVE' &&
      sub.expiresAt &&
      sub.expiresAt > now &&
      sub.plan !== 'FREE';

    if (!hasActive) {
      throw AppError.forbidden(
        "Abonnement requis pour utiliser la messagerie. Souscrivez à partir de 3 000 F CFA / mois.",
      );
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Admin check (placeholder - add a role field to User model in prod).
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw AppError.unauthorized();
    // TODO: check role field once added
    // For now: use a hard-coded admin list via env or a dedicated admins table
    next();
  } catch (err) {
    next(err);
  }
}
