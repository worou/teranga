import './helpers/setup';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, seedUser, seedSubscription, readSubscription } from './helpers/fakePrisma';
import { assertAppError, daysFrom } from './helpers/factories';
import { subscriptionsService } from '../src/services/subscriptions.service';

describe('Abonnement — consultation et résiliation', () => {
  const now = new Date();

  beforeEach(() => {
    resetDb();
    seedUser({ id: 'u-sn', country: 'SN' });
  });

  describe('getMySubscription', () => {
    test('sans abonnement : formule gratuite implicite', async () => {
      const sub = await subscriptionsService.getMySubscription('u-sn');
      assert.deepEqual(sub, { plan: 'FREE', status: 'ACTIVE' });
    });

    test('avec abonnement : renvoie la ligne complète', async () => {
      seedSubscription({
        id: 'sub-1',
        userId: 'u-sn',
        plan: 'ENGAGEMENT',
        status: 'ACTIVE',
        startsAt: daysFrom(now, -10),
        expiresAt: daysFrom(now, 170),
        autoRenew: true,
      });

      const sub: any = await subscriptionsService.getMySubscription('u-sn');
      assert.equal(sub.id, 'sub-1');
      assert.equal(sub.plan, 'ENGAGEMENT');
      assert.equal(sub.status, 'ACTIVE');
      assert.ok(sub.expiresAt instanceof Date);
    });

    test('n’expose pas l’abonnement d’un autre utilisateur', async () => {
      seedUser({ id: 'u-autre', country: 'SN' });
      seedSubscription({ id: 'sub-1', userId: 'u-autre', plan: 'STANDARD', status: 'ACTIVE' });

      const sub = await subscriptionsService.getMySubscription('u-sn');
      assert.deepEqual(sub, { plan: 'FREE', status: 'ACTIVE' });
    });
  });

  describe('cancel', () => {
    test('stoppe le renouvellement sans couper l’accès', async () => {
      const echeance = daysFrom(now, 40);
      seedSubscription({
        id: 'sub-1',
        userId: 'u-sn',
        plan: 'STANDARD',
        status: 'ACTIVE',
        startsAt: daysFrom(now, -50),
        expiresAt: echeance,
        autoRenew: true,
      });

      const res: any = await subscriptionsService.cancel('u-sn');
      assert.equal(res.autoRenew, false);
      assert.ok(res.cancelledAt instanceof Date);

      const sub = readSubscription('u-sn')!;
      assert.equal(sub.status, 'ACTIVE', 'l’accès reste ouvert jusqu’à l’échéance');
      assert.equal(sub.expiresAt.getTime(), echeance.getTime(), 'l’échéance n’est pas avancée');
      assert.equal(sub.plan, 'STANDARD', 'la formule payée reste visible');
    });

    test('sans abonnement → 404', async () => {
      await assertAppError(() => subscriptionsService.cancel('u-sn'), 404, 'Aucun abonnement');
    });

    test('formule gratuite → 400 (rien à annuler)', async () => {
      seedSubscription({ id: 'sub-1', userId: 'u-sn', plan: 'FREE', status: 'ACTIVE' });
      await assertAppError(() => subscriptionsService.cancel('u-sn'), 400, 'Rien à annuler');
    });

    test('une seconde résiliation reste sans effet de bord', async () => {
      seedSubscription({
        id: 'sub-1',
        userId: 'u-sn',
        plan: 'STANDARD',
        status: 'ACTIVE',
        expiresAt: daysFrom(now, 40),
        autoRenew: true,
      });

      await subscriptionsService.cancel('u-sn');
      const premier = readSubscription('u-sn')!.expiresAt.getTime();
      await subscriptionsService.cancel('u-sn');

      const sub = readSubscription('u-sn')!;
      assert.equal(sub.autoRenew, false);
      assert.equal(sub.status, 'ACTIVE');
      assert.equal(sub.expiresAt.getTime(), premier);
    });

    test('un abonnement expiré peut être résilié (plus de relance)', async () => {
      seedSubscription({
        id: 'sub-1',
        userId: 'u-sn',
        plan: 'DISCOVERY',
        status: 'EXPIRED',
        expiresAt: daysFrom(now, -3),
        autoRenew: true,
      });

      const res: any = await subscriptionsService.cancel('u-sn');
      assert.equal(res.autoRenew, false);
      assert.equal(readSubscription('u-sn')!.status, 'EXPIRED');
    });
  });
});
