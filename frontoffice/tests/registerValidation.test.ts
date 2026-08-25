import './helpers/setup';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { registerSchema } from '../src/validators';

/**
 * Garde-fou d'inscription : dans la zone F CFA, le numéro doit porter
 * l'indicatif du pays (le paiement mobile money et l'OTP en dépendent). Les
 * pays hors zone (diaspora) ne sont pas contraints.
 */
function base(over: Record<string, any> = {}) {
  return {
    phone: '+221771234567',
    // Obligatoire depuis que le code de verification part par e-mail.
    email: 'awa@example.com',
    firstName: 'Awa',
    birthDate: '1995-06-15',
    gender: 'FEMALE',
    intent: 'MARRIAGE',
    city: 'Dakar',
    country: 'SN',
    ...over,
  };
}

describe('registerSchema — cohérence indicatif / pays', () => {
  test('accepte un numéro à l’indicatif du pays (SN + +221)', () => {
    assert.equal(registerSchema.safeParse(base()).success, true);
  });

  test('accepte le Bénin avec un numéro +229', () => {
    const r = registerSchema.safeParse(base({ country: 'BJ', phone: '+22998285386', city: 'Cotonou' }));
    assert.equal(r.success, true);
  });

  test('refuse un pays F CFA avec un indicatif étranger (BJ + +33)', () => {
    const r = registerSchema.safeParse(base({ country: 'BJ', phone: '+33759856864', city: 'Cotonou' }));
    assert.equal(r.success, false);
    if (!r.success) {
      assert.ok(r.error.issues.some((i) => i.path.includes('phone')), 'l’erreur cible le champ phone');
    }
  });

  test('refuse un indicatif d’un autre pays de la zone (SN + +225)', () => {
    const r = registerSchema.safeParse(base({ phone: '+2250700000000' }));
    assert.equal(r.success, false);
  });

  test('n’impose rien hors zone F CFA (FR + numéro français)', () => {
    const r = registerSchema.safeParse(base({ country: 'FR', phone: '+33612345678', city: 'Paris' }));
    assert.equal(r.success, true);
  });

  test('diaspora : pays hors zone + numéro africain reste accepté (FR + +229)', () => {
    const r = registerSchema.safeParse(base({ country: 'FR', phone: '+22998285386', city: 'Paris' }));
    assert.equal(r.success, true);
  });

  test('le format E.164 reste exigé', () => {
    assert.equal(registerSchema.safeParse(base({ phone: '0771234567' })).success, false);
  });
});

describe('registerSchema — l’e-mail est le canal de vérification', () => {
  test('une inscription sans e-mail est refusée', () => {
    const sans = base();
    delete (sans as any).email;
    const r = registerSchema.safeParse(sans);
    assert.equal(r.success, false, 'sans adresse, le code ne peut aller nulle part');
  });

  test('une adresse mal formée est refusée', () => {
    assert.equal(registerSchema.safeParse(base({ email: 'pas-une-adresse' })).success, false);
  });

  test('une adresse valide passe', () => {
    assert.equal(registerSchema.safeParse(base({ email: 'fatou@exemple.sn' })).success, true);
  });
});
