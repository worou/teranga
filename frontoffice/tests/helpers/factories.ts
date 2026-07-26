/**
 * Fabriques de données et assertions partagées par le jeu de test.
 */
import assert from 'node:assert/strict';
import { computeCinetPayHmac } from '../../src/utils/cinetpay';
import { TEST_SECRET_KEY } from './setup';

/** Payload de notification CinetPay réaliste (tous les champs signés). */
export function webhookPayload(overrides: Record<string, any> = {}) {
  return {
    cpm_site_id: '999999',
    cpm_trans_id: 'TERANGA-TEST-0001',
    cpm_trans_date: '2026-07-21 10:30:00',
    cpm_amount: '1500',
    cpm_currency: 'XOF',
    signature: 'cinetpay-signature',
    payment_method: 'ORANGEMONEY',
    cel_phone_num: '771234567',
    cpm_phone_prefixe: '221',
    cpm_language: 'fr',
    cpm_version: 'V4',
    cpm_payment_config: 'SINGLE',
    cpm_page_action: 'PAYMENT',
    cpm_custom: '',
    cpm_designation: 'Abonnement Téranga STANDARD - 3 mois',
    cpm_result: '00',
    cpm_error_message: 'SUCCES',
    ...overrides,
  };
}

/** Jeton `x-token` valide pour ce payload (signature HMAC-SHA256). */
export function signToken(payload: Record<string, any>, secret = TEST_SECRET_KEY) {
  return computeCinetPayHmac(payload, secret);
}

/** Vérifie qu'un appel rejette avec une `AppError` du code HTTP attendu. */
export async function assertAppError(
  fn: () => Promise<unknown>,
  statusCode: number,
  messagePart?: string,
) {
  let thrown: any;
  try {
    await fn();
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown, `Aucune erreur levée (attendu HTTP ${statusCode})`);
  assert.equal(
    thrown.statusCode,
    statusCode,
    `Code HTTP attendu ${statusCode}, reçu ${thrown.statusCode} — « ${thrown.message} »`,
  );
  if (messagePart) {
    assert.ok(
      String(thrown.message).includes(messagePart),
      `Message attendu contenant « ${messagePart} », reçu « ${thrown.message} »`,
    );
  }
  return thrown;
}

/** Écart en jours entre deux dates (arrondi au dixième). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((Math.abs(a.getTime() - b.getTime()) / 86_400_000) * 10) / 10;
}

/** Date décalée de `days` jours par rapport à `from`. */
export function daysFrom(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}
