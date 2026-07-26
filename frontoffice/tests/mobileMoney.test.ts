import './helpers/setup';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPERATORS,
  XOF_COUNTRIES,
  PaymentMethodKey,
  isXofCountry,
  operatorsForCountry,
  isMethodAvailable,
  cinetpayChannel,
  methodLabel,
  isPhoneValidForCountry,
  methodsCatalog,
} from '../src/config/mobileMoney';
import { subscribeSchema } from '../src/validators';

describe('Référentiel Mobile Money — zone F CFA (XOF)', () => {
  describe('isXofCountry', () => {
    test('accepte les 8 pays UEMOA desservis', () => {
      for (const code of ['SN', 'CI', 'ML', 'BF', 'BJ', 'TG', 'NE', 'GW']) {
        assert.equal(isXofCountry(code), true, `${code} devrait être en zone XOF`);
      }
    });

    test('est insensible à la casse du code ISO-2', () => {
      assert.equal(isXofCountry('sn'), true);
      assert.equal(isXofCountry('Ci'), true);
    });

    test('rejette les pays hors zone F CFA', () => {
      for (const code of ['KE', 'FR', 'MA', 'NG', 'CM']) {
        assert.equal(isXofCountry(code), false, `${code} ne devrait pas être en zone XOF`);
      }
    });

    test('rejette une valeur vide ou absente sans planter', () => {
      assert.equal(isXofCountry(''), false);
      assert.equal(isXofCountry(undefined as unknown as string), false);
      assert.equal(isXofCountry(null as unknown as string), false);
    });
  });

  describe('operatorsForCountry', () => {
    test('Sénégal : Orange Money, Wave, Free Money, Wizall + carte', () => {
      const sn = operatorsForCountry('SN');
      assert.deepEqual(sn, ['ORANGE_MONEY', 'WAVE', 'FREE_MONEY', 'WIZALL', 'CARD', 'PAYPAL']);
    });

    test("Côte d'Ivoire : inclut MTN MoMo et Moov", () => {
      const ci = operatorsForCountry('CI');
      assert.ok(ci.includes('MTN_MOMO'));
      assert.ok(ci.includes('MOOV_MONEY'));
    });

    test('la carte bancaire est proposée dans tous les pays desservis', () => {
      for (const code of Object.keys(XOF_COUNTRIES)) {
        assert.ok(operatorsForCountry(code).includes('CARD'), `CARD manquant pour ${code}`);
      }
    });

    test('aucun opérateur pour un pays hors zone', () => {
      assert.deepEqual(operatorsForCountry('KE'), []);
      assert.deepEqual(operatorsForCountry('FR'), []);
    });

    test('MTN MoMo n’est pas proposé au Sénégal (il n’y opère pas)', () => {
      assert.equal(operatorsForCountry('SN').includes('MTN_MOMO'), false);
    });

    test('Free Money et Wizall restent cantonnés à leurs marchés', () => {
      assert.equal(operatorsForCountry('CI').includes('FREE_MONEY'), false);
      assert.equal(operatorsForCountry('TG').includes('WIZALL'), false);
    });
  });

  describe('isMethodAvailable', () => {
    test('MTN MoMo est disponible en CI mais pas au SN', () => {
      assert.equal(isMethodAvailable('CI', 'MTN_MOMO'), true);
      assert.equal(isMethodAvailable('SN', 'MTN_MOMO'), false);
    });

    test('aucun moyen n’est disponible hors zone F CFA', () => {
      assert.equal(isMethodAvailable('FR', 'CARD'), false);
      assert.equal(isMethodAvailable('KE', 'ORANGE_MONEY'), false);
    });
  });

  describe('cinetpayChannel', () => {
    test('mappe chaque opérateur sur son canal CinetPay', () => {
      assert.equal(cinetpayChannel('ORANGE_MONEY'), 'MOBILE_MONEY');
      assert.equal(cinetpayChannel('MTN_MOMO'), 'MOBILE_MONEY');
      assert.equal(cinetpayChannel('MOOV_MONEY'), 'MOBILE_MONEY');
      assert.equal(cinetpayChannel('FREE_MONEY'), 'MOBILE_MONEY');
      assert.equal(cinetpayChannel('WIZALL'), 'MOBILE_MONEY');
      assert.equal(cinetpayChannel('WAVE'), 'WALLET');
      assert.equal(cinetpayChannel('CARD'), 'CREDIT_CARD');
      assert.equal(cinetpayChannel('CARRIER_BILLING'), 'CARRIER_BILLING');
    });

    test('retombe sur ALL pour un moyen inconnu', () => {
      assert.equal(cinetpayChannel('BITCOIN' as PaymentMethodKey), 'ALL');
    });
  });

  describe('methodLabel', () => {
    test('libellés lisibles côté client', () => {
      assert.equal(methodLabel('ORANGE_MONEY'), 'Orange Money');
      assert.equal(methodLabel('WAVE'), 'Wave');
      assert.equal(methodLabel('CARD'), 'Carte bancaire');
    });

    test('retombe sur la clé brute pour un moyen inconnu', () => {
      assert.equal(methodLabel('INCONNU' as PaymentMethodKey), 'INCONNU');
    });
  });

  describe('isPhoneValidForCountry', () => {
    test('accepte un numéro portant l’indicatif du pays', () => {
      assert.equal(isPhoneValidForCountry('SN', '+221771234567', 'ORANGE_MONEY'), true);
      assert.equal(isPhoneValidForCountry('CI', '+2250700000000', 'MTN_MOMO'), true);
      assert.equal(isPhoneValidForCountry('BJ', '+22997000000', 'MOOV_MONEY'), true);
    });

    test('refuse un numéro d’un autre pays de la zone', () => {
      assert.equal(isPhoneValidForCountry('SN', '+2250700000000', 'ORANGE_MONEY'), false);
      assert.equal(isPhoneValidForCountry('CI', '+221771234567', 'WAVE'), false);
    });

    test('la carte bancaire n’est pas contrainte par l’indicatif (diaspora)', () => {
      assert.equal(isPhoneValidForCountry('SN', '+33612345678', 'CARD'), true);
      assert.equal(isPhoneValidForCountry('FR', '+33612345678', 'CARD'), true);
    });

    test('refuse tout numéro mobile money si le pays n’est pas desservi', () => {
      assert.equal(isPhoneValidForCountry('FR', '+33612345678', 'ORANGE_MONEY'), false);
    });

    test('l’indicatif doit être en tête, pas seulement présent', () => {
      assert.equal(isPhoneValidForCountry('SN', '+2250221771234', 'ORANGE_MONEY'), false);
    });
  });

  describe('methodsCatalog', () => {
    test('expose les 8 pays avec indicatif préfixé et opérateurs', () => {
      const catalog = methodsCatalog();
      assert.equal(catalog.length, 8);
      for (const entry of catalog) {
        assert.ok(entry.dialingCode.startsWith('+'), `indicatif mal formé pour ${entry.country}`);
        assert.ok(entry.name.length > 0);
        assert.ok(entry.methods.length >= 2);
        assert.ok(entry.methods.some((m) => m.method === 'CARD'));
      }
    });

    test('chaque moyen porte son libellé et son drapeau mobile money', () => {
      const sn = methodsCatalog().find((c) => c.country === 'SN')!;
      const wave = sn.methods.find((m) => m.method === 'WAVE')!;
      const card = sn.methods.find((m) => m.method === 'CARD')!;
      assert.equal(wave.label, 'Wave');
      assert.equal(wave.isMobileMoney, true);
      assert.equal(card.isMobileMoney, false);
    });
  });

  describe('cohérence du référentiel', () => {
    test('tout opérateur listé par pays existe dans OPERATORS', () => {
      for (const [code, meta] of Object.entries(XOF_COUNTRIES)) {
        for (const op of meta.operators) {
          assert.ok(OPERATORS[op], `${code} référence un opérateur inconnu : ${op}`);
        }
      }
    });

    test('tout indicatif est numérique et sans « + »', () => {
      for (const [code, meta] of Object.entries(XOF_COUNTRIES)) {
        assert.match(meta.dialingCode, /^\d{3}$/, `indicatif invalide pour ${code}`);
      }
    });

    test('chaque opérateur du référentiel est accepté par le validateur d’API', () => {
      // Garde-fou : l'enum Zod de `subscribeSchema` et OPERATORS doivent rester
      // synchronisés, sinon un moyen affiché au client serait rejeté en POST.
      for (const method of Object.keys(OPERATORS)) {
        const parsed = subscribeSchema.safeParse({
          plan: 'DISCOVERY',
          method,
          phoneNumber: '+221771234567',
        });
        assert.equal(parsed.success, true, `subscribeSchema rejette le moyen ${method}`);
      }
    });

    test('seuls les portefeuilles mobiles exigent un numéro', () => {
      assert.equal(OPERATORS.CARD.isMobileMoney, false);
      assert.equal(OPERATORS.ORANGE_MONEY.isMobileMoney, true);
      assert.equal(OPERATORS.WAVE.isMobileMoney, true);
    });
  });
});

describe('Validateur de souscription (subscribeSchema)', () => {
  test('accepte une demande complète', () => {
    const parsed = subscribeSchema.parse({
      plan: 'STANDARD',
      method: 'WAVE',
      phoneNumber: '+221771234567',
      autoRenew: false,
    });
    assert.equal(parsed.plan, 'STANDARD');
    assert.equal(parsed.autoRenew, false);
  });

  test('autoRenew vaut true par défaut', () => {
    const parsed = subscribeSchema.parse({
      plan: 'DISCOVERY',
      method: 'ORANGE_MONEY',
      phoneNumber: '+221771234567',
    });
    assert.equal(parsed.autoRenew, true);
  });

  test('rejette un plan inconnu', () => {
    assert.equal(
      subscribeSchema.safeParse({ plan: 'PREMIUM', method: 'WAVE', phoneNumber: '+221771234567' })
        .success,
      false,
    );
  });

  test('rejette un moyen de paiement hors zone F CFA', () => {
    assert.equal(
      subscribeSchema.safeParse({ plan: 'STANDARD', method: 'MPESA', phoneNumber: '+221771234567' })
        .success,
      false,
    );
  });

  test('exige un numéro au format E.164', () => {
    for (const phone of ['0771234567', '221771234567', '+221', 'abc', '']) {
      assert.equal(
        subscribeSchema.safeParse({ plan: 'STANDARD', method: 'WAVE', phoneNumber: phone }).success,
        false,
        `le numéro « ${phone} » ne devrait pas être accepté`,
      );
    }
  });
});
