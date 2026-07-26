import './helpers/setup';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { withConfig } from './helpers/setup';
import { cinetpay, flushMicrotasks } from './helpers/cinetpayMock';
import {
  resetDb,
  seedUser,
  seedPayment,
  seedSubscription,
  readPayment,
  readSubscription,
} from './helpers/fakePrisma';
import { assertAppError, webhookPayload, signToken, daysBetween, daysFrom } from './helpers/factories';
import { paymentsService } from '../src/services/payments.service';

const REF = 'TERANGA-TEST-0001';

/** Paiement en attente de confirmation, tel qu'après `initiate()`. */
function pendingPayment(over: Record<string, any> = {}) {
  return seedPayment({
    id: 'pay-1',
    userId: 'u-sn',
    plan: 'STANDARD',
    method: 'ORANGE_MONEY',
    status: 'PROCESSING',
    amountFcfa: 1500,
    currency: 'XOF',
    autoRenew: true,
    phoneNumber: '+221771234567',
    providerRef: REF,
    ...over,
  });
}

/** Notification signée correspondant au paiement ci-dessus. */
function signedNotification(over: Record<string, any> = {}) {
  const payload = webhookPayload({ cpm_trans_id: REF, ...over });
  return { payload, token: signToken(payload) };
}

describe('Webhook CinetPay — confirmation de paiement', () => {
  beforeEach(() => {
    resetDb();
    cinetpay.reset();
    seedUser({ id: 'u-sn', country: 'SN' });
  });

  describe('cas nominal', () => {
    test('paiement accepté → paiement COMPLETED et abonnement ACTIVE', async () => {
      pendingPayment();
      cinetpay.check = { status: 'ACCEPTED', amount: 1500, currency: 'XOF' };
      const { payload, token } = signedNotification();

      const res = await paymentsService.handleWebhook(payload, token);
      assert.deepEqual(res, { processed: true, status: 'COMPLETED' });

      const payment = readPayment('pay-1')!;
      assert.equal(payment.status, 'COMPLETED');
      assert.ok(payment.completedAt instanceof Date);
      assert.equal(payment.webhookReceived, true);
      assert.equal(payment.webhookPayload.cpm_trans_id, REF, 'le payload reçu est tracé');
      assert.equal(payment.failureReason, null);

      const sub = readSubscription('u-sn')!;
      assert.equal(sub.plan, 'STANDARD');
      assert.equal(sub.status, 'ACTIVE');
      assert.equal(sub.autoRenew, true);
      assert.ok(sub.startsAt instanceof Date);
      const months = daysBetween(sub.startsAt, sub.expiresAt);
      assert.ok(months >= 89 && months <= 92, `3 mois attendus, obtenu ${months} jours`);

      assert.equal(payment.subscriptionId, sub.id, 'le paiement est rattaché à l’abonnement');
    });

    test('un paiement encore PENDING est également confirmable', async () => {
      pendingPayment({ status: 'PENDING' });
      cinetpay.check = { status: 'ACCEPTED', amount: 1500, currency: 'XOF' };
      const { payload, token } = signedNotification();

      await paymentsService.handleWebhook(payload, token);
      assert.equal(readPayment('pay-1')!.status, 'COMPLETED');
      assert.equal(readSubscription('u-sn')!.status, 'ACTIVE');
    });

    test('le montant du payload sert de repli si CinetPay ne le renvoie pas', async () => {
      pendingPayment();
      cinetpay.check = { status: 'ACCEPTED', amount: undefined, currency: undefined };
      const { payload, token } = signedNotification({ cpm_amount: '1500' });

      const res = await paymentsService.handleWebhook(payload, token);
      assert.equal(res.status, 'COMPLETED');
    });

    test('la notification peut porter `transaction_id` au lieu de `cpm_trans_id`', async () => {
      pendingPayment();
      cinetpay.check = { status: 'ACCEPTED', amount: 1500, currency: 'XOF' };
      const payload: Record<string, any> = webhookPayload({ cpm_trans_id: undefined });
      payload.transaction_id = REF;

      const res = await paymentsService.handleWebhook(payload, signToken(payload));
      assert.equal(res.status, 'COMPLETED');
    });

    test('chaque plan crédite la bonne durée', async () => {
      const cases: Array<[string, number, number, number]> = [
        ['DISCOVERY', 1000, 28, 31],
        ['STANDARD', 1500, 89, 92],
        ['ENGAGEMENT', 5000, 180, 184],
      ];
      for (const [plan, amount, minDays, maxDays] of cases) {
        resetDb();
        cinetpay.reset();
        seedUser({ id: 'u-sn', country: 'SN' });
        pendingPayment({ plan, amountFcfa: amount });
        cinetpay.check = { status: 'ACCEPTED', amount, currency: 'XOF' };
        const { payload, token } = signedNotification({ cpm_amount: String(amount) });

        await paymentsService.handleWebhook(payload, token);
        const sub = readSubscription('u-sn')!;
        const days = daysBetween(sub.startsAt, sub.expiresAt);
        assert.equal(sub.plan, plan);
        assert.ok(days >= minDays && days <= maxDays, `${plan} : ${days} jours crédités`);
      }
    });
  });

  describe('sécurité — la notification n’est jamais crue sur parole', () => {
    test('signature HMAC invalide → 401, paiement intact', async () => {
      pendingPayment();
      cinetpay.check = { status: 'ACCEPTED', amount: 1500, currency: 'XOF' };
      const { payload } = signedNotification();

      await assertAppError(
        () => paymentsService.handleWebhook(payload, 'jeton-falsifie'),
        401,
        'Signature',
      );

      const payment = readPayment('pay-1')!;
      assert.equal(payment.status, 'PROCESSING', 'aucune transition sur signature invalide');
      assert.equal(payment.webhookReceived, false);
      assert.equal(readSubscription('u-sn'), undefined, 'aucun abonnement activé');
    });

    test('jeton absent → 401', async () => {
      pendingPayment();
      const { payload } = signedNotification();
      await assertAppError(() => paymentsService.handleWebhook(payload, undefined), 401);
      assert.equal(readSubscription('u-sn'), undefined);
    });

    test('payload rejoué après altération du montant → 401', async () => {
      pendingPayment();
      const { payload, token } = signedNotification();
      const falsifie = { ...payload, cpm_amount: '100' };
      await assertAppError(() => paymentsService.handleWebhook(falsifie, token), 401);
    });

    test('signature valide mais montant réel inférieur au plan → FAILED, pas d’activation', async () => {
      pendingPayment();
      // CinetPay (source de vérité) annonce 1 000 F alors que STANDARD vaut 21 000 F.
      cinetpay.check = { status: 'ACCEPTED', amount: 1000, currency: 'XOF' };
      const { payload, token } = signedNotification();

      const res = await paymentsService.handleWebhook(payload, token);
      assert.equal(res.status, 'FAILED');

      const payment = readPayment('pay-1')!;
      assert.equal(payment.status, 'FAILED');
      assert.equal(payment.failureReason, 'Montant ou devise du paiement incohérent');
      assert.equal(payment.completedAt, null);
      assert.equal(readSubscription('u-sn'), undefined, 'aucun abonnement ne doit être ouvert');
    });

    test('devise autre que le F CFA → FAILED', async () => {
      pendingPayment();
      cinetpay.check = { status: 'ACCEPTED', amount: 1500, currency: 'EUR' };
      const { payload, token } = signedNotification({ cpm_currency: 'EUR' });

      const res = await paymentsService.handleWebhook(payload, token);
      assert.equal(res.status, 'FAILED');
      assert.equal(readPayment('pay-1')!.failureReason, 'Montant ou devise du paiement incohérent');
      assert.equal(readSubscription('u-sn'), undefined);
    });

    test('CinetPay dément la notification (REFUSED) → FAILED', async () => {
      pendingPayment();
      // Le corps prétend « SUCCES » mais l'API de vérification fait foi.
      cinetpay.check = { status: 'REFUSED', amount: 1500, currency: 'XOF' };
      const { payload, token } = signedNotification();

      const res = await paymentsService.handleWebhook(payload, token);
      assert.equal(res.status, 'FAILED');
      assert.equal(readPayment('pay-1')!.failureReason, "Paiement refusé par l'opérateur");
      assert.equal(readSubscription('u-sn'), undefined);
    });

    test('la trace de la notification est conservée même en cas de refus', async () => {
      pendingPayment();
      cinetpay.check = { status: 'REFUSED' };
      const { payload, token } = signedNotification();
      await paymentsService.handleWebhook(payload, token);
      assert.equal(readPayment('pay-1')!.webhookReceived, true);
    });
  });

  describe('notifications malformées ou inconnues', () => {
    test('sans identifiant de transaction → 400', async () => {
      await assertAppError(() => paymentsService.handleWebhook({}, 'x'), 400, 'sans identifiant');
    });

    test('référence inconnue → 404', async () => {
      const { payload, token } = signedNotification({ cpm_trans_id: 'TERANGA-INCONNU' });
      await assertAppError(() => paymentsService.handleWebhook(payload, token), 404, 'introuvable');
    });
  });

  describe('idempotence', () => {
    test('rejouer la même notification n’étend pas l’abonnement une seconde fois', async () => {
      pendingPayment();
      cinetpay.check = { status: 'ACCEPTED', amount: 1500, currency: 'XOF' };
      const { payload, token } = signedNotification();

      await paymentsService.handleWebhook(payload, token);
      const apres1 = readSubscription('u-sn')!;
      const expiration1 = apres1.expiresAt.getTime();

      const res2 = await paymentsService.handleWebhook(payload, token);
      assert.deepEqual(res2, { alreadyProcessed: true, status: 'COMPLETED' });

      const apres2 = readSubscription('u-sn')!;
      assert.equal(
        apres2.expiresAt.getTime(),
        expiration1,
        'la date d’expiration doit être strictement identique après rejeu',
      );
      assert.equal(apres2.id, apres1.id, 'aucun second abonnement créé');
    });

    test('un paiement déjà COMPLETED court-circuite tout appel au provider', async () => {
      pendingPayment({ status: 'COMPLETED', webhookReceived: true });
      const { payload, token } = signedNotification();

      const res = await paymentsService.handleWebhook(payload, token);
      assert.deepEqual(res, { alreadyProcessed: true, status: 'COMPLETED' });
      assert.equal(cinetpay.calls.length, 0, 'aucune vérification distante inutile');
    });

    test('un paiement déjà FAILED n’est pas ressuscité par une notification tardive', async () => {
      pendingPayment({ status: 'FAILED', failureReason: 'Refusé' });
      cinetpay.check = { status: 'ACCEPTED', amount: 1500, currency: 'XOF' };
      const { payload, token } = signedNotification();

      const res = await paymentsService.handleWebhook(payload, token);
      assert.deepEqual(res, { alreadyProcessed: true, status: 'FAILED' });
      assert.equal(readSubscription('u-sn'), undefined);
    });

    test('course webhook / sondage : une seule période créditée', async () => {
      // Scénario réel : l'utilisateur rafraîchit l'écran (sondage) pendant que
      // le webhook arrive. Le sondage lit le paiement en PROCESSING, puis le
      // webhook le termine et active l'abonnement AVANT que le sondage ne
      // reprenne la main. Sans la transition atomique
      // PENDING|PROCESSING → COMPLETED de `completePayment`, le sondage
      // rallongerait l'abonnement une seconde fois (6 mois payés 3).
      pendingPayment();
      cinetpay.check = { status: 'ACCEPTED', amount: 1500, currency: 'XOF' };
      const { payload, token } = signedNotification();

      const barriere = cinetpay.gateNextCheck();
      const sondage = paymentsService.checkStatus('u-sn', 'pay-1');
      await flushMicrotasks(); // le sondage a lu PROCESSING et attend CinetPay

      await paymentsService.handleWebhook(payload, token);
      const apresWebhook = readSubscription('u-sn')!;
      assert.equal(apresWebhook.status, 'ACTIVE');

      barriere.release(); // le sondage reprend avec un statut ACCEPTED
      await sondage;

      const sub = readSubscription('u-sn')!;
      assert.equal(
        sub.expiresAt.getTime(),
        apresWebhook.expiresAt.getTime(),
        'le sondage retardataire ne doit pas re-créditer l’abonnement',
      );
      const days = daysBetween(sub.startsAt, sub.expiresAt);
      assert.ok(days >= 89 && days <= 92, `une seule période attendue, obtenu ${days} jours`);
      assert.equal(readPayment('pay-1')!.status, 'COMPLETED');
    });

    test('course inverse : le sondage gagne, le webhook tardif ne recrédite pas', async () => {
      pendingPayment();
      cinetpay.check = { status: 'ACCEPTED', amount: 1500, currency: 'XOF' };
      const { payload, token } = signedNotification();

      await paymentsService.checkStatus('u-sn', 'pay-1');
      const apresSondage = readSubscription('u-sn')!;

      const res = await paymentsService.handleWebhook(payload, token);
      assert.deepEqual(res, { alreadyProcessed: true, status: 'COMPLETED' });
      assert.equal(
        readSubscription('u-sn')!.expiresAt.getTime(),
        apresSondage.expiresAt.getTime(),
      );
    });
  });

  describe('renouvellement et changement de formule', () => {
    test('abonnement encore actif : la nouvelle période s’ajoute à l’échéance', async () => {
      const now = new Date();
      const echeance = daysFrom(now, 10);
      seedSubscription({
        id: 'sub-1',
        userId: 'u-sn',
        plan: 'STANDARD',
        status: 'ACTIVE',
        startsAt: daysFrom(now, -80),
        expiresAt: echeance,
        autoRenew: true,
      });
      pendingPayment();
      cinetpay.check = { status: 'ACCEPTED', amount: 1500, currency: 'XOF' };
      const { payload, token } = signedNotification();

      await paymentsService.handleWebhook(payload, token);

      const sub = readSubscription('u-sn')!;
      const ajout = daysBetween(echeance, sub.expiresAt);
      assert.ok(sub.expiresAt > echeance, 'la nouvelle échéance doit être postérieure');
      assert.ok(ajout >= 89 && ajout <= 92, `3 mois ajoutés attendus, obtenu ${ajout} jours`);
      assert.equal(
        sub.startsAt.getTime(),
        daysFrom(now, -80).getTime(),
        'la date de début du cycle en cours est préservée',
      );
    });

    test('abonnement expiré : la période repart de maintenant', async () => {
      const now = new Date();
      seedSubscription({
        id: 'sub-1',
        userId: 'u-sn',
        plan: 'DISCOVERY',
        status: 'EXPIRED',
        startsAt: daysFrom(now, -60),
        expiresAt: daysFrom(now, -30),
        autoRenew: true,
      });
      pendingPayment();
      cinetpay.check = { status: 'ACCEPTED', amount: 1500, currency: 'XOF' };
      const { payload, token } = signedNotification();

      await paymentsService.handleWebhook(payload, token);

      const sub = readSubscription('u-sn')!;
      assert.equal(sub.status, 'ACTIVE');
      assert.ok(sub.expiresAt > now, 'la nouvelle échéance doit être dans le futur');
      assert.ok(daysBetween(now, sub.startsAt) < 1, 'le cycle redémarre à la date du paiement');
      const days = daysBetween(now, sub.expiresAt);
      assert.ok(days >= 89 && days <= 92, `3 mois attendus, obtenu ${days} jours`);
    });

    test('montée en gamme : le plan de l’abonnement suit le paiement', async () => {
      const now = new Date();
      seedSubscription({
        id: 'sub-1',
        userId: 'u-sn',
        plan: 'DISCOVERY',
        status: 'ACTIVE',
        startsAt: daysFrom(now, -5),
        expiresAt: daysFrom(now, 25),
        autoRenew: true,
      });
      pendingPayment({ plan: 'ENGAGEMENT', amountFcfa: 5000 });
      cinetpay.check = { status: 'ACCEPTED', amount: 5000, currency: 'XOF' };
      const { payload, token } = signedNotification({ cpm_amount: '5000' });

      await paymentsService.handleWebhook(payload, token);

      const sub = readSubscription('u-sn')!;
      assert.equal(sub.plan, 'ENGAGEMENT');
      const ajout = daysBetween(daysFrom(now, 25), sub.expiresAt);
      assert.ok(ajout >= 180 && ajout <= 184, `6 mois ajoutés attendus, obtenu ${ajout}`);
    });

    test('une résiliation antérieure est annulée par un nouveau paiement', async () => {
      const now = new Date();
      seedSubscription({
        id: 'sub-1',
        userId: 'u-sn',
        plan: 'STANDARD',
        status: 'ACTIVE',
        startsAt: daysFrom(now, -80),
        expiresAt: daysFrom(now, 10),
        autoRenew: false,
        cancelledAt: daysFrom(now, -2),
        lastReminderAt: daysFrom(now, -1),
      });
      pendingPayment({ autoRenew: true });
      cinetpay.check = { status: 'ACCEPTED', amount: 1500, currency: 'XOF' };
      const { payload, token } = signedNotification();

      await paymentsService.handleWebhook(payload, token);

      const sub = readSubscription('u-sn')!;
      assert.equal(sub.cancelledAt, null, 'la résiliation est levée');
      assert.equal(sub.lastReminderAt, null, 'le cycle de rappel est réinitialisé');
      assert.equal(sub.autoRenew, true, 'le choix fait au paiement fait foi');
    });

    test('le choix autoRenew=false du paiement est reporté sur l’abonnement', async () => {
      pendingPayment({ autoRenew: false });
      cinetpay.check = { status: 'ACCEPTED', amount: 1500, currency: 'XOF' };
      const { payload, token } = signedNotification();

      await paymentsService.handleWebhook(payload, token);
      assert.equal(readSubscription('u-sn')!.autoRenew, false);
    });
  });

  describe('mode développement (sans clés CinetPay)', () => {
    test('le corps de la notification fait foi : cpm_result=00 → activation', async () => {
      await withConfig({ env: 'development', cinetpay: { apiKey: '', secretKey: '' } }, async () => {
        pendingPayment();
        const payload = webhookPayload({ cpm_trans_id: REF, cpm_result: '00' });

        const res = await paymentsService.handleWebhook(payload, undefined);
        assert.equal(res.status, 'COMPLETED');
        assert.equal(cinetpay.calls.length, 0, 'aucun appel réseau en mode mock');
        assert.equal(readSubscription('u-sn')!.status, 'ACTIVE');
      });
    });

    test('cpm_result en échec → paiement FAILED avec le motif du provider', async () => {
      await withConfig({ env: 'development', cinetpay: { apiKey: '', secretKey: '' } }, async () => {
        pendingPayment();
        const payload = webhookPayload({
          cpm_trans_id: REF,
          cpm_result: '627',
          cpm_error_message: 'INSUFFICIENT_BALANCE',
        });

        const res = await paymentsService.handleWebhook(payload, undefined);
        assert.equal(res.status, 'FAILED');
        assert.equal(readPayment('pay-1')!.failureReason, 'INSUFFICIENT_BALANCE');
        assert.equal(readSubscription('u-sn'), undefined);
      });
    });
  });
});
