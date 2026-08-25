import './helpers/setup';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { config } from './helpers/setup';
import { resetDb, seedUser, fakePrisma } from './helpers/fakePrisma';
import { assertAppError } from './helpers/factories';
import { OtpDelivery } from '../src/utils/otpDelivery';
import { EmailSender, otpEmail } from '../src/utils/emailSender';
import { authService } from '../src/services/auth.service';
import { otpDelivery } from '../src/utils/otpDelivery';

/**
 * Acheminement du code de vérification.
 *
 * L'e-mail est passé canal principal : il ne dépend d'aucun compte tiers, là
 * où le SMS suppose un fournisseur provisionné et, en compte d'essai, des
 * numéros destinataires vérifiés un à un.
 *
 * Le point qui se vérifie mal à l'œil nu est la conséquence : un code reçu par
 * e-mail ne prouve rien du téléphone. `verifyOtp` doit donc marquer
 * `emailVerified` et NON `phoneVerified` — sinon la base affirme une
 * vérification qui n'a pas eu lieu.
 */

/** Canal de test : consigne ses envois, réussit ou échoue à la demande. */
function canal(name: 'email' | 'sms', opts: { utilisable?: boolean; echoue?: boolean } = {}) {
  const envois: string[] = [];
  return {
    name,
    envois,
    usable: () => opts.utilisable !== false,
    async send(_dest: any, code: string) {
      envois.push(code);
      if (opts.echoue) throw new Error(`${name} indisponible`);
      return name === 'sms' ? 'twilio' : 'smtp';
    },
  };
}

const DEST = { phone: '+221770000001', email: 'awa@exemple.sn' };

describe('Acheminement du code — ordre et repli', () => {
  test('l’e-mail est essayé avant le SMS', async () => {
    const email = canal('email');
    const sms = canal('sms');
    const res = await new OtpDelivery([email, sms] as any).send(DEST, '123456');
    assert.equal(res.channel, 'email');
    assert.deepEqual(sms.envois, [], 'le SMS ne doit pas être sollicité inutilement');
  });

  test('un e-mail en échec bascule sur le SMS', async () => {
    const email = canal('email', { echoue: true });
    const sms = canal('sms');
    const res = await new OtpDelivery([email, sms] as any).send(DEST, '123456');
    assert.equal(res.channel, 'sms');
    assert.equal(res.failures.length, 1);
  });

  test('un canal inutilisable est ignoré, pas compté en échec', async () => {
    const email = canal('email', { utilisable: false });
    const sms = canal('sms');
    const res = await new OtpDelivery([email, sms] as any).send(DEST, '123456');
    assert.equal(res.channel, 'sms');
    assert.deepEqual(res.failures, [], 'absent ≠ en panne');
  });

  test('tous en échec : l’erreur nomme chaque canal', async () => {
    const d = new OtpDelivery([
      canal('email', { echoue: true }),
      canal('sms', { echoue: true }),
    ] as any);
    await assert.rejects(
      () => d.send(DEST, '123456'),
      (e: Error) => /email/.test(e.message) && /sms/.test(e.message),
    );
  });

  test('aucun canal utilisable : rien n’est tenté', async () => {
    const d = new OtpDelivery([canal('email', { utilisable: false })] as any);
    assert.equal(d.isConfigured(DEST), false);
    await assert.rejects(() => d.send(DEST, '123456'), /Aucun canal/);
  });

  test('la chaîne réelle place l’e-mail en premier', () => {
    const noms = (otpDelivery as any).channels.map((c: any) => c.name);
    assert.deepEqual(noms, ['email', 'sms']);
  });
});

describe('Message du code de vérification', () => {
  test('le code figure dans l’objet, le texte et le HTML', () => {
    const m = otpEmail('482913');
    assert.match(m.subject, /482913/);
    assert.match(m.text, /482913/);
    assert.match(m.html, /482913/);
  });

  test('la durée de validité est annoncée', () => {
    assert.match(otpEmail('000000').text, /10 minutes/);
  });

  test('sans expéditeur configuré, l’envoi est refusé', async () => {
    const sender = new EmailSender();
    assert.equal(sender.isConfigured(), false, 'MAIL_FROM absent en test');
    await assert.rejects(
      () => sender.send({ to: 'a@b.c', subject: 's', text: 't' }),
      /non configuré/,
    );
  });
});

describe('Vérification — on ne certifie que ce qui est prouvé', () => {
  beforeEach(() => {
    resetDb();
    seedUser({ id: 'u', phone: '+221770001111', email: 'u@exemple.sn' });
  });

  /** Remplace temporairement les canaux de la chaîne partagée. */
  async function avecCanaux(list: any[], fn: () => Promise<void>) {
    const precedent = (otpDelivery as any).channels;
    try {
      (otpDelivery as any).channels = list;
      await fn();
    } finally {
      (otpDelivery as any).channels = precedent;
    }
  }

  test('le canal utilisé est consigné sur le code émis', async () => {
    await avecCanaux([canal('email')], async () => {
      await authService.requestOtp('+221770001111', 'registration');
    });
    assert.equal(fakePrisma.otpCode.rows[0].channel, 'email');
  });

  test('un code reçu par e-mail atteste l’adresse, pas le téléphone', async () => {
    fakePrisma.otpCode.insert({
      phone: '+221770001111', code: await require('bcryptjs').hash('123456', 8),
      purpose: 'registration', channel: 'email',
      expiresAt: new Date(Date.now() + 600_000), consumedAt: null, attempts: 0,
    });
    const user = await authService.verifyOtp('+221770001111', '123456');
    assert.equal(user.emailVerified, true, 'l’adresse est prouvée');
    assert.notEqual(user.phoneVerified, true, 'le téléphone ne l’est pas');
    assert.equal(user.status, 'ACTIVE');
  });

  test('un code reçu par SMS atteste le téléphone', async () => {
    fakePrisma.otpCode.insert({
      phone: '+221770001111', code: await require('bcryptjs').hash('654321', 8),
      purpose: 'registration', channel: 'sms',
      expiresAt: new Date(Date.now() + 600_000), consumedAt: null, attempts: 0,
    });
    const user = await authService.verifyOtp('+221770001111', '654321');
    assert.equal(user.phoneVerified, true);
  });

  test('un code antérieur au canal e-mail reste traité comme un SMS', async () => {
    fakePrisma.otpCode.insert({
      phone: '+221770001111', code: await require('bcryptjs').hash('111111', 8),
      purpose: 'registration', channel: null,
      expiresAt: new Date(Date.now() + 600_000), consumedAt: null, attempts: 0,
    });
    const user = await authService.verifyOtp('+221770001111', '111111');
    assert.equal(user.phoneVerified, true, 'rétrocompatibilité : null ⇒ SMS');
  });

  test('un échec de tous les canaux ne consomme pas le quota', async () => {
    await avecCanaux([canal('email', { echoue: true })], async () => {
      await assertAppError(() => authService.requestOtp('+221770001111', 'registration'), 502);
    });
    assert.equal(fakePrisma.otpCode.rows.length, 0);
  });
});
