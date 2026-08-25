import './helpers/setup';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { registerSchema, MIN_AGE, MAX_AGE } from '../src/validators';
import { calculateAge } from '../src/utils/helpers';

/**
 * Âge minimum à l'inscription.
 *
 * Le contrôle est côté serveur : la validation du navigateur est une commodité
 * d'affichage, elle se contourne par une simple requête HTTP.
 *
 * Le calcul est CALENDAIRE, identique à celui de `calculateAge` qui sert à
 * l'affichage. L'approximation précédente (365,25 jours par an) pouvait
 * diverger d'un jour selon les années bissextiles traversées : un profil
 * accepté comme majeur pouvait s'afficher à 17 ans. Sur un seuil légal, les
 * deux doivent dire la même chose — c'est ce que vérifie le dernier bloc.
 */

/** Date de naissance donnant exactement `ans`, décalée de `jours`. */
function naissance(ans: number, jours = 0): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - ans);
  d.setDate(d.getDate() + jours);
  return d.toISOString().slice(0, 10);
}

function inscription(birthDate: string) {
  return registerSchema.safeParse({
    phone: '+221771234567',
    email: 'awa@example.com',
    firstName: 'Awa',
    birthDate,
    gender: 'FEMALE',
    intent: 'MARRIAGE',
    city: 'Dakar',
    country: 'SN',
  });
}

/** Message d'erreur portant sur la date de naissance, s'il y en a un. */
function messageAge(r: ReturnType<typeof inscription>): string {
  if (r.success) return '';
  const issue = r.error.issues.find((i) => i.path.includes('birthDate'));
  return issue?.message ?? '';
}

describe('Inscription — âge minimum', () => {
  test('le seuil est de 18 ans', () => {
    assert.equal(MIN_AGE, 18);
  });

  test('un mineur est refusé', () => {
    for (const ans of [0, 10, 15, 17]) {
      assert.equal(inscription(naissance(ans)).success, false, `${ans} ans doit être refusé`);
    }
  });

  test('la veille des 18 ans est refusée', () => {
    const r = inscription(naissance(18, 1));
    assert.equal(r.success, false, 'il manque un jour');
    assert.match(messageAge(r), /18 ans/);
  });

  test('le jour des 18 ans est accepté', () => {
    assert.equal(inscription(naissance(18)).success, true, 'la majorité est atteinte le jour même');
  });

  test('le lendemain des 18 ans est accepté', () => {
    assert.equal(inscription(naissance(18, -1)).success, true);
  });

  test('un adulte passe sans encombre', () => {
    for (const ans of [19, 30, 55, 99]) {
      assert.equal(inscription(naissance(ans)).success, true, `${ans} ans doit passer`);
    }
  });
});

describe('Inscription — dates aberrantes', () => {
  test('une date future est refusée avec son propre message', () => {
    const r = inscription(naissance(-1));
    assert.equal(r.success, false);
    assert.match(messageAge(r), /futur/, 'naître demain n’est pas un problème de majorité');
  });

  test('un âge invraisemblable n’invoque pas la majorité', () => {
    const r = inscription(naissance(MAX_AGE + 5));
    assert.equal(r.success, false);
    assert.doesNotMatch(
      messageAge(r),
      /au moins 18 ans/,
      'refuser 105 ans en annonçant « au moins 18 ans » égare la personne',
    );
  });
});

describe('Cohérence entre le contrôle et l’affichage', () => {
  test('le validateur et calculateAge s’accordent sur chaque borne', () => {
    // On balaie plusieurs décalages autour de l'anniversaire des 18 ans :
    // c'est là que l'approximation en jours divergeait du calendrier.
    for (let jours = -3; jours <= 3; jours++) {
      const date = naissance(18, jours);
      const age = calculateAge(new Date(date));
      const accepte = inscription(date).success;
      assert.equal(
        accepte,
        age >= MIN_AGE,
        `${date} : affiché ${age} ans mais ${accepte ? 'accepté' : 'refusé'}`,
      );
    }
  });

  test('l’accord tient aussi loin de la borne', () => {
    for (const ans of [17, 18, 25, 60, 99, 101]) {
      const date = naissance(ans);
      const age = calculateAge(new Date(date));
      const attendu = age >= MIN_AGE && age <= MAX_AGE;
      assert.equal(inscription(date).success, attendu, `${ans} ans (calculé ${age})`);
    }
  });
});
