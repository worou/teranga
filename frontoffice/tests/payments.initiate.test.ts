import './helpers/setup';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { config, withConfig } from './helpers/setup';
import { cinetpay } from './helpers/cinetpayMock';
import { resetDb, seedUser, allPayments, readPayment } from './helpers/fakePrisma';
import { assertAppError } from './helpers/factories';
import { paymentsService } from '../src/services/payments.service';

describe('Paiement mobile — catalogue et moyens de paiement', () => {
  beforeEach(() => {
    resetDb();
    cinetpay.reset();
  });

  test('le catalogue expose les 3 formules en F CFA', () => {
    const catalog = paymentsService.getCatalog();
    assert.deepEqual(catalog.DISCOVERY, { amount: 1000, months: 1, currency: 'XOF' });
    assert.equal(catalog.STANDARD.amount, 1500);
    assert.equal(catalog.STANDARD.months, 3);
    assert.equal(catalog.ENGAGEMENT.amount, 5000);
    assert.equal(catalog.ENGAGEMENT.months, 6);
    for (const plan of Object.values(catalog)) {
      assert.equal(plan.currency, 'XOF');
    }
  });

  test('le tarif mensuel affiché correspond au montant divisé par la durée', () => {
    const { STANDARD, ENGAGEMENT } = config.pricing;
    // monthlyDisplay est un arrondi (le total n'est pas toujours divisible).
    assert.equal(STANDARD.monthlyDisplay, Math.round(STANDARD.amount / STANDARD.months));
    assert.equal(ENGAGEMENT.monthlyDisplay, Math.round(ENGAGEMENT.amount / ENGAGEMENT.months));
  });

  test('les moyens de paiement suivent le pays de l’utilisateur', async () => {
    seedUser({ id: 'u-sn', country: 'SN' });
    const res = await paymentsService.getMethodsForUser('u-sn');
    assert.equal(res.country, 'SN');
    assert.equal(res.supported, true);
    assert.deepEqual(
      res.methods.map((m) => m.method),
      ['ORANGE_MONEY', 'WAVE', 'FREE_MONEY', 'WIZALL', 'CARD', 'PAYPAL'],
    );
    assert.equal(res.methods.find((m) => m.method === 'CARD')!.isMobileMoney, false);
    assert.equal(res.methods.find((m) => m.method === 'PAYPAL')!.isMobileMoney, false);
    // Le client s'appuie sur dialingCode pour pré-remplir/valider le numéro.
    assert.equal(res.dialingCode, '+221');
  });

  test('l’indicatif accompagne les moyens de chaque pays desservi', async () => {
    seedUser({ id: 'u-bj', country: 'BJ' });
    const res = await paymentsService.getMethodsForUser('u-bj');
    assert.equal(res.dialingCode, '+229');
  });

  test('un utilisateur hors zone F CFA ne se voit proposer aucun moyen', async () => {
    seedUser({ id: 'u-fr', country: 'FR' });
    const res = await paymentsService.getMethodsForUser('u-fr');
    assert.equal(res.supported, false);
    assert.deepEqual(res.methods, []);
    assert.equal(res.dialingCode, null);
  });

  test('utilisateur inconnu → 404', async () => {
    await assertAppError(() => paymentsService.getMethodsForUser('u-fantome'), 404);
  });
});

describe('Paiement mobile — initiation (POST /payments/subscribe)', () => {
  beforeEach(() => {
    resetDb();
    cinetpay.reset();
    seedUser({ id: 'u-sn', country: 'SN', email: 'awa@teranga.sn', firstName: 'Awa', lastName: 'Diop' });
  });

  test('Orange Money au Sénégal : crée le paiement et renvoie l’instruction USSD', async () => {
    const res = await paymentsService.initiate('u-sn', 'STANDARD', 'ORANGE_MONEY', '+221771234567');

    assert.ok(res.paymentId, 'un identifiant de paiement doit être renvoyé');
    assert.ok(res.ussdInstruction?.includes('+221771234567'));
    assert.ok(res.ussdInstruction?.includes('Orange Money'));
    assert.ok(res.paymentUrl);

    const payment = readPayment(res.paymentId)!;
    assert.equal(payment.userId, 'u-sn');
    assert.equal(payment.plan, 'STANDARD');
    assert.equal(payment.method, 'ORANGE_MONEY');
    assert.equal(payment.amountFcfa, 1500);
    assert.equal(payment.currency, 'XOF');
    assert.equal(payment.phoneNumber, '+221771234567');
    assert.equal(payment.autoRenew, true, 'autoRenew est activé par défaut');
    assert.equal(payment.status, 'PROCESSING', 'le paiement passe en PROCESSING après appel CinetPay');
    assert.equal(payment.cinetpayTxId, 'CP-TEST-TOKEN');
    assert.match(payment.providerRef, /^TERANGA-\d+-[0-9a-f]{8}$/);
  });

  test('la validité de la demande expire au bout de 15 minutes', async () => {
    const before = Date.now();
    const res = await paymentsService.initiate('u-sn', 'DISCOVERY', 'WAVE', '+221771234567');
    const delta = res.expiresAt.getTime() - before;
    assert.ok(delta > 14 * 60_000 && delta <= 15 * 60_000 + 1000, `délai inattendu : ${delta} ms`);
  });

  test('la requête envoyée à CinetPay porte le bon canal, montant et devise', async () => {
    await paymentsService.initiate('u-sn', 'ENGAGEMENT', 'WAVE', '+221771234567');

    assert.equal(cinetpay.countCalls('/v2/payment'), 1, 'CinetPay doit être appelé une seule fois');
    const body = cinetpay.lastCall('/v2/payment')!.body;
    assert.equal(body.channels, 'WALLET', 'Wave passe par le canal WALLET');
    assert.equal(body.amount, 5000);
    assert.equal(body.currency, 'XOF');
    assert.equal(body.customer_phone_number, '+221771234567');
    assert.equal(body.customer_email, 'awa@teranga.sn');
    assert.equal(body.customer_name, 'Awa');
    assert.equal(body.customer_surname, 'Diop');
    assert.equal(body.apikey, config.cinetpay.apiKey);
    assert.equal(body.site_id, config.cinetpay.siteId);
    assert.equal(body.notify_url, config.cinetpay.notifyUrl);
    assert.equal(body.return_url, config.cinetpay.returnUrl);
    assert.ok(String(body.description).includes('ENGAGEMENT'));
    assert.ok(String(body.description).includes('6 mois'));
  });

  test('carte bancaire : URL de paiement hébergée, sans instruction USSD', async () => {
    const res = await paymentsService.initiate('u-sn', 'DISCOVERY', 'CARD', '+33612345678');
    assert.equal(res.ussdInstruction, undefined);
    assert.equal(res.paymentUrl, 'https://checkout.cinetpay.com/payment/TEST-TOKEN');
    assert.equal(cinetpay.lastCall('/v2/payment')!.body.channels, 'CREDIT_CARD');
  });

  test('autoRenew peut être désactivé dès la souscription', async () => {
    const res = await paymentsService.initiate('u-sn', 'STANDARD', 'WAVE', '+221771234567', false);
    assert.equal(readPayment(res.paymentId)!.autoRenew, false);
  });

  describe('contrôles avant appel au provider', () => {
    test('utilisateur inconnu → 404, aucun paiement créé', async () => {
      await assertAppError(
        () => paymentsService.initiate('u-fantome', 'STANDARD', 'WAVE', '+221771234567'),
        404,
      );
      assert.equal(allPayments().length, 0);
    });

    test('plan inexistant → 400 « Plan invalide »', async () => {
      await assertAppError(
        () => paymentsService.initiate('u-sn', 'PREMIUM' as any, 'WAVE', '+221771234567'),
        400,
        'Plan invalide',
      );
      assert.equal(allPayments().length, 0);
    });

    test('utilisateur hors zone F CFA → 400, aucun paiement créé', async () => {
      seedUser({ id: 'u-fr', country: 'FR' });
      await assertAppError(
        () => paymentsService.initiate('u-fr', 'STANDARD', 'CARD', '+33612345678'),
        400,
        'zone F CFA',
      );
      assert.equal(allPayments().length, 0);
      assert.equal(cinetpay.calls.length, 0, 'aucun appel au provider ne doit partir');
    });

    test('opérateur absent du pays → 400 explicite', async () => {
      await assertAppError(
        () => paymentsService.initiate('u-sn', 'STANDARD', 'MTN_MOMO', '+221771234567'),
        400,
        "MTN MoMo n'est pas disponible",
      );
      assert.equal(allPayments().length, 0);
    });

    test('numéro d’un autre pays → 400 (indicatif incohérent)', async () => {
      await assertAppError(
        () => paymentsService.initiate('u-sn', 'STANDARD', 'ORANGE_MONEY', '+2250700000000'),
        400,
        'indicatif',
      );
      assert.equal(allPayments().length, 0);
    });

    test('carte bancaire : un numéro étranger reste accepté (diaspora)', async () => {
      const res = await paymentsService.initiate('u-sn', 'STANDARD', 'CARD', '+33612345678');
      assert.ok(res.paymentId);
    });
  });

  describe('échec côté provider', () => {
    test('erreur réseau → paiement marqué FAILED et 400 renvoyé', async () => {
      cinetpay.initNetworkError = 'ECONNRESET';
      await assertAppError(
        () => paymentsService.initiate('u-sn', 'STANDARD', 'WAVE', '+221771234567'),
        400,
        "Impossible d'initier le paiement",
      );

      const payments = allPayments();
      assert.equal(payments.length, 1, 'la trace du paiement échoué est conservée');
      assert.equal(payments[0].status, 'FAILED');
      assert.equal(payments[0].failureReason, 'ECONNRESET');
      assert.equal(payments[0].completedAt, null);
    });

    test('code de retour CinetPay ≠ 201 → paiement FAILED', async () => {
      cinetpay.init.code = '609';
      cinetpay.init.message = 'AUTH_NOT_FOUND';
      await assertAppError(
        () => paymentsService.initiate('u-sn', 'STANDARD', 'WAVE', '+221771234567'),
        400,
      );
      const payment = allPayments()[0];
      assert.equal(payment.status, 'FAILED');
      assert.ok(String(payment.failureReason).includes('AUTH_NOT_FOUND'));
    });
  });

  test('mode développement sans clés : initiation simulée, aucun appel réseau', async () => {
    await withConfig({ env: 'development', cinetpay: { apiKey: '' } }, async () => {
      const res = await paymentsService.initiate('u-sn', 'DISCOVERY', 'ORANGE_MONEY', '+221771234567');
      assert.equal(cinetpay.calls.length, 0, 'la branche mock ne doit pas appeler axios');
      assert.ok(res.paymentUrl?.includes('/payments/webhook/cinetpay/mock?ref='));
      assert.equal(readPayment(res.paymentId)!.status, 'PROCESSING');
    });
  });

  test('l’historique ne renvoie que les paiements de l’utilisateur, du plus récent au plus ancien', async () => {
    seedUser({ id: 'u-autre', country: 'SN' });
    const p1 = await paymentsService.initiate('u-sn', 'DISCOVERY', 'WAVE', '+221771234567');
    const p2 = await paymentsService.initiate('u-sn', 'STANDARD', 'WAVE', '+221771234567');
    await paymentsService.initiate('u-autre', 'ENGAGEMENT', 'WAVE', '+221771234567');

    const history = await paymentsService.listForUser('u-sn');
    assert.equal(history.length, 2);
    assert.deepEqual(
      history.map((p: any) => p.id),
      [p2.paymentId, p1.paymentId],
      'ordre antéchronologique attendu',
    );
    assert.ok(history.every((p: any) => p.userId === 'u-sn'));
  });
});
