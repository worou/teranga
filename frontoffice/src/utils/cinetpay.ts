import crypto from 'crypto';

/**
 * Vérification de l'authenticité des notifications CinetPay (webhook).
 *
 * CinetPay signe chaque notification via l'en-tête HTTP `x-token` :
 * un HMAC-SHA256 (sortie hexadécimale) calculé sur la concaténation — sans
 * séparateur — des champs POST ci-dessous, dans cet ordre exact, avec la
 * **clé secrète** du compte (`CINETPAY_SECRET_KEY`, distincte de l'apikey).
 *
 * Réf. : CinetPay — « Sécuriser la notification / HMAC ».
 * ⚠️  L'ordre des champs est figé par CinetPay ; le centraliser ici permet de
 *     l'ajuster à un seul endroit si la doc évolue.
 */
export const CINETPAY_HMAC_FIELDS = [
  'cpm_site_id',
  'cpm_trans_id',
  'cpm_trans_date',
  'cpm_amount',
  'cpm_currency',
  'signature',
  'payment_method',
  'cel_phone_num',
  'cpm_phone_prefixe',
  'cpm_language',
  'cpm_version',
  'cpm_payment_config',
  'cpm_page_action',
  'cpm_custom',
  'cpm_designation',
  'cpm_error_message',
] as const;

/** Calcule le HMAC-SHA256 (hex) d'un payload CinetPay avec la clé secrète. */
export function computeCinetPayHmac(payload: Record<string, unknown>, secretKey: string): string {
  const data = CINETPAY_HMAC_FIELDS.map((f) => {
    const v = payload[f];
    return v === undefined || v === null ? '' : String(v);
  }).join('');
  return crypto.createHmac('sha256', secretKey).update(data).digest('hex');
}

/**
 * Vérifie le jeton `x-token` d'une notification CinetPay.
 * Comparaison à temps constant pour éviter les attaques temporelles.
 */
export function verifyCinetPayHmac(
  payload: Record<string, unknown>,
  token: string | undefined,
  secretKey: string,
): boolean {
  if (!token || !secretKey) return false;
  const expected = computeCinetPayHmac(payload, secretKey);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(token.trim().toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
