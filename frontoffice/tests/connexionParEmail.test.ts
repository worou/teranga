import './helpers/setup';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { resetDb, seedUser, fakePrisma } from './helpers/fakePrisma';
import { assertAppError } from './helpers/factories';
import { otpRequestSchema, otpVerifySchema, loginSchema } from '../src/validators';
import { authService, formatAttente } from '../src/services/auth.service';
import { config } from './helpers/setup';

/**
 * Connexion par ADRESSE E-MAIL — par code comme par mot de passe.
 *
 * La page demandait un numéro de téléphone alors que le code partait par
 * e-mail : il fallait connaître un numéro pour recevoir un message
 * électronique. Les deux onglets identifient désormais par l'adresse.
 *
 * Le point délicat : les codes restent stockés PAR TÉLÉPHONE — `OtpCode.phone`,
 * index `[phone, code]`, et `verifyOtp` qui cherche par numéro. L'e-mail est
 * traduit en téléphone avant toute écriture. Ces tests vérifient que la
 * traduction a bien lieu, et qu'elle ne crée ni fuite ni contournement.
 */

const TEL = '+221771234567';
const MAIL = 'awa@teranga.sn';

function seedCompte() {
  return seedUser({ id: 'u-1', phone: TEL, email: MAIL, firstName: 'Awa', status: 'ACTIVE' });
}

/** Toutes les lignes OTP en base. */
async function lignesOtp() {
  return fakePrisma.otpCode.findMany({});
}

describe('Identifiant accepté par les schémas', () => {
  test('une adresse e-mail seule suffit', () => {
    const r = otpRequestSchema.safeParse({ email: MAIL });
    assert.equal(r.success, true);
  });

  test('un téléphone seul reste accepté', () => {
    // L'inscription s'en sert encore : la bascule ne doit rien casser.
    assert.equal(otpRequestSchema.safeParse({ phone: TEL }).success, true);
  });

  test('aucun identifiant est refusé', () => {
    assert.equal(otpRequestSchema.safeParse({}).success, false);
  });

  test('les deux à la fois sont refusés', () => {
    // Ils pourraient désigner deux comptes différents : on refuse plutôt que
    // d'en choisir un arbitrairement.
    assert.equal(otpRequestSchema.safeParse({ phone: TEL, email: MAIL }).success, false);
  });

  test('une adresse malformée est refusée', () => {
    assert.equal(otpRequestSchema.safeParse({ email: 'pas-une-adresse' }).success, false);
  });

  test('la vérification exige aussi un identifiant et un code', () => {
    assert.equal(otpVerifySchema.safeParse({ email: MAIL, code: '123456' }).success, true);
    assert.equal(otpVerifySchema.safeParse({ code: '123456' }).success, false);
    assert.equal(otpVerifySchema.safeParse({ email: MAIL, code: '123' }).success, false);
  });
});

describe('Demande de code par e-mail', () => {
  beforeEach(() => {
    resetDb();
    seedCompte();
  });

  test('le code est enregistré sous le TÉLÉPHONE du compte', async () => {
    await authService.requestOtpFor({ email: MAIL }, 'login');
    const lignes = await lignesOtp();
    assert.equal(lignes.length, 1, 'une ligne doit être créée');
    assert.equal(
      lignes[0].phone,
      TEL,
      'stocker sous l’e-mail rendrait le code introuvable par verifyOtp',
    );
  });

  test('l’adresse est normalisée avant la recherche', async () => {
    await authService.requestOtpFor({ email: '  AWA@Teranga.SN  ' }, 'login');
    assert.equal((await lignesOtp()).length, 1, 'espaces et majuscules ne doivent pas faire échouer');
  });

  test('le téléphone continue de fonctionner', async () => {
    await authService.requestOtpFor({ phone: TEL }, 'login');
    assert.equal((await lignesOtp()).length, 1);
  });
});

describe('Adresse inconnue — pas de divulgation', () => {
  beforeEach(() => {
    resetDb();
    seedCompte();
  });

  test('la réponse est la même que pour une adresse connue', async () => {
    // Répondre « ce compte n'existe pas » dirait à qui le demande quelles
    // adresses sont inscrites sur un site de rencontres.
    const connue = await authService.requestOtpFor({ email: MAIL }, 'login');
    const inconnue = await authService.requestOtpFor({ email: 'personne@example.com' }, 'login');
    assert.deepEqual(Object.keys(inconnue).sort(), Object.keys(connue).sort());
    assert.equal(inconnue.sent, true);
  });

  test('aucun code n’est créé pour une adresse sans compte', async () => {
    await authService.requestOtpFor({ email: 'personne@example.com' }, 'login');
    assert.equal((await lignesOtp()).length, 0);
  });

  test('la vérification échoue comme sur un code faux', async () => {
    await assertAppError(
      () => authService.verifyOtpFor({ email: 'personne@example.com' }, '123456'),
      400,
    );
  });
});

describe('Le quota n’est pas contourné par l’e-mail', () => {
  beforeEach(() => {
    resetDb();
    seedCompte();
  });

  test('les demandes par e-mail comptent avec celles par téléphone', async () => {
    // Le quota est de 3 par heure et par téléphone. Si l'e-mail était résolu
    // APRÈS le comptage, il ouvrirait une seconde réserve de 3 codes.
    await authService.requestOtpFor({ phone: TEL }, 'login');
    await authService.requestOtpFor({ email: MAIL }, 'login');
    await authService.requestOtpFor({ phone: TEL }, 'login');

    await assertAppError(() => authService.requestOtpFor({ email: MAIL }, 'login'), 429);
  });
});

describe('Vérification du code par e-mail', () => {
  const CODE = '424242';

  beforeEach(async () => {
    resetDb();
    seedCompte();
    await fakePrisma.otpCode.create({
      data: {
        userId: 'u-1',
        phone: TEL,
        code: await bcrypt.hash(CODE, 8),
        purpose: 'login',
        channel: 'email',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        consumedAt: null,
        attempts: 0,
        createdAt: new Date(),
      },
    });
  });

  test('un code valide identifie le compte par son adresse', async () => {
    const user = await authService.verifyOtpFor({ email: MAIL }, CODE);
    assert.equal(user.id, 'u-1');
  });

  test('le canal e-mail certifie l’adresse, pas le téléphone', async () => {
    // Un code reçu par e-mail n'atteste rien de la possession du numéro.
    const user = await authService.verifyOtpFor({ email: MAIL }, CODE);
    assert.equal(user.emailVerified, true);
    assert.notEqual(user.phoneVerified, true);
  });

  test('un code erroné est refusé', async () => {
    await assertAppError(() => authService.verifyOtpFor({ email: MAIL }, '000000'), 400);
  });
});

describe('Connexion par mot de passe avec l’adresse', () => {
  const MOT_DE_PASSE = 'Secret!2026';

  beforeEach(async () => {
    resetDb();
    seedUser({
      id: 'u-1',
      phone: TEL,
      email: MAIL,
      firstName: 'Awa',
      status: 'ACTIVE',
      passwordHash: await bcrypt.hash(MOT_DE_PASSE, 10),
    });
  });

  test('l’adresse identifie le compte', async () => {
    const user = await authService.loginFor({ email: MAIL }, MOT_DE_PASSE);
    assert.equal(user.id, 'u-1');
  });

  test('le téléphone reste accepté', async () => {
    const user = await authService.loginFor({ phone: TEL }, MOT_DE_PASSE);
    assert.equal(user.id, 'u-1');
  });

  test('une adresse inconnue échoue comme un mot de passe faux', async () => {
    // Les deux refus doivent être indiscernables : sinon une simple tentative
    // de connexion révèle si une adresse a un compte sur le site.
    await assertAppError(() => authService.loginFor({ email: 'inconnu@example.com' }, MOT_DE_PASSE), 401);
    await assertAppError(() => authService.loginFor({ email: MAIL }, 'mauvais'), 401);
  });

  test('le schéma exige un identifiant et un seul', () => {
    assert.equal(loginSchema.safeParse({ email: MAIL, password: 'x' }).success, true);
    assert.equal(loginSchema.safeParse({ phone: TEL, password: 'x' }).success, true);
    assert.equal(loginSchema.safeParse({ password: 'x' }).success, false);
    assert.equal(loginSchema.safeParse({ email: MAIL, phone: TEL, password: 'x' }).success, false);
  });
})

describe('Quota des codes — fenêtre courte et délai honnête', () => {
  beforeEach(() => {
    resetDb();
    seedCompte();
  });

  test('la fenêtre est de 10 minutes, pas d’une heure', () => {
    // Une heure punissait l'usage normal : ne pas recevoir son code, réessayer
    // deux fois, se tromper de boîte — et rester bloqué jusqu'au soir.
    assert.equal(config.otp.quotaWindowMs, 10 * 60 * 1000);
    assert.equal(config.otp.quotaMax, 3);
  });

  test('la durée de vie d’un code suit la même configuration', async () => {
    const r = await authService.requestOtpFor({ email: MAIL }, 'login');
    const restant = new Date(r.expiresAt).getTime() - Date.now();
    assert.ok(restant > 0 && restant <= config.otp.ttlMs, `durée inattendue : ${restant}ms`);
  });

  test('une demande hors fenêtre ne compte plus', async () => {
    // Trois demandes anciennes ne doivent pas bloquer : elles sont sorties de
    // la fenêtre glissante.
    const vieux = new Date(Date.now() - config.otp.quotaWindowMs - 60_000);
    for (let i = 0; i < 3; i++) {
      await fakePrisma.otpCode.create({
        data: {
          userId: 'u-1', phone: TEL, code: 'x', purpose: 'login', channel: 'email',
          expiresAt: vieux, consumedAt: null, attempts: 0, createdAt: vieux,
        },
      });
    }
    await authService.requestOtpFor({ email: MAIL }, 'login');
    assert.ok(true, 'la demande doit passer');
  });

  test('le message annonce le délai réel, pas « 1 heure »', async () => {
    for (let i = 0; i < config.otp.quotaMax; i++) {
      await authService.requestOtpFor({ email: MAIL }, 'login');
    }
    let message = '';
    try {
      await authService.requestOtpFor({ email: MAIL }, 'login');
    } catch (e) {
      message = (e as Error).message;
    }
    assert.match(message, /Trop de demandes/);
    assert.doesNotMatch(message, /1 heure/, 'le message ne doit plus promettre une heure');
    assert.match(message, /minute/, 'il doit annoncer un délai en minutes');
  });
});

describe('Formatage du délai d’attente', () => {
  test('rend un texte juste à chaque échelle', () => {
    assert.equal(formatAttente(0), 'quelques instants');
    assert.equal(formatAttente(-5), 'quelques instants');
    assert.equal(formatAttente(30_000), 'moins d’une minute');
    assert.equal(formatAttente(60_000), 'moins d’une minute');
    assert.equal(formatAttente(90_000), '2 minutes');
    assert.equal(formatAttente(9 * 60_000), '9 minutes');
    assert.equal(formatAttente(60 * 60_000), '1 heure');
  });
})
