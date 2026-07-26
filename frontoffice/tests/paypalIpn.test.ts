import { config, withConfig } from './helpers/setup';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, seedUser, seedPayment, readPayment, readSubscription } from './helpers/fakePrisma';
import { assertAppError, daysBetween } from './helpers/factories';
import { paymentsService } from '../src/services/payments.service';

/**
 * Traitement de l'IPN PayPal côté service. On passe par le mode dev-mock
 * (env=development) : seule la ré-interrogation réseau de PayPal est court-
 * circuitée — les contrôles métier (statut, destinataire, montant, devise) et
 * l'activation atomique s'exécutent réellement.
 */
const REF = 'TERANGA-PP-0001';

function pendingPaypal(over: Record<string, any> = {}) {
  return seedPayment({
    id: 'pp-1',
    userId: 'u-sn',
    plan: 'STANDARD',
    method: 'PAYPAL',
    status: 'PROCESSING',
    amountFcfa: 1500,
    currency: 'EUR',
    autoRenew: true,
    providerRef: REF,
    ...over,
  });
}

/** Payload IPN correct (STANDARD = 2,29 €). */
function ipn(over: Record<string, any> = {}) {
  return {
    custom: REF,
    payment_status: 'Completed',
    receiver_email: config.paypal.email,
    mc_gross: '2.29',
    mc_currency: 'EUR',
    txn_id: 'PPTX-123',
    ...over,
  };
}

async function inDev(fn: () => Promise<void>) {
  await withConfig({ env: 'development' }, fn);
}

describe('IPN PayPal — confirmation', () => {
  beforeEach(() => {
    resetDb();
    seedUser({ id: 'u-sn', country: 'SN' });
  });

  test('paiement accepté → COMPLETED + abonnement ACTIVE (3 mois)', async () => {
    await inDev(async () => {
      pendingPaypal();
      const res = await paymentsService.handlePayPalIpn(ipn(), '');
      assert.deepEqual(res, { processed: true, status: 'COMPLETED' });

      const p = readPayment('pp-1')!;
      assert.equal(p.status, 'COMPLETED');
      assert.equal(p.providerTxId, 'PPTX-123');
      assert.equal(p.webhookReceived, true);

      const sub = readSubscription('u-sn')!;
      assert.equal(sub.status, 'ACTIVE');
      assert.equal(sub.plan, 'STANDARD');
      const days = daysBetween(sub.startsAt, sub.expiresAt);
      assert.ok(days >= 89 && days <= 92, `3 mois attendus, obtenu ${days}`);
    });
  });

  test('montant incohérent → FAILED, pas d’activation', async () => {
    await inDev(async () => {
      pendingPaypal();
      const res = await paymentsService.handlePayPalIpn(ipn({ mc_gross: '5.00' }), '');
      assert.equal(res.status, 'FAILED');
      assert.equal(readSubscription('u-sn'), undefined);
      assert.match(readPayment('pp-1')!.failureReason, /incohérent/);
    });
  });

  test('devise autre que EUR → FAILED', async () => {
    await inDev(async () => {
      pendingPaypal();
      const res = await paymentsService.handlePayPalIpn(ipn({ mc_currency: 'USD' }), '');
      assert.equal(res.status, 'FAILED');
      assert.equal(readSubscription('u-sn'), undefined);
    });
  });

  test('destinataire différent de notre email marchand → FAILED', async () => {
    await inDev(async () => {
      pendingPaypal();
      const res = await paymentsService.handlePayPalIpn(ipn({ receiver_email: 'pirate@evil.com' }), '');
      assert.equal(res.status, 'FAILED');
      assert.equal(readSubscription('u-sn'), undefined);
    });
  });

  test('statut non « Completed » → FAILED', async () => {
    await inDev(async () => {
      pendingPaypal();
      const res = await paymentsService.handlePayPalIpn(ipn({ payment_status: 'Pending' }), '');
      assert.equal(res.status, 'FAILED');
      assert.equal(readSubscription('u-sn'), undefined);
    });
  });

  test('email marchand insensible à la casse', async () => {
    await inDev(async () => {
      pendingPaypal();
      const res = await paymentsService.handlePayPalIpn(
        ipn({ receiver_email: config.paypal.email.toUpperCase() }),
        '',
      );
      assert.equal(res.status, 'COMPLETED');
    });
  });

  test('IPN rejouée n’active pas deux fois (échéance identique)', async () => {
    await inDev(async () => {
      pendingPaypal();
      await paymentsService.handlePayPalIpn(ipn(), '');
      const first = readSubscription('u-sn')!.expiresAt.getTime();

      const res2 = await paymentsService.handlePayPalIpn(ipn(), '');
      assert.deepEqual(res2, { alreadyProcessed: true, status: 'COMPLETED' });
      assert.equal(readSubscription('u-sn')!.expiresAt.getTime(), first);
    });
  });

  test('référence inconnue → 404', async () => {
    await inDev(async () => {
      await assertAppError(
        () => paymentsService.handlePayPalIpn(ipn({ custom: 'TERANGA-INCONNU' }), ''),
        404,
      );
    });
  });

  test('sans référence (custom) → 400', async () => {
    await inDev(async () => {
      await assertAppError(() => paymentsService.handlePayPalIpn({ payment_status: 'Completed' }, ''), 400);
    });
  });
});
