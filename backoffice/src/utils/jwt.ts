import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config';

/**
 * Tokens d'ADMINISTRATION — domaine de confiance séparé.
 *
 * Signés/vérifiés avec `ADMIN_SECRET`, distinct du `JWT_SECRET` qui signe les
 * tokens utilisateurs du frontoffice. Conséquence : un token utilisateur ne
 * peut JAMAIS être vérifié ici (signature invalide), donc jamais rejoué en
 * accès admin, quels que soient ses claims.
 */
export interface AdminTokenPayload {
  adminId: string;
  email: string;
  role: string;
}

export function signAdminToken(payload: AdminTokenPayload): string {
  return jwt.sign(payload, config.adminSecret, {
    expiresIn: config.jwt.expiresIn,
  } as SignOptions);
}

export function verifyAdminToken(token: string): AdminTokenPayload {
  return jwt.verify(token, config.adminSecret) as AdminTokenPayload;
}
