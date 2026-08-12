import './helpers/setup';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { config } from './helpers/setup';
import { resetDb, seedUser, seedPhotos } from './helpers/fakePrisma';
import { assertAppError } from './helpers/factories';
import { requireCompleteProfile } from '../src/middleware/auth';
import { usersService } from '../src/services/users.service';

/**
 * Inscription complète : un profil doit porter au moins `config.profile.minPhotos`
 * photos avant d'accéder à la découverte, aux matchs et à la messagerie.
 *
 * Le garde-fou est un middleware relu à chaque requête : c'est ce qui le rend
 * incontournable, que l'on abandonne l'étape photos de l'inscription ou que
 * l'on supprime ses photos après coup.
 */

/** Joue le middleware et renvoie l'erreur transmise à `next` (null si passé). */
function runGuard(userId?: string): Promise<any> {
  return new Promise((resolve) => {
    const req: any = userId ? { auth: { userId, gender: 'FEMALE', isSubscribed: false } } : {};
    requireCompleteProfile(req, {} as any, ((err?: any) => resolve(err ?? null)) as any);
  });
}

describe('Inscription — minimum de photos exigé', () => {
  beforeEach(() => resetDb());

  test('le minimum par défaut est de 3 photos', () => {
    assert.equal(config.profile.minPhotos, 3);
  });

  test('un profil sans photo est bloqué', async () => {
    seedUser({ id: 'u-1' });
    const err = await runGuard('u-1');
    assert.ok(err, 'le middleware doit refuser un profil sans photo');
    assert.equal(err.statusCode, 403);
    assert.equal(err.details.code, 'PHOTOS_REQUIRED');
    assert.equal(err.details.photosCount, 0);
    assert.equal(err.details.missing, 3);
  });

  test('un profil incomplet est bloqué et annonce ce qui manque', async () => {
    seedUser({ id: 'u-2' });
    seedPhotos('u-2', 2);
    const err = await runGuard('u-2');
    assert.equal(err.statusCode, 403);
    assert.equal(err.details.missing, 1);
    assert.ok(/1 manquante/.test(err.message), `message peu clair : « ${err.message} »`);
  });

  test('le message s’accorde au pluriel quand plusieurs photos manquent', async () => {
    seedUser({ id: 'u-3' });
    seedPhotos('u-3', 1);
    const err = await runGuard('u-3');
    assert.ok(/2 manquantes/.test(err.message), `message peu clair : « ${err.message} »`);
  });

  test('un profil au minimum exact passe', async () => {
    seedUser({ id: 'u-4' });
    seedPhotos('u-4', 3);
    assert.equal(await runGuard('u-4'), null);
  });

  test('un profil au-delà du minimum passe', async () => {
    seedUser({ id: 'u-5' });
    seedPhotos('u-5', 5);
    assert.equal(await runGuard('u-5'), null);
  });

  test('les photos d’un autre membre ne comptent pas', async () => {
    seedUser({ id: 'u-6' });
    seedUser({ id: 'u-voisin', phone: '+221770000999' });
    seedPhotos('u-voisin', 4);
    const err = await runGuard('u-6');
    assert.equal(err.statusCode, 403);
    assert.equal(err.details.photosCount, 0);
  });

  test('supprimer ses photos rebloque l’accès (le contrôle est relu à chaque requête)', async () => {
    seedUser({ id: 'u-7' });
    const photos = seedPhotos('u-7', 3);
    assert.equal(await runGuard('u-7'), null);

    await usersService.deletePhoto('u-7', photos[0].id);
    const err = await runGuard('u-7');
    assert.equal(err.statusCode, 403, 'un profil retombé sous le minimum doit être rebloqué');
    assert.equal(err.details.photosCount, 2);
  });

  test('une requête sans authentification est rejetée en 401', async () => {
    const err = await runGuard();
    assert.equal(err.statusCode, 401);
  });

  test('le seuil est piloté par la configuration, pas codé en dur', async () => {
    seedUser({ id: 'u-8' });
    seedPhotos('u-8', 1);
    const previous = config.profile.minPhotos;
    try {
      config.profile.minPhotos = 1;
      assert.equal(await runGuard('u-8'), null);
      config.profile.minPhotos = 4;
      const err = await runGuard('u-8');
      assert.equal(err.details.minPhotos, 4);
    } finally {
      config.profile.minPhotos = previous;
    }
  });
});

describe('Inscription — plafond de photos et état de complétude', () => {
  beforeEach(() => resetDb());

  test('le plafond de photos est refusé au-delà du maximum', async () => {
    seedUser({ id: 'u-max' });
    seedPhotos('u-max', config.profile.maxPhotos);
    await assertAppError(
      () => usersService.addPhoto('u-max', '/uploads/trop.jpg'),
      400,
      'maximum',
    );
  });

  test('le minimum reste inférieur au maximum (référentiel cohérent)', () => {
    assert.ok(
      config.profile.minPhotos <= config.profile.maxPhotos,
      'minPhotos doit rester atteignable sous maxPhotos',
    );
  });

  test('la sérialisation expose la complétude du profil au client', () => {
    const base = { birthDate: new Date('1995-06-15'), passwordHash: 'secret' };
    const incomplet = usersService.serialize({ ...base, photos: [{ id: 'p1' }] });
    assert.equal(incomplet.photosCount, 1);
    assert.equal(incomplet.profileComplete, false);
    assert.equal(incomplet.minPhotos, 3);
    assert.equal(incomplet.maxPhotos, config.profile.maxPhotos);
    assert.equal(incomplet.passwordHash, undefined, 'le hash ne doit jamais être exposé');

    const complet = usersService.serialize({
      ...base,
      photos: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
    });
    assert.equal(complet.photosCount, 3);
    assert.equal(complet.profileComplete, true);
  });

  test('sans photos chargées, la sérialisation n’invente pas de complétude', () => {
    const out = usersService.serialize({ birthDate: new Date('1995-06-15') });
    assert.equal(out.photosCount, undefined);
    assert.equal(out.profileComplete, undefined);
    assert.equal(out.minPhotos, 3, 'le seuil reste exposé pour l’UI');
  });
});
