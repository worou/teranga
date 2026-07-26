import './helpers/setup';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cinetpay } from './helpers/cinetpayMock';
import { resetDb, seedUser, seedPayment, readPayment, readSubscription } from './helpers/fakePrisma';
import { assertAppError, daysBetween } from './helpers/factories';
import { paymentsService } from '../src/services/payments.service';

/**
 * Repli par sondage (`GET /payments/:id/status`) : utilisé quand le webhook
 * CinetPay n'arrive pas — cas fréquent en mobile money (réseau instable).
 */
describe('Paiement mobile — vérification de statut par sondage', () => {
  beforeEach(() => {
    resetDb();
    cinetpay.reset();
    seedUser({ id: 'u-sn', country: 'SN' });
    seedPayment({
      id: 'pay-1',
      userId: 'u-sn',
      plan: 'STANDARD',
      method: 'WAVE',
      status: 'PROCESSING',
      amountFcfa: 1500,
      currency: 'XOF',
      autoRenew: true,
      providerRef: 'TERANGA-TEST-0001',
    });
  });

  test('paiement d’un autre utilisateur → 404 (cloisonnement)', async () => {
    seedUser({ id: 'u-autre', country: 'SN' });
    await assertAppError(() => paymentsService.checkStatus('u-autre', 'pay-1'), 404);
  });

  test('paiement inexistant → 404', async () => {
    await assertAppError(() => paymentsService.checkStatus('u-sn', 'pay-inconnu'), 404);
  });

  test('CinetPay confirme : paiement COMPLETED et abonnement activé', async () => {
    cinetpay.check = { status: 'ACCEPTED', amount: 1500, currency: 'XOF' };

    const res = await paymentsService.checkStatus('u-sn', 'pay-1');
    assert.equal(res!.status, 'COMPLETED');
    assert.equal(cinetpay.countCalls('/v2/payment/check'), 1);

    const sub = readSubscription('u-sn')!;
    assert.equal(sub.status, 'ACTIVE');
    assert.equal(sub.plan, 'STANDARD');
    const days = daysBetween(sub.startsAt, sub.expiresAt);
    assert.ok(days >= 89 && days <= 92, `3 mois attendus, obtenu ${days}`);
    assert.equal(readPayment('pay-1')!.subscriptionId, sub.id);
  });

  test('montant encaissé incohérent → FAILED, aucun abonnement', async () => {
    cinetpay.check = { status: 'ACCEPTED', amount: 500, currency: 'XOF' };

    const res = await paymentsService.checkStatus('u-sn', 'pay-1');
    assert.equal(res!.status, 'FAILED');
    assert.equal(res!.failureReason, 'Montant du paiement incohérent');
    assert.equal(readSubscription('u-sn'), undefined);
  });

  test('paiement refusé par l’opérateur → FAILED', async () => {
    cinetpay.check = { status: 'REFUSED' };

    const res = await paymentsService.checkStatus('u-sn', 'pay-1');
    assert.equal(res!.status, 'FAILED');
    assert.equal(res!.failureReason, "Refusé par l'opérateur");
    assert.equal(readSubscription('u-sn'), undefined);
  });

  test('statut encore PENDING chez CinetPay → paiement inchangé', async () => {
    cinetpay.check = { status: 'PENDING' };

    const res = await paymentsService.checkStatus('u-sn', 'pay-1');
    assert.equal(res!.status, 'PROCESSING', 'on attend toujours la validation de l’abonné');
    assert.equal(readSubscription('u-sn'), undefined);
  });

  test('CinetPay injoignable → aucune régression du paiement, aucune exception', async () => {
    cinetpay.checkNetworkError = 'ETIMEDOUT';

    const res = await paymentsService.checkStatus('u-sn', 'pay-1');
    assert.equal(res!.status, 'PROCESSING', 'une panne réseau ne doit pas faire échouer le paiement');
    assert.equal(res!.failureReason, null);
  });

  test('un paiement déjà COMPLETED n’est pas re-vérifié', async () => {
    seedPayment({
      id: 'pay-2',
      userId: 'u-sn',
      plan: 'DISCOVERY',
      method: 'WAVE',
      status: 'COMPLETED',
      amountFcfa: 1000,
      providerRef: 'TERANGA-TEST-0002',
    });

    const res = await paymentsService.checkStatus('u-sn', 'pay-2');
    assert.equal(res!.status, 'COMPLETED');
    assert.equal(cinetpay.calls.length, 0, 'aucun appel CinetPay pour un paiement terminal');
  });

  test('un paiement FAILED reste FAILED', async () => {
    seedPayment({
      id: 'pay-3',
      userId: 'u-sn',
      plan: 'DISCOVERY',
      method: 'WAVE',
      status: 'FAILED',
      amountFcfa: 1000,
      failureReason: 'Solde insuffisant',
      providerRef: 'TERANGA-TEST-0003',
    });

    const res = await paymentsService.checkStatus('u-sn', 'pay-3');
    assert.equal(res!.status, 'FAILED');
    assert.equal(cinetpay.calls.length, 0);
  });

  test('deux sondages successifs ne créditent qu’une seule période', async () => {
    cinetpay.check = { status: 'ACCEPTED', amount: 1500, currency: 'XOF' };

    await paymentsService.checkStatus('u-sn', 'pay-1');
    const expiration1 = readSubscription('u-sn')!.expiresAt.getTime();

    await paymentsService.checkStatus('u-sn', 'pay-1');
    assert.equal(
      readSubscription('u-sn')!.expiresAt.getTime(),
      expiration1,
      'le second sondage ne doit pas prolonger l’abonnement',
    );
  });
});
