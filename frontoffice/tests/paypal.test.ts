import { config } from './helpers/setup';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PayPalClient, xofToEur, XOF_PER_EUR } from '../src/utils/paypal';

/**
 * Client PayPal (Paiements Standard). L'envoi réel n'est pas vérifiable sans
 * compte marchand ; on prouve donc la CONSTRUCTION des requêtes : conversion
 * EUR exacte (parité fixe CFA), URL de redirection _xclick, et surtout la
 * validation IPN (renvoi du message brut préfixé `cmd=_notify-validate`).
 */

function makeHttp(reply = 'VERIFIED') {
  const calls: { url: string; body: any; opts: any }[] = [];
  const http: any = {
    async post(url: string, body: any, opts: any) {
      calls.push({ url, body, opts });
      return { data: reply };
    },
  };
  return { http, calls };
}

describe('Conversion XOF → EUR (parité fixe)', () => {
  test('taux fixe 655,957', () => {
    assert.equal(XOF_PER_EUR, 655.957);
  });
  test('montants des formules', () => {
    assert.equal(xofToEur(1000), '1.52');
    assert.equal(xofToEur(1500), '2.29');
    assert.equal(xofToEur(5000), '7.62');
  });
  test('toujours 2 décimales', () => {
    assert.match(xofToEur(1000), /^\d+\.\d{2}$/);
  });
});

describe('Client PayPal', () => {
  let saved: typeof config.paypal;
  beforeEach(() => {
    saved = { ...config.paypal };
    Object.assign(config.paypal, {
      email: 'merchant@example.com',
      env: 'sandbox',
      currency: 'EUR',
    });
  });
  const restore = () => Object.assign(config.paypal, saved);

  describe('buildRedirectUrl', () => {
    test('sandbox : base www.sandbox.paypal.com + paramètres _xclick', () => {
      const c = new PayPalClient(makeHttp().http);
      const url = c.buildRedirectUrl({
        providerRef: 'TERANGA-1',
        amountEur: '2.29',
        itemName: 'Abonnement Téranga STANDARD',
        notifyUrl: 'https://api.teranga.test/api/v1/payments/webhook/paypal',
        returnUrl: 'https://app.teranga.test/abonnement?paypal=done',
        cancelUrl: 'https://app.teranga.test/abonnement?paypal=cancel',
      });
      assert.ok(url.startsWith('https://www.sandbox.paypal.com/cgi-bin/webscr?'));
      const q = new URLSearchParams(url.split('?')[1]);
      assert.equal(q.get('cmd'), '_xclick');
      assert.equal(q.get('business'), 'merchant@example.com');
      assert.equal(q.get('currency_code'), 'EUR');
      assert.equal(q.get('amount'), '2.29');
      assert.equal(q.get('custom'), 'TERANGA-1');
      assert.equal(q.get('no_shipping'), '1');
      assert.equal(q.get('notify_url'), 'https://api.teranga.test/api/v1/payments/webhook/paypal');
      assert.ok(q.get('return')!.includes('paypal=done'));
      restore();
    });

    test('live : base www.paypal.com', () => {
      config.paypal.env = 'live';
      const c = new PayPalClient(makeHttp().http);
      const url = c.buildRedirectUrl({
        providerRef: 'X', amountEur: '1.52', itemName: 'x',
        notifyUrl: 'n', returnUrl: 'r', cancelUrl: 'c',
      });
      assert.ok(url.startsWith('https://www.paypal.com/cgi-bin/webscr?'));
      restore();
    });
  });

  describe('verifyIpn', () => {
    test('renvoie le message brut préfixé cmd=_notify-validate vers ipnpb.sandbox', async () => {
      const m = makeHttp('VERIFIED');
      const c = new PayPalClient(m.http);
      const raw = 'txn_id=1AB23&payment_status=Completed&mc_gross=2.29';
      const ok = await c.verifyIpn(raw);

      assert.equal(ok, true);
      assert.equal(m.calls.length, 1);
      assert.equal(m.calls[0].url, 'https://ipnpb.sandbox.paypal.com/cgi-bin/webscr');
      assert.equal(m.calls[0].body, `cmd=_notify-validate&${raw}`);
      assert.equal(m.calls[0].opts.headers['Content-Type'], 'application/x-www-form-urlencoded');
      restore();
    });

    test('INVALID → false', async () => {
      const c = new PayPalClient(makeHttp('INVALID').http);
      assert.equal(await c.verifyIpn('a=b'), false);
      restore();
    });

    test('réponse avec espaces autour de VERIFIED est acceptée', async () => {
      const c = new PayPalClient(makeHttp('  VERIFIED\n').http);
      assert.equal(await c.verifyIpn('a=b'), true);
      restore();
    });

    test('live : validation vers ipnpb.paypal.com', async () => {
      config.paypal.env = 'live';
      const m = makeHttp('VERIFIED');
      const c = new PayPalClient(m.http);
      await c.verifyIpn('a=b');
      assert.equal(m.calls[0].url, 'https://ipnpb.paypal.com/cgi-bin/webscr');
      restore();
    });
  });
});
