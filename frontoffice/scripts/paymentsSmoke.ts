/**
 * Tests de fumée (sans base de données) sur la logique pure du paiement :
 *   - vérification HMAC CinetPay ;
 *   - filtrage des opérateurs mobile money par pays (zone XOF).
 *
 * Lancer :  npx ts-node --transpile-only scripts/paymentsSmoke.ts
 */
import assert from 'node:assert';
import { computeCinetPayHmac, verifyCinetPayHmac } from '../src/utils/cinetpay';
import {
  operatorsForCountry,
  isMethodAvailable,
  isPhoneValidForCountry,
  isXofCountry,
  cinetpayChannel,
} from '../src/config/mobileMoney';

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `ÉCHEC: ${name}`);
  passed++;
}

// ---------- HMAC CinetPay ----------
const payload = {
  cpm_site_id: '123456',
  cpm_trans_id: 'TERANGA-1700000000000-abcd1234',
  cpm_trans_date: '2026-07-17 10:00:00',
  cpm_amount: '21000',
  cpm_currency: 'XOF',
  signature: 'sig',
  payment_method: 'ORANGE',
  cel_phone_num: '771234567',
  cpm_phone_prefixe: '221',
  cpm_language: 'fr',
  cpm_version: 'V4',
  cpm_payment_config: 'SINGLE',
  cpm_page_action: 'PAYMENT',
  cpm_custom: '',
  cpm_designation: 'Abonnement',
  cpm_error_message: 'SUCCES',
};
const secret = 's3cr3t-key';
const token = computeCinetPayHmac(payload, secret);

check('HMAC valide accepté', verifyCinetPayHmac(payload, token, secret) === true);
check('HMAC insensible à la casse du token', verifyCinetPayHmac(payload, token.toUpperCase(), secret) === true);
check('HMAC rejeté si payload altéré', verifyCinetPayHmac({ ...payload, cpm_amount: '1' }, token, secret) === false);
check('HMAC rejeté avec mauvaise clé', verifyCinetPayHmac(payload, token, 'autre-cle') === false);
check('HMAC rejeté si token manquant', verifyCinetPayHmac(payload, undefined, secret) === false);
check('HMAC rejeté si clé manquante', verifyCinetPayHmac(payload, token, '') === false);

// ---------- Opérateurs par pays (zone XOF) ----------
check('SN est en zone XOF', isXofCountry('SN') === true);
check('code pays insensible à la casse', isXofCountry('sn') === true);
check('KE (hors XOF) rejeté', isXofCountry('KE') === false);

const sn = operatorsForCountry('SN');
check('SN propose Orange Money', sn.includes('ORANGE_MONEY'));
check('SN propose Wave', sn.includes('WAVE'));
check('SN propose Free Money', sn.includes('FREE_MONEY'));
check('SN propose Wizall', sn.includes('WIZALL'));
check('SN propose la carte', sn.includes('CARD'));
check('SN ne propose PAS MTN (CI/BJ)', !sn.includes('MTN_MOMO'));

check('MTN dispo en CI', isMethodAvailable('CI', 'MTN_MOMO') === true);
check('MTN indispo en SN', isMethodAvailable('SN', 'MTN_MOMO') === false);
check('pays hors zone : aucun opérateur', operatorsForCountry('KE').length === 0);

// ---------- Validation du numéro selon l'indicatif ----------
check('numéro SN valide pour Orange Money', isPhoneValidForCountry('SN', '+221771234567', 'ORANGE_MONEY') === true);
check('numéro CI refusé pour un compte SN', isPhoneValidForCountry('SN', '+2250700000000', 'ORANGE_MONEY') === false);
check('carte : indicatif non contraint', isPhoneValidForCountry('SN', '+33612345678', 'CARD') === true);

// ---------- Canaux CinetPay ----------
check('canal Wave = WALLET', cinetpayChannel('WAVE') === 'WALLET');
check('canal Orange Money = MOBILE_MONEY', cinetpayChannel('ORANGE_MONEY') === 'MOBILE_MONEY');
check('canal carte = CREDIT_CARD', cinetpayChannel('CARD') === 'CREDIT_CARD');

console.log(`\n✅ ${passed} assertions passées.\n`);
