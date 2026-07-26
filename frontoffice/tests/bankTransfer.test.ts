import './helpers/setup';
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { config } from './helpers/setup';
import { cinetpay } from './helpers/cinetpayMock';
import { resetDb, seedUser, readPayment, readSubscription } from './helpers/fakePrisma';
import { assertAppError } from './helpers/factories';
import { paymentsService } from '../src/services/payments.service';
import { subscribeSchema } from '../src/validators';

/**
 * Virement bancaire (SEPA / EUR) — moyen hors CinetPay, validé manuellement par
 * un admin. On vérifie : la disponibilité conditionnée à l'IBAN configuré,
 * l'initiation (PENDING, EUR, coordonnées + référence, aucun appel provider),
 * puis la validation/rejet admin qui (dé)clenche l'activation d'abonnement.
 */

const RIB = {
  beneficiary: 'MR TEST',
  iban: 'FR7620041000010000000000000',
  bic: 'BANKFRPPXXX',
  bankName: 'Banque de Test',
};

describe('Virement bancaire', () => {
  let savedBank: typeof config.bankTransfer;

  beforeEach(() => {
    resetDb();
    cinetpay.reset();
    savedBank = { ...config.bankTransfer };
    Object.assign(config.bankTransfer, RIB);
    seedUser({ id: 'u-sn', country: 'SN', email: 'awa@teranga.sn', firstName: 'Awa', lastName: 'Diop' });
  });

  afterEach(() => {
    Object.assign(config.bankTransfer, savedBank);
  });

  describe('disponibilité (conditionnée à la configuration)', () => {
    test('proposé quand l’IBAN est configuré', async () => {
      const res = await paymentsService.getMethodsForUser('u-sn');
      const bt = res.methods.find((m) => m.method === 'BANK_TRANSFER');
      assert.ok(bt, 'le virement doit être proposé');
      assert.equal(bt!.isMobileMoney, false);
      assert.equal(bt!.label, 'Virement bancaire');
    });

    test('absent si l’IBAN n’est pas configuré', async () => {
      config.bankTransfer.iban = '';
      const res = await paymentsService.getMethodsForUser('u-sn');
      assert.equal(res.methods.some((m) => m.method === 'BANK_TRANSFER'), false);
    });
  });

  describe('initiation', () => {
    test('crée un paiement PENDING en EUR, sans appel provider, avec coordonnées + référence', async () => {
      const res = await paymentsService.initiate('u-sn', 'STANDARD', 'BANK_TRANSFER', undefined);

      assert.ok(res.paymentId);
      assert.equal(res.paymentUrl, null);
      assert.equal(cinetpay.calls.length, 0, 'aucun appel CinetPay pour un virement');

      const bt = (res as any).bankTransfer;
      assert.ok(bt, 'les coordonnées bancaires doivent être renvoyées');
      assert.equal(bt.iban, RIB.iban);
      assert.equal(bt.bic, RIB.bic);
      assert.equal(bt.beneficiary, RIB.beneficiary);
      assert.equal(bt.currency, 'EUR');
      assert.equal(bt.amountFcfa, 1500);
      assert.equal(typeof bt.amountEur, 'string');

      const payment = readPayment(res.paymentId)!;
      assert.equal(payment.status, 'PENDING', 'reste PENDING jusqu’à validation admin');
      assert.equal(payment.method, 'BANK_TRANSFER');
      assert.equal(payment.currency, 'EUR');
      assert.equal(payment.amountFcfa, 1500);
      assert.equal(payment.phoneNumber, null, 'aucun numéro pour un virement');
      // La référence renvoyée est exactement le motif à reporter.
      assert.equal(bt.reference, payment.providerRef);
    });

    test('aucun numéro n’est exigé (contrairement au mobile money)', async () => {
      const res = await paymentsService.initiate('u-sn', 'DISCOVERY', 'BANK_TRANSFER', undefined);
      assert.ok(res.paymentId);
    });

    test('refusé si le virement n’est pas configuré (aucun paiement créé)', async () => {
      config.bankTransfer.iban = '';
      await assertAppError(
        () => paymentsService.initiate('u-sn', 'STANDARD', 'BANK_TRANSFER', undefined),
        400,
        "n'est pas disponible",
      );
    });

    test('hors zone F CFA → 400', async () => {
      seedUser({ id: 'u-fr', country: 'FR' });
      await assertAppError(
        () => paymentsService.initiate('u-fr', 'STANDARD', 'BANK_TRANSFER', undefined),
        400,
        'zone F CFA',
      );
    });
  });

  describe('validation admin (confirmBankTransfer)', () => {
    async function createPending() {
      const res = await paymentsService.initiate('u-sn', 'STANDARD', 'BANK_TRANSFER', undefined);
      return res.paymentId;
    }

    test('confirme le virement → COMPLETED et active l’abonnement', async () => {
      const id = await createPending();
      const out = await paymentsService.confirmBankTransfer(id);
      assert.equal(out.status, 'COMPLETED');

      const payment = readPayment(id)!;
      assert.equal(payment.status, 'COMPLETED');
      assert.ok(payment.completedAt, 'completedAt renseigné');

      const sub = readSubscription('u-sn')!;
      assert.ok(sub, 'un abonnement doit exister');
      assert.equal(sub.status, 'ACTIVE');
      assert.equal(sub.plan, 'STANDARD');
      assert.ok(new Date(sub.expiresAt).getTime() > Date.now(), 'abonnement actif dans le futur');
      assert.equal(payment.subscriptionId, sub.id, 'le paiement est rattaché à l’abonnement');
    });

    test('idempotent : une seconde confirmation ne prolonge pas l’abonnement', async () => {
      const id = await createPending();
      await paymentsService.confirmBankTransfer(id);
      const firstExpiry = readSubscription('u-sn')!.expiresAt;

      const again = await paymentsService.confirmBankTransfer(id);
      assert.equal((again as any).alreadyProcessed, true);
      assert.equal(readSubscription('u-sn')!.expiresAt.getTime?.() ?? +new Date(readSubscription('u-sn')!.expiresAt),
        firstExpiry.getTime?.() ?? +new Date(firstExpiry),
        'la date d’expiration ne bouge pas',
      );
    });

    test('refuse un paiement qui n’est pas un virement → 400', async () => {
      seedUser({ id: 'u-sn2', country: 'SN' });
      // Un paiement carte (autre méthode) ne peut pas être confirmé ainsi.
      const card = await paymentsService.initiate('u-sn2', 'STANDARD', 'CARD', undefined);
      await assertAppError(() => paymentsService.confirmBankTransfer(card.paymentId), 400, 'virement');
    });

    test('paiement inconnu → 404', async () => {
      await assertAppError(() => paymentsService.confirmBankTransfer('p-fantome'), 404);
    });

    test('confirmer un virement déjà rejeté est impossible → 400', async () => {
      const id = await createPending();
      await paymentsService.rejectBankTransfer(id);
      await assertAppError(() => paymentsService.confirmBankTransfer(id), 400, 'ne peut plus');
      // Aucun abonnement n’a été activé.
      assert.equal(readSubscription('u-sn'), undefined);
    });
  });

  describe('rejet admin (rejectBankTransfer)', () => {
    test('marque le paiement FAILED sans activer d’abonnement', async () => {
      const res = await paymentsService.initiate('u-sn', 'STANDARD', 'BANK_TRANSFER', undefined);
      const out = await paymentsService.rejectBankTransfer(res.paymentId, 'Fonds non reçus');
      assert.equal(out.status, 'FAILED');

      const payment = readPayment(res.paymentId)!;
      assert.equal(payment.status, 'FAILED');
      assert.equal(payment.failureReason, 'Fonds non reçus');
      assert.equal(readSubscription('u-sn'), undefined, 'aucun abonnement activé');
    });

    test('rejeter un virement déjà confirmé est impossible → 400', async () => {
      const res = await paymentsService.initiate('u-sn', 'STANDARD', 'BANK_TRANSFER', undefined);
      await paymentsService.confirmBankTransfer(res.paymentId);
      await assertAppError(() => paymentsService.rejectBankTransfer(res.paymentId), 400, 'déjà confirmé');
    });
  });

  describe('suivi de statut', () => {
    test('checkStatus relit la ligne sans interroger CinetPay', async () => {
      const res = await paymentsService.initiate('u-sn', 'STANDARD', 'BANK_TRANSFER', undefined);
      const before = cinetpay.calls.length;
      const status = await paymentsService.checkStatus('u-sn', res.paymentId);
      assert.equal(status!.status, 'PENDING');
      assert.equal(cinetpay.calls.length, before, 'aucun appel provider pour un virement');
    });
  });

  describe('validation de la requête (subscribeSchema)', () => {
    test('accepte BANK_TRANSFER sans numéro de téléphone', () => {
      const parsed = subscribeSchema.safeParse({ plan: 'STANDARD', method: 'BANK_TRANSFER' });
      assert.equal(parsed.success, true);
    });
  });
});
