import './helpers/setup';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { config } from './helpers/setup';
import { resetDb, seedUser, seedSubscription, seedPhotos } from './helpers/fakePrisma';
import {
  requireSubscriptionForMessaging,
  requireSubscriptionsEnabled,
} from '../src/middleware/auth';
import { authService } from '../src/services/auth.service';
import { usersService } from '../src/services/users.service';

/**
 * Version 1 : le système d'abonnement est désactivé (`SUBSCRIPTIONS_ENABLED`
 * absent ⇒ false). L'accès est complet et gratuit pour tout le monde.
 *
 * Le drapeau est posé aux frontières — middleware de route et planificateur —
 * jamais dans `paymentsService` : le code de paiement reste intact et testé,
 * prêt à reprendre du service. C'est ce qui permet à la suite existante de
 * passer sans modification.
 */

/** Joue un middleware et renvoie l'erreur transmise à `next` (null si passé). */
function run(mw: any, userId?: string): Promise<any> {
  return new Promise(resolve => {
    const req: any = userId ? { auth: { userId, gender: 'MALE', isSubscribed: false } } : {};
    mw(req, {} as any, ((err?: any) => resolve(err ?? null)) as any);
  });
}

/** Exécute `fn` avec le système d'abonnement activé, puis restaure. */
async function withSubscriptions(fn: () => Promise<void> | void) {
  const previous = config.subscriptionsEnabled;
  try {
    (config as any).subscriptionsEnabled = true;
    await fn();
  } finally {
    (config as any).subscriptionsEnabled = previous;
  }
}

describe('Version 1 — abonnements désactivés', () => {
  beforeEach(() => resetDb());

  test('le drapeau est éteint par défaut', () => {
    assert.equal(config.subscriptionsEnabled, false);
  });

  test('un homme sans abonnement accède à la messagerie', async () => {
    seedUser({ id: 'u-h', gender: 'MALE' });
    seedSubscription({ userId: 'u-h', plan: 'FREE', status: 'ACTIVE', expiresAt: null });
    assert.equal(await run(requireSubscriptionForMessaging, 'u-h'), null);
  });

  test('les routes du tunnel d’abonnement répondent 404', async () => {
    const err = await run(requireSubscriptionsEnabled, 'u-x');
    assert.ok(err, 'le montage doit être refusé');
    assert.equal(err.statusCode, 404);
    assert.equal(err.details.code, 'SUBSCRIPTIONS_DISABLED');
  });

  test('le claim isSubscribed du token annonce un accès complet', () => {
    const { accessToken } = authService.issueTokens({
      id: 'u-h', gender: 'MALE',
      subscription: { plan: 'FREE', status: 'ACTIVE', expiresAt: null },
    });
    const claims = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString());
    assert.equal(claims.isSubscribed, true, 'sans abonnements, personne ne doit être relancé');
  });

  test('la sérialisation annonce le modèle au client', () => {
    const out = usersService.serialize({ birthDate: new Date('1990-01-01') });
    assert.equal(out.subscriptionsEnabled, false);
  });
});

describe('Réactivation — le modèle freemium reprend tel quel', () => {
  beforeEach(() => resetDb());

  test('la messagerie redevient réservée aux hommes abonnés', async () => {
    seedUser({ id: 'u-h2', gender: 'MALE' });
    seedSubscription({ userId: 'u-h2', plan: 'FREE', status: 'ACTIVE', expiresAt: null });
    await withSubscriptions(async () => {
      const err = await run(requireSubscriptionForMessaging, 'u-h2');
      assert.equal(err.statusCode, 403);
      assert.ok(/Abonnement requis/.test(err.message), `message inattendu : ${err.message}`);
    });
  });

  test('les femmes gardent l’accès complet dans les deux cas', async () => {
    seedUser({ id: 'u-f', gender: 'FEMALE' });
    seedSubscription({ userId: 'u-f', plan: 'FREE', status: 'ACTIVE', expiresAt: null });
    assert.equal(await run(requireSubscriptionForMessaging, 'u-f'), null);
    await withSubscriptions(async () => {
      assert.equal(await run(requireSubscriptionForMessaging, 'u-f'), null);
    });
  });

  test('un abonnement payant actif passe le garde-fou', async () => {
    seedUser({ id: 'u-p', gender: 'MALE' });
    seedSubscription({
      userId: 'u-p', plan: 'STANDARD', status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
    });
    await withSubscriptions(async () => {
      assert.equal(await run(requireSubscriptionForMessaging, 'u-p'), null);
    });
  });

  test('les routes du tunnel redeviennent accessibles', async () => {
    await withSubscriptions(async () => {
      assert.equal(await run(requireSubscriptionsEnabled, 'u-x'), null);
    });
  });

  test('le garde-fou photos reste indépendant du modèle économique', async () => {
    seedUser({ id: 'u-c', gender: 'MALE' });
    seedPhotos('u-c', config.profile.minPhotos);
    const { requireCompleteProfile } = await import('../src/middleware/auth');
    assert.equal(await run(requireCompleteProfile, 'u-c'), null);
    await withSubscriptions(async () => {
      assert.equal(await run(requireCompleteProfile, 'u-c'), null);
    });
  });
});
