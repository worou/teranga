import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../utils/jwt';
import { AppError } from '../utils/AppError';
import { prisma } from '../config/prisma';
import { config } from '../config';

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

    // Version 1 : le système d'abonnement est désactivé, la messagerie est
    // ouverte à tous. Le contrôle ci-dessous reprend tel quel si le drapeau
    // est remis à true.
    if (!config.subscriptionsEnabled) return next();

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
        "Abonnement requis pour utiliser la messagerie. Souscrivez à partir de 1 000 F CFA.",
      );
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Inscription complète : le profil doit porter au moins `config.profile.minPhotos`
 * photos avant de donner accès à l'application (découverte, matchs, messagerie).
 *
 * Le contrôle est fait à chaque requête plutôt qu'une fois pour toutes à la
 * création du compte : c'est ce qui empêche de contourner l'exigence, aussi bien
 * en abandonnant l'étape photos de l'inscription qu'en supprimant ses photos
 * après coup. Corollaire volontaire : remplacer une photo (supprimer puis
 * réenvoyer) reste possible, seul l'accès est suspendu entre les deux.
 *
 * N'est PAS posé sur `/users/me/photos*` : il faut pouvoir envoyer ses photos
 * pour lever le blocage.
 */
export async function requireCompleteProfile(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth) throw AppError.unauthorized();

    const minPhotos = config.profile.minPhotos;
    const photosCount = await prisma.photo.count({ where: { userId: req.auth.userId } });

    if (photosCount < minPhotos) {
      const missing = minPhotos - photosCount;
      throw new AppError(
        `Ajoutez au moins ${minPhotos} photos pour finaliser votre inscription ` +
          `(${missing} manquante${missing > 1 ? 's' : ''}).`,
        403,
        { code: 'PHOTOS_REQUIRED', photosCount, minPhotos, missing },
      );
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Routes du tunnel d'abonnement (tarifs, souscription, historique). Quand le
 * système est désactivé (version 1), elles n'existent tout simplement pas :
 * 404, comme n'importe quelle route inconnue, plutôt qu'un 403 qui laisserait
 * croire à une restriction de droits.
 *
 * N'est PAS posé sur les webhooks ni sur les routes admin internes : un
 * paiement encore en vol doit pouvoir aboutir et être régularisé.
 */
export function requireSubscriptionsEnabled(
  _req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (!config.subscriptionsEnabled) {
    return next(
      new AppError("L'abonnement n'est pas disponible.", 404, {
        code: 'SUBSCRIPTIONS_DISABLED',
      }),
    );
  }
  next();
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
