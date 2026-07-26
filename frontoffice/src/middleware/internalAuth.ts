import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { AppError } from '../utils/AppError';

/** Valeur de repli en dev — jamais acceptée en production (fail-closed). */
const INSECURE_DEFAULT = 'dev-internal-secret';

/**
 * Garde les endpoints admin internes appelés par le backoffice (serveur à
 * serveur), via un secret partagé transmis dans l'en-tête `x-internal-secret`.
 *
 * L'authentification/identité de l'admin est assurée par le backoffice
 * (requireAdmin) ; le frontoffice se contente de vérifier que l'appel provient
 * bien de ce backoffice de confiance.
 *
 * Fail-closed : en production, tout est refusé si le secret n'est pas
 * correctement configuré (absent ou resté au défaut de dev).
 */
export function requireInternalSecret(req: Request, _res: Response, next: NextFunction) {
  const expected = config.internalApiSecret;
  if (config.env === 'production' && (!expected || expected === INSECURE_DEFAULT)) {
    throw AppError.forbidden('Secret interne non configuré');
  }
  const provided = req.header('x-internal-secret');
  if (!provided || provided !== expected) {
    throw AppError.unauthorized('Accès interne refusé');
  }
  next();
}
