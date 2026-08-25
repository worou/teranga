import './helpers/setup';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, seedUser, fakePrisma } from './helpers/fakePrisma';
import { assertAppError } from './helpers/factories';
import { SmsSender, type SmsProvider } from '../src/utils/smsSender';
import { authService } from '../src/services/auth.service';
import { smsSender } from '../src/utils/smsSender';

/**
 * Envoi des SMS : chaîne de fournisseurs et quota d'OTP.
 *
 * Avant, `requestOtp` n'appelait que Twilio — `orangeSms` était écrit mais
 * jamais importé. Une panne du fournisseur bloquait donc toutes les
 * inscriptions, et pire : la ligne OtpCode étant créée *avant* l'envoi, chaque
 * échec consommait une des trois demandes horaires. Trois pannes d'affilée
 * enfermaient un utilisateur une heure sans qu'il ait reçu le moindre code.
 */

/** Fournisseur de test : consigne ses appels, réussit ou échoue à la demande. */
function provider(name: string, opts: { configured?: boolean; fails?: boolean } = {}): SmsProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    name,
    calls,
    isConfigured: () => opts.configured !== false,
    async sendSms(to: string) {
      calls.push(to);
      if (opts.fails) throw new Error(`${name} indisponible`);
    },
  };
}

describe('Chaîne SMS — repli d’un fournisseur sur l’autre', () => {
  test('le premier fournisseur configuré suffit', async () => {
    const a = provider('a');
    const b = provider('b');
    const res = await new SmsSender([a, b]).send('+221770000000', 'salut');
    assert.equal(res.provider, 'a');
    assert.deepEqual(b.calls, [], 'le second ne doit pas être sollicité inutilement');
  });

  test('un échec bascule sur le suivant', async () => {
    const a = provider('a', { fails: true });
    const b = provider('b');
    const res = await new SmsSender([a, b]).send('+221770000000', 'salut');
    assert.equal(res.provider, 'b');
    assert.equal(res.failures.length, 1);
    assert.match(res.failures[0].error, /a indisponible/);
  });

  test('un fournisseur non configuré est ignoré, pas compté en échec', async () => {
    const a = provider('a', { configured: false });
    const b = provider('b');
    const res = await new SmsSender([a, b]).send('+221770000000', 'salut');
    assert.equal(res.provider, 'b');
    assert.deepEqual(res.failures, [], 'absent ≠ en panne');
    assert.deepEqual(a.calls, []);
  });

  test('tous en échec : l’erreur nomme chaque tentative', async () => {
    const sender = new SmsSender([provider('a', { fails: true }), provider('b', { fails: true })]);
    await assert.rejects(
      () => sender.send('+221770000000', 'salut'),
      (err: Error) => /a indisponible/.test(err.message) && /b indisponible/.test(err.message),
    );
  });

  test('aucun fournisseur configuré : isConfigured est faux', () => {
    const sender = new SmsSender([provider('a', { configured: false })]);
    assert.equal(sender.isConfigured(), false);
    assert.deepEqual(sender.available(), []);
  });

  test('la chaîne réelle place Orange en repli de Twilio', () => {
    const noms = (smsSender as any).providers.map((p: SmsProvider) => p.name);
    assert.deepEqual(noms, ['twilio', 'orange'], 'Orange est l’opérateur pertinent en zone UEMOA');
  });
});

describe('Quota OTP — seuls les codes réellement envoyés comptent', () => {
  beforeEach(() => { resetDb(); seedUser({ id: 'u', phone: '+221770001111' }); });

  /** Remplace temporairement la chaîne du `smsSender` partagé. */
  async function withProviders(list: SmsProvider[], fn: () => Promise<void>) {
    const previous = (smsSender as any).providers;
    try {
      (smsSender as any).providers = list;
      await fn();
    } finally {
      (smsSender as any).providers = previous;
    }
  }

  test('un envoi en échec ne consomme pas le quota', async () => {
    await withProviders([provider('ko', { fails: true })], async () => {
      await assertAppError(() => authService.requestOtp('+221770001111', 'registration'), 502);
    });
    assert.equal(
      fakePrisma.otpCode.rows.length,
      0,
      'la ligne doit être retirée : sinon trois pannes enferment l’utilisateur une heure',
    );
  });

  test('trois échecs de suite laissent le quota intact', async () => {
    await withProviders([provider('ko', { fails: true })], async () => {
      for (let i = 0; i < 3; i++) {
        await assertAppError(() => authService.requestOtp('+221770001111', 'registration'), 502);
      }
    });
    assert.equal(fakePrisma.otpCode.rows.length, 0);

    // Le fournisseur revient : la demande suivante doit passer.
    await withProviders([provider('ok')], async () => {
      const res = await authService.requestOtp('+221770001111', 'registration');
      assert.equal(res.sent, true);
    });
    assert.equal(fakePrisma.otpCode.rows.length, 1);
  });

  test('un envoi réussi consomme bien le quota', async () => {
    await withProviders([provider('ok')], async () => {
      for (let i = 0; i < 3; i++) {
        await authService.requestOtp('+221770001111', 'registration');
      }
      await assertAppError(
        () => authService.requestOtp('+221770001111', 'registration'),
        429,
        'Trop de demandes',
      );
    });
    assert.equal(fakePrisma.otpCode.rows.length, 3);
  });

  test('le repli délivre sans consommer plus qu’une demande', async () => {
    await withProviders([provider('ko', { fails: true }), provider('ok')], async () => {
      const res = await authService.requestOtp('+221770001111', 'registration');
      assert.equal(res.sent, true);
    });
    assert.equal(fakePrisma.otpCode.rows.length, 1, 'un seul code émis malgré deux tentatives');
  });

  test('sans aucun fournisseur, le code est journalisé et le quota court', async () => {
    await withProviders([provider('absent', { configured: false })], async () => {
      const res = await authService.requestOtp('+221770001111', 'registration');
      assert.equal(res.sent, true);
    });
    assert.equal(fakePrisma.otpCode.rows.length, 1, 'un code émis compte, même sans SMS');
  });
});
