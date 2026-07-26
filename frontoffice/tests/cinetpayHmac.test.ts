import './helpers/setup';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  CINETPAY_HMAC_FIELDS,
  computeCinetPayHmac,
  verifyCinetPayHmac,
} from '../src/utils/cinetpay';
import { webhookPayload } from './helpers/factories';

const SECRET = 'cle-secrete-cinetpay';

describe('Signature HMAC des notifications CinetPay', () => {
  const payload = webhookPayload();
  const token = computeCinetPayHmac(payload, SECRET);

  describe('computeCinetPayHmac', () => {
    test('produit un HMAC-SHA256 hexadécimal de 64 caractères', () => {
      assert.match(token, /^[0-9a-f]{64}$/);
    });

    test('correspond au calcul de référence sur la concaténation documentée', () => {
      // Re-implémentation indépendante : valide aussi bien l'algorithme que
      // l'ORDRE des champs de CINETPAY_HMAC_FIELDS (figé par CinetPay).
      const data = CINETPAY_HMAC_FIELDS.map((f) => {
        const v = (payload as Record<string, unknown>)[f];
        return v === undefined || v === null ? '' : String(v);
      }).join('');
      const expected = crypto.createHmac('sha256', SECRET).update(data).digest('hex');
      assert.equal(token, expected);
    });

    test('est déterministe', () => {
      assert.equal(computeCinetPayHmac(payload, SECRET), token);
    });

    test('les champs absents comptent comme chaîne vide', () => {
      const withUndefined = { ...payload, cpm_custom: undefined };
      const withNull = { ...payload, cpm_custom: null };
      const withEmpty = { ...payload, cpm_custom: '' };
      assert.equal(computeCinetPayHmac(withUndefined, SECRET), computeCinetPayHmac(withEmpty, SECRET));
      assert.equal(computeCinetPayHmac(withNull, SECRET), computeCinetPayHmac(withEmpty, SECRET));
    });

    test('les champs hors liste n’influencent pas la signature', () => {
      // `cpm_result` n'est pas signé par CinetPay : l'ajouter ne doit rien changer.
      const augmented = { ...payload, champ_non_signe: 'peu importe' };
      assert.equal(computeCinetPayHmac(augmented, SECRET), token);
    });

    test('l’ordre des champs est significatif', () => {
      const permuted = { ...payload, cpm_amount: payload.cpm_currency, cpm_currency: payload.cpm_amount };
      assert.notEqual(computeCinetPayHmac(permuted, SECRET), token);
    });
  });

  describe('verifyCinetPayHmac', () => {
    test('accepte un jeton valide', () => {
      assert.equal(verifyCinetPayHmac(payload, token, SECRET), true);
    });

    test('accepte un jeton en majuscules ou entouré d’espaces', () => {
      assert.equal(verifyCinetPayHmac(payload, token.toUpperCase(), SECRET), true);
      assert.equal(verifyCinetPayHmac(payload, `  ${token}\n`, SECRET), true);
    });

    test('refuse un payload altéré (montant gonflé)', () => {
      assert.equal(verifyCinetPayHmac({ ...payload, cpm_amount: '1' }, token, SECRET), false);
    });

    test('refuse un payload altéré (transaction substituée)', () => {
      assert.equal(
        verifyCinetPayHmac({ ...payload, cpm_trans_id: 'TERANGA-AUTRE' }, token, SECRET),
        false,
      );
    });

    test('refuse une signature calculée avec une autre clé', () => {
      assert.equal(verifyCinetPayHmac(payload, computeCinetPayHmac(payload, 'autre-cle'), SECRET), false);
    });

    test('refuse un jeton absent', () => {
      assert.equal(verifyCinetPayHmac(payload, undefined, SECRET), false);
      assert.equal(verifyCinetPayHmac(payload, '', SECRET), false);
    });

    test('refuse si la clé secrète n’est pas configurée', () => {
      assert.equal(verifyCinetPayHmac(payload, token, ''), false);
    });

    test('refuse un jeton de longueur différente sans lever d’exception', () => {
      // timingSafeEqual jette si les buffers diffèrent en taille : la fonction
      // doit court-circuiter avant.
      assert.doesNotThrow(() => verifyCinetPayHmac(payload, 'abc', SECRET));
      assert.equal(verifyCinetPayHmac(payload, 'abc', SECRET), false);
      assert.equal(verifyCinetPayHmac(payload, token + 'ff', SECRET), false);
    });
  });
});
