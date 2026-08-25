import { config } from './helpers/setup';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TwilioSmsClient } from '../src/utils/twilioSms';

/**
 * Client Twilio — vérifie la CONSTRUCTION des requêtes d'envoi de SMS.
 *
 * L'envoi réel dépend d'identifiants Twilio absents en local ; on ne peut donc
 * pas prouver la livraison. On prouve en revanche, avec un axios injecté, que
 * chaque requête est bâtie exactement comme l'API l'exige (URL, Basic auth,
 * corps form-urlencoded To/From/Body) et que les erreurs Twilio (code +
 * message) remontent — le maximum vérifiable sans réseau, et qui empêche
 * qu'une régression sur l'URL ou le payload passe inaperçue.
 */

interface Recorded {
  url: string;
  body: any;
  opts: any;
}

/** Faux client HTTP : enregistre les appels, renvoie des réponses pilotables. */
function makeHttp() {
  const calls: Recorded[] = [];
  let failure: any = null;

  const http: any = {
    async post(url: string, body: any, opts: any) {
      calls.push({ url, body, opts });
      if (failure) throw failure;
      return { status: 201, data: { sid: 'SM-TEST-1', status: 'queued' } };
    },
  };

  return {
    http,
    calls,
    sendCalls: () => calls.filter((c) => c.url.includes('/Messages.json')),
    /** Simule un échec HTTP Twilio (4xx avec corps { code, message }). */
    failWith: (code: number, message: string) => {
      failure = { response: { status: 400, data: { code, message } } };
    },
    /** Simule une panne réseau (sans corps de réponse Twilio). */
    failNetwork: (msg: string) => {
      failure = new Error(msg);
    },
  };
}

describe('Client Twilio (SMS OTP)', () => {
  let saved: typeof config.twilio;

  beforeEach(() => {
    saved = { ...config.twilio };
    Object.assign(config.twilio, {
      accountSid: 'ACxxxxxxxx',
      authToken: 'tok-secret',
      apiKeySid: '',
      apiKeySecret: '',
      from: '+12025550123',
      messagingServiceSid: '',
    });
  });

  function restore() {
    Object.assign(config.twilio, saved);
  }

  describe('isConfigured', () => {
    test('vrai avec identifiants + numéro émetteur', () => {
      const c = new TwilioSmsClient(makeHttp().http);
      assert.equal(c.isConfigured(), true);
      restore();
    });

    test('vrai avec identifiants + Messaging Service (sans numéro)', () => {
      config.twilio.from = '';
      config.twilio.messagingServiceSid = 'MGxxxx';
      const c = new TwilioSmsClient(makeHttp().http);
      assert.equal(c.isConfigured(), true);
      restore();
    });

    test('faux si aucun émetteur (ni numéro ni service)', () => {
      config.twilio.from = '';
      config.twilio.messagingServiceSid = '';
      const c = new TwilioSmsClient(makeHttp().http);
      assert.equal(c.isConfigured(), false);
      restore();
    });

    test('faux si le token manque', () => {
      config.twilio.authToken = '';
      const c = new TwilioSmsClient(makeHttp().http);
      assert.equal(c.isConfigured(), false);
      restore();
    });

    test('faux si l’Account SID manque', () => {
      config.twilio.accountSid = '';
      const c = new TwilioSmsClient(makeHttp().http);
      assert.equal(c.isConfigured(), false);
      restore();
    });
  });

  describe('sendSms', () => {
    test('construit l’URL Messages.json, la Basic auth et le corps To/From/Body', async () => {
      const m = makeHttp();
      const c = new TwilioSmsClient(m.http);
      await c.sendSms('+229981234567', 'Votre code est 123456');

      assert.equal(m.sendCalls().length, 1);
      const call = m.sendCalls()[0];
      assert.equal(
        call.url,
        'https://api.twilio.com/2010-04-01/Accounts/ACxxxxxxxx/Messages.json',
      );
      const expectedBasic = 'Basic ' + Buffer.from('ACxxxxxxxx:tok-secret').toString('base64');
      assert.equal(call.opts.headers.Authorization, expectedBasic);
      assert.equal(call.opts.headers['Content-Type'], 'application/x-www-form-urlencoded');

      const params = new URLSearchParams(call.body);
      assert.equal(params.get('To'), '+229981234567');
      assert.equal(params.get('From'), '+12025550123');
      assert.equal(params.get('Body'), 'Votre code est 123456');
      assert.equal(params.get('MessagingServiceSid'), null, 'From prime quand aucun service');
      restore();
    });

    test('privilégie MessagingServiceSid quand il est fourni (pas de From)', async () => {
      config.twilio.messagingServiceSid = 'MG-abc';
      const m = makeHttp();
      const c = new TwilioSmsClient(m.http);
      await c.sendSms('+229981234567', 'msg');

      const params = new URLSearchParams(m.sendCalls()[0].body);
      assert.equal(params.get('MessagingServiceSid'), 'MG-abc');
      assert.equal(params.get('From'), null, 'From est omis au profit du service');
      restore();
    });

    test('normalise un numéro sans « + » en tête', async () => {
      const m = makeHttp();
      const c = new TwilioSmsClient(m.http);
      await c.sendSms('229981234567', 'msg');
      const params = new URLSearchParams(m.sendCalls()[0].body);
      assert.equal(params.get('To'), '+229981234567');
      restore();
    });

    test('lève si le client n’est pas configuré (aucun appel réseau)', async () => {
      config.twilio.from = '';
      config.twilio.messagingServiceSid = '';
      const m = makeHttp();
      const c = new TwilioSmsClient(m.http);
      await assert.rejects(() => c.sendSms('+229981234567', 'msg'), /non configur/);
      assert.equal(m.calls.length, 0, 'aucun appel réseau si non configuré');
      restore();
    });

    test('remonte le code + message d’erreur Twilio (ex. 21211 numéro invalide)', async () => {
      const m = makeHttp();
      m.failWith(21211, "The 'To' number is not a valid phone number.");
      const c = new TwilioSmsClient(m.http);
      await assert.rejects(
        () => c.sendSms('+229981234567', 'msg'),
        /Twilio 21211: The 'To' number is not a valid phone number\./,
      );
      restore();
    });

    test('propage une panne réseau sans corps Twilio', async () => {
      const m = makeHttp();
      m.failNetwork('ECONNRESET');
      const c = new TwilioSmsClient(m.http);
      await assert.rejects(() => c.sendSms('+229981234567', 'msg'), /ECONNRESET/);
      restore();
    });
  });

  describe('authentification par clé d’API', () => {
    test('la clé d’API l’emporte sur le jeton de compte', async () => {
      Object.assign(config.twilio, { apiKeySid: 'SK123', apiKeySecret: 'secret-cle' });
      const m = makeHttp();
      await new TwilioSmsClient(m.http).sendSms('+221770000000', 'code');
      const call = m.sendCalls()[0];
      assert.equal(
        call.opts.headers.Authorization,
        'Basic ' + Buffer.from('SK123:secret-cle').toString('base64'),
        'une clé révocable doit primer sur le jeton du compte entier',
      );
      restore();
    });

    test('l’Account SID reste dans l’URL même avec une clé d’API', async () => {
      Object.assign(config.twilio, { apiKeySid: 'SK123', apiKeySecret: 'secret-cle' });
      const m = makeHttp();
      await new TwilioSmsClient(m.http).sendSms('+221770000000', 'code');
      assert.equal(
        m.sendCalls()[0].url,
        'https://api.twilio.com/2010-04-01/Accounts/ACxxxxxxxx/Messages.json',
        'la clé authentifie, elle ne désigne pas le compte',
      );
      restore();
    });

    test('une clé d’API sans Account SID ne suffit pas', () => {
      Object.assign(config.twilio, {
        accountSid: '', authToken: '', apiKeySid: 'SK123', apiKeySecret: 'secret-cle',
      });
      assert.equal(new TwilioSmsClient(makeHttp().http).isConfigured(), false);
      restore();
    });

    test('une clé incomplète retombe sur le jeton de compte', async () => {
      Object.assign(config.twilio, { apiKeySid: 'SK123', apiKeySecret: '' });
      const m = makeHttp();
      await new TwilioSmsClient(m.http).sendSms('+221770000000', 'code');
      assert.equal(
        m.sendCalls()[0].opts.headers.Authorization,
        'Basic ' + Buffer.from('ACxxxxxxxx:tok-secret').toString('base64'),
      );
      restore();
    });

    test('sans aucun identifiant, isConfigured est faux', () => {
      Object.assign(config.twilio, { authToken: '', apiKeySid: '', apiKeySecret: '' });
      assert.equal(new TwilioSmsClient(makeHttp().http).isConfigured(), false);
      restore();
    });
  });
});
