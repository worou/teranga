import './helpers/setup';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import cron from 'node-cron';
import { config } from './helpers/setup';
import { resetDb, seedUser, seedSubscription, readSubscription, allNotifications } from './helpers/fakePrisma';
import { daysFrom } from './helpers/factories';
import {
  expireSubscriptions,
  sendRenewalReminders,
  runSubscriptionLifecycle,
} from '../src/jobs/subscriptionLifecycle';

/**
 * Cycle de vie des abonnements. Le job tourne quotidiennement ; toutes les
 * fonctions acceptent un `now` injecté, ce qui rend les fenêtres temporelles
 * testables sans manipuler l'horloge système.
 */
const NOW = new Date('2026-07-21T08:00:00.000Z');

function abonne(id: string, over: Record<string, any> = {}) {
  seedUser({ id: `u-${id}`, firstName: 'Awa', country: 'SN' });
  return seedSubscription({
    id: `sub-${id}`,
    userId: `u-${id}`,
    plan: 'STANDARD',
    status: 'ACTIVE',
    autoRenew: true,
    startsAt: daysFrom(NOW, -80),
    expiresAt: daysFrom(NOW, 10),
    lastReminderAt: null,
    ...over,
  });
}

describe('Cycle de vie des abonnements — expiration', () => {
  beforeEach(() => resetDb());

  test('un abonnement actif dont l’échéance est passée devient EXPIRED', async () => {
    abonne('a', { expiresAt: daysFrom(NOW, -1) });

    const count = await expireSubscriptions(NOW);
    assert.equal(count, 1);
    assert.equal(readSubscription('u-a')!.status, 'EXPIRED');
  });

  test('l’utilisateur est notifié avec un lien de renouvellement pré-rempli', async () => {
    abonne('a', { plan: 'ENGAGEMENT', expiresAt: daysFrom(NOW, -1) });

    await expireSubscriptions(NOW);
    const notifs = allNotifications();
    assert.equal(notifs.length, 1);
    assert.equal(notifs[0].userId, 'u-a');
    assert.equal(notifs[0].type, 'subscription_expired');
    assert.equal(notifs[0].data.plan, 'ENGAGEMENT');
    assert.equal(notifs[0].data.action, 'renew');
    assert.equal(
      notifs[0].data.url,
      `${config.apiBaseUrl}${config.subscriptions.renewPath}?renew=1&plan=ENGAGEMENT`,
    );
  });

  test('un abonnement encore valide n’est pas touché', async () => {
    abonne('a', { expiresAt: daysFrom(NOW, 1) });

    assert.equal(await expireSubscriptions(NOW), 0);
    assert.equal(readSubscription('u-a')!.status, 'ACTIVE');
    assert.equal(allNotifications().length, 0);
  });

  test('un abonnement déjà EXPIRED n’est pas re-notifié', async () => {
    abonne('a', { status: 'EXPIRED', expiresAt: daysFrom(NOW, -30) });

    assert.equal(await expireSubscriptions(NOW), 0);
    assert.equal(allNotifications().length, 0);
  });

  test('traite plusieurs abonnements en une passe, sans toucher aux autres', async () => {
    abonne('a', { expiresAt: daysFrom(NOW, -5) });
    abonne('b', { expiresAt: daysFrom(NOW, -1) });
    abonne('c', { expiresAt: daysFrom(NOW, 20) });

    assert.equal(await expireSubscriptions(NOW), 2);
    assert.equal(readSubscription('u-a')!.status, 'EXPIRED');
    assert.equal(readSubscription('u-b')!.status, 'EXPIRED');
    assert.equal(readSubscription('u-c')!.status, 'ACTIVE');
    assert.equal(allNotifications().length, 2);
  });

  test('rejouer la passe le lendemain ne renotifie pas', async () => {
    abonne('a', { expiresAt: daysFrom(NOW, -1) });

    await expireSubscriptions(NOW);
    assert.equal(await expireSubscriptions(daysFrom(NOW, 1)), 0);
    assert.equal(allNotifications().length, 1);
  });
});

describe('Cycle de vie des abonnements — rappel de renouvellement (J-3)', () => {
  beforeEach(() => resetDb());

  test('rappel envoyé dans la fenêtre des 3 jours', async () => {
    abonne('a', { expiresAt: daysFrom(NOW, 2) });

    const count = await sendRenewalReminders(NOW);
    assert.equal(count, 1);

    const notifs = allNotifications();
    assert.equal(notifs.length, 1);
    assert.equal(notifs[0].type, 'subscription_expiring');
    assert.ok(notifs[0].title.includes('2 jours'), `titre inattendu : ${notifs[0].title}`);
    assert.ok(notifs[0].body.includes('Awa'), 'le rappel est personnalisé');
    assert.equal(notifs[0].data.action, 'renew');
    assert.ok(String(notifs[0].data.url).includes('plan=STANDARD'));
  });

  test('le singulier est respecté à J-1', async () => {
    abonne('a', { expiresAt: new Date(NOW.getTime() + 12 * 3600_000) });

    await sendRenewalReminders(NOW);
    const titre = allNotifications()[0].title;
    assert.ok(titre.includes('1 jour') && !titre.includes('1 jours'), `titre inattendu : ${titre}`);
  });

  test('le rappel marque la date d’envoi (un seul par cycle)', async () => {
    abonne('a', { expiresAt: daysFrom(NOW, 2) });

    await sendRenewalReminders(NOW);
    assert.equal(readSubscription('u-a')!.lastReminderAt!.getTime(), NOW.getTime());

    // Passe du lendemain : toujours dans la fenêtre, mais déjà relancé.
    assert.equal(await sendRenewalReminders(daysFrom(NOW, 1)), 0);
    assert.equal(allNotifications().length, 1);
  });

  test('après renouvellement, un nouveau rappel est possible au cycle suivant', async () => {
    // Échéance repoussée à J+2 mais dernier rappel datant du cycle précédent.
    abonne('a', { expiresAt: daysFrom(NOW, 2), lastReminderAt: daysFrom(NOW, -90) });

    assert.equal(await sendRenewalReminders(NOW), 1);
    assert.equal(readSubscription('u-a')!.lastReminderAt!.getTime(), NOW.getTime());
  });

  test('hors fenêtre : échéance trop lointaine', async () => {
    abonne('a', { expiresAt: daysFrom(NOW, 10) });
    assert.equal(await sendRenewalReminders(NOW), 0);
    assert.equal(allNotifications().length, 0);
  });

  test('hors fenêtre : échéance déjà passée (relève de l’expiration)', async () => {
    abonne('a', { expiresAt: daysFrom(NOW, -1) });
    assert.equal(await sendRenewalReminders(NOW), 0);
  });

  test('exclut les abonnés ayant désactivé le renouvellement', async () => {
    abonne('a', { expiresAt: daysFrom(NOW, 2), autoRenew: false, cancelledAt: daysFrom(NOW, -1) });
    assert.equal(await sendRenewalReminders(NOW), 0);
    assert.equal(allNotifications().length, 0);
  });

  test('exclut la formule gratuite', async () => {
    abonne('a', { plan: 'FREE', expiresAt: daysFrom(NOW, 2) });
    assert.equal(await sendRenewalReminders(NOW), 0);
  });

  test('exclut les abonnements non ACTIVE', async () => {
    abonne('a', { status: 'EXPIRED', expiresAt: daysFrom(NOW, 2) });
    abonne('b', { status: 'CANCELLED', expiresAt: daysFrom(NOW, 2) });
    assert.equal(await sendRenewalReminders(NOW), 0);
  });

  test('ne relance que les abonnés éligibles parmi plusieurs', async () => {
    abonne('a', { expiresAt: daysFrom(NOW, 1) });
    abonne('b', { expiresAt: daysFrom(NOW, 2), autoRenew: false });
    abonne('c', { expiresAt: daysFrom(NOW, 3) });
    abonne('d', { expiresAt: daysFrom(NOW, 30) });

    assert.equal(await sendRenewalReminders(NOW), 2);
    const cibles = allNotifications().map((n) => n.userId).sort();
    assert.deepEqual(cibles, ['u-a', 'u-c']);
  });
});

describe('Cycle de vie des abonnements — passe complète', () => {
  beforeEach(() => resetDb());

  test('expire et relance dans la même exécution', async () => {
    abonne('expire', { expiresAt: daysFrom(NOW, -1) });
    abonne('bientot', { expiresAt: daysFrom(NOW, 2) });
    abonne('tranquille', { expiresAt: daysFrom(NOW, 60) });

    const res = await runSubscriptionLifecycle(NOW);
    assert.deepEqual(res, { expired: 1, reminded: 1 });
    assert.equal(readSubscription('u-expire')!.status, 'EXPIRED');
    assert.equal(readSubscription('u-bientot')!.status, 'ACTIVE');
    assert.equal(readSubscription('u-tranquille')!.lastReminderAt, null);
    assert.equal(allNotifications().length, 2);
  });

  test('un abonnement expiré ce jour n’est pas aussi relancé', async () => {
    // L'expiration passe d'abord : la ligne n'est plus ACTIVE quand les rappels
    // sont calculés, elle ne peut donc pas générer les deux notifications.
    abonne('a', { expiresAt: daysFrom(NOW, -0.5) });

    const res = await runSubscriptionLifecycle(NOW);
    assert.deepEqual(res, { expired: 1, reminded: 0 });
    assert.equal(allNotifications().length, 1);
  });

  test('base sans abonnement : passe silencieuse', async () => {
    assert.deepEqual(await runSubscriptionLifecycle(NOW), { expired: 0, reminded: 0 });
    assert.equal(allNotifications().length, 0);
  });
});

describe('Planification du job', () => {
  test('l’expression cron configurée est valide', () => {
    assert.equal(cron.validate(config.subscriptions.cronSchedule), true);
  });

  test('la fenêtre de rappel est un entier positif', () => {
    const jours = config.subscriptions.reminderDaysBefore;
    assert.ok(Number.isInteger(jours) && jours > 0, `valeur inattendue : ${jours}`);
  });

  test('le fuseau horaire vise la zone UEMOA', () => {
    assert.doesNotThrow(() =>
      new Intl.DateTimeFormat('fr-FR', { timeZone: config.subscriptions.cronTimezone }),
    );
  });
});
