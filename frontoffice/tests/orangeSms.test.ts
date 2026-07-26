import { config } from './helpers/setup';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { OrangeSmsClient } from '../src/utils/orangeSms';

/**
 * Client Orange SMS — vérifie la CONSTRUCTION des requêtes (OAuth + envoi).
 *
 * L'envoi réel dépend d'identifiants Orange absents en local ; on ne peut donc
 * pas prouver la livraison. On prouve en revanche, avec un axios injecté, que
 * chaque requête est bâtie exactement comme l'API l'exige (URL, en-têtes, corps)
 * et que le jeton OAuth est mis en cache — c'est le maximum vérifiable sans
 * réseau, et ça évite qu'une régression sur l'URL ou le payload passe inaperçue.
 */

interface Recorded {
  url: string;
  body: any;
  opts: any;
}

/** Faux client HTTP : enregistre les appels, renvoie des réponses pilotables. */
function makeHttp() {
  const calls: Recorded[] = [];
  let tokenValue = 'ACCESS-TOKEN-1';
  let expiresIn = 3600;
  let sendShouldFail = false;

  const http: any = {
    async post(url: string, body: any, opts: any) {
      calls.push({ url, body, opts });
      if (url.includes('/oauth/v3/token')) {
        return { data: { access_token: tokenValue, expires_in: expiresIn } };
      }
      if (url.includes('/smsmessaging/')) {
        if (sendShouldFail) throw new Error('HTTP 500 Orange');
        return { status: 201, data: { outboundSMSMessageRequest: {} } };
      }
      throw new Error(`orangeSms mock: URL non simulée ${url}`);
    },
  };

  return {
    http,
    calls,
    tokenCalls: () => calls.filter((c) => c.url.includes('/oauth/v3/token')),
    sendCalls: () => calls.filter((c) => c.url.includes('/smsmessaging/')),
    setToken: (v: string) => (tokenValue = v),
    setExpiresIn: (v: number) => (expiresIn = v),
    failSend: () => (sendShouldFail = true),
  };
}

describe('Client Orange SMS', () => {
  let saved: typeof config.orangeSms;

  beforeEach(() => {
    saved = { ...config.orangeSms };
    Object.assign(config.orangeSms, {
      clientId: 'cid',
      clientSecret: 'csec',
      senderNumber: '+221777000000',
      senderName: 'Teranga',
    });
  });

  function restore() {
    Object.assign(config.orangeSms, saved);
  }

  describe('isConfigured', () => {
    test('vrai quand identifiants + numéro émetteur sont présents', () => {
      const c = new OrangeSmsClient(makeHttp().http);
      assert.equal(c.isConfigured(), true);
      restore();
    });

    test('faux si le numéro émetteur manque', () => {
      config.orangeSms.senderNumber = '';
      const c = new OrangeSmsClient(makeHttp().http);
      assert.equal(c.isConfigured(), false);
      restore();
    });

    test('faux si les identifiants manquent', () => {
      config.orangeSms.clientId = '';
      const c = new OrangeSmsClient(makeHttp().http);
      assert.equal(c.isConfigured(), false);
      restore();
    });
  });

  describe('getAccessToken (OAuth2 client_credentials)', () => {
    test('appelle le bon endpoint avec Basic auth et le bon corps', async () => {
      const m = makeHttp();
      const c = new OrangeSmsClient(m.http);
      const token = await c.getAccessToken();

      assert.equal(token, 'ACCESS-TOKEN-1');
      assert.equal(m.tokenCalls().length, 1);
      const call = m.tokenCalls()[0];
      assert.equal(call.url, 'https://api.orange.com/oauth/v3/token');
      assert.equal(call.body, 'grant_type=client_credentials');
      const expectedBasic = 'Basic ' + Buffer.from('cid:csec').toString('base64');
      assert.equal(call.opts.headers.Authorization, expectedBasic);
      assert.equal(call.opts.headers['Content-Type'], 'application/x-www-form-urlencoded');
      restore();
    });

    test('met le jeton en cache (pas de second appel OAuth)', async () => {
      const m = makeHttp();
      const c = new OrangeSmsClient(m.http);
      await c.getAccessToken();
      await c.getAccessToken();
      assert.equal(m.tokenCalls().length, 1, 'le jeton doit être réutilisé');
      restore();
    });

    test('redemande un jeton après expiration', async () => {
      const m = makeHttp();
      m.setExpiresIn(120); // marge interne de 60 s → TTL effectif 60 s
      const c = new OrangeSmsClient(m.http);
      const t0 = 1_000_000;
      await c.getAccessToken(t0);
      await c.getAccessToken(t0 + 61_000); // au-delà du TTL
      assert.equal(m.tokenCalls().length, 2);
      restore();
    });

    test('lève si la réponse OAuth ne contient pas de jeton', async () => {
      const m = makeHttp();
      m.setToken('' as any);
      const c = new OrangeSmsClient(m.http);
      await assert.rejects(() => c.getAccessToken(), /access_token/);
      restore();
    });
  });

  describe('sendSms', () => {
    test('construit l’URL (tel:+ encodé), l’en-tête Bearer et le corps attendu', async () => {
      const m = makeHttp();
      const c = new OrangeSmsClient(m.http);
      await c.sendSms('+221781112233', 'Votre code est 123456');

      assert.equal(m.sendCalls().length, 1);
      const call = m.sendCalls()[0];
      assert.equal(
        call.url,
        'https://api.orange.com/smsmessaging/v1/outbound/tel%3A%2B221777000000/requests',
      );
      assert.equal(call.opts.headers.Authorization, 'Bearer ACCESS-TOKEN-1');

      const req = call.body.outboundSMSMessageRequest;
      assert.equal(req.address, 'tel:+221781112233');
      assert.equal(req.senderAddress, 'tel:+221777000000');
      assert.equal(req.outboundSMSTextMessage.message, 'Votre code est 123456');
      assert.equal(req.senderName, 'Teranga');
      restore();
    });

    test('réutilise le jeton OAuth entre deux envois', async () => {
      const m = makeHttp();
      const c = new OrangeSmsClient(m.http);
      await c.sendSms('+221781112233', 'msg 1');
      await c.sendSms('+221781112234', 'msg 2');
      assert.equal(m.tokenCalls().length, 1, 'un seul appel OAuth pour deux SMS');
      assert.equal(m.sendCalls().length, 2);
      restore();
    });

    test('normalise un numéro sans « + » en tête', async () => {
      const m = makeHttp();
      const c = new OrangeSmsClient(m.http);
      await c.sendSms('221781112233', 'msg');
      assert.equal(m.sendCalls()[0].body.outboundSMSMessageRequest.address, 'tel:+221781112233');
      restore();
    });

    test('omet senderName s’il est vide', async () => {
      config.orangeSms.senderName = '';
      const m = makeHttp();
      const c = new OrangeSmsClient(m.http);
      await c.sendSms('+221781112233', 'msg');
      assert.equal(
        'senderName' in m.sendCalls()[0].body.outboundSMSMessageRequest,
        false,
      );
      restore();
    });

    test('lève si le client n’est pas configuré', async () => {
      config.orangeSms.senderNumber = '';
      const m = makeHttp();
      const c = new OrangeSmsClient(m.http);
      await assert.rejects(() => c.sendSms('+221781112233', 'msg'), /non configur/);
      assert.equal(m.calls.length, 0, 'aucun appel réseau si non configuré');
      restore();
    });

    test('propage l’échec de l’API d’envoi', async () => {
      const m = makeHttp();
      m.failSend();
      const c = new OrangeSmsClient(m.http);
      await assert.rejects(() => c.sendSms('+221781112233', 'msg'), /Orange/);
      restore();
    });
  });
});
