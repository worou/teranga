import './helpers/setup';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, seedUser } from './helpers/fakePrisma';
import { usersService } from '../src/services/users.service';
import { updateProfileSchema } from '../src/validators';

/**
 * Édition du profil : ce que le client envoie doit revenir tel quel.
 *
 * Le format de stockage des langues (",FR,WO,") est interne — il existe pour
 * que la recherche par `contains` soit exacte. L'API reçoit et renvoie un
 * tableau : c'est cette couture qui est vérifiée ici, ainsi que l'effacement,
 * seul cas où `null` traverse toute la chaîne.
 */

const base = { birthDate: new Date('1993-04-11') };

describe('Édition du profil — langues', () => {
  beforeEach(() => { resetDb(); seedUser({ id: 'u', ...base }); });

  test('un tableau est persisté encadré de virgules', async () => {
    await usersService.updateProfile('u', { languages: ['FR', 'WO'] });
    const raw = await import('./helpers/fakePrisma');
    const row = raw.fakePrisma.user.rows.find((r) => r.id === 'u');
    assert.equal(row!.languages, ',FR,WO,', 'les sentinelles doivent encadrer les codes');
  });

  test('le tableau envoyé est celui qui revient', async () => {
    const out = await usersService.updateProfile('u', { languages: ['FR', 'WO'] });
    assert.deepEqual(out.languages, ['FR', 'WO']);
  });

  test('la casse et les doublons sont normalisés', async () => {
    const out = await usersService.updateProfile('u', { languages: ['fr', 'FR', ' wo '] });
    assert.deepEqual(out.languages, ['FR', 'WO']);
  });

  test('null efface au lieu d’écrire la chaîne « NULL »', async () => {
    await usersService.updateProfile('u', { languages: ['FR'] });
    const out = await usersService.updateProfile('u', { languages: null });
    const raw = await import('./helpers/fakePrisma');
    const row = raw.fakePrisma.user.rows.find((r) => r.id === 'u');
    assert.equal(row!.languages, null, 'la colonne doit être vidée, pas remplie de « ,NULL, »');
    assert.deepEqual(out.languages, []);
  });

  test('un profil sans langue expose un tableau vide, pas null', async () => {
    const out = await usersService.getById('u');
    assert.deepEqual(out.languages, []);
  });
});

describe('Édition du profil — champs de recherche', () => {
  beforeEach(() => { resetDb(); seedUser({ id: 'u', ...base }); });

  test('les nouveaux champs traversent le validateur', () => {
    const r = updateProfileSchema.safeParse({
      wantsChildren: true, heightCm: 172, weightKg: 64,
      bodyType: 'MOYENNE', ethnicity: 'AFRICAN', languages: ['FR'],
    });
    assert.equal(r.success, true, 'Zod supprimerait des clés absentes du schéma');
    if (r.success) {
      assert.equal(r.data.heightCm, 172);
      assert.deepEqual(r.data.languages, ['FR']);
    }
  });

  test('null est accepté pour effacer une valeur', () => {
    const r = updateProfileSchema.safeParse({ heightCm: null, bodyType: null });
    assert.equal(r.success, true);
  });

  test('les bornes physiques aberrantes sont refusées', () => {
    assert.equal(updateProfileSchema.safeParse({ heightCm: 40 }).success, false);
    assert.equal(updateProfileSchema.safeParse({ weightKg: 999 }).success, false);
  });

  test('une silhouette inconnue est refusée', () => {
    assert.equal(updateProfileSchema.safeParse({ bodyType: 'ATHLETIQUE' }).success, false);
  });

  test('les champs hors liste blanche ne sont pas écrits', async () => {
    await usersService.updateProfile('u', { isVerified: true, status: 'BANNED' } as any);
    const raw = await import('./helpers/fakePrisma');
    const row = raw.fakePrisma.user.rows.find((r) => r.id === 'u');
    assert.notEqual(row!.status, 'BANNED', 'le statut ne doit jamais être modifiable par le membre');
  });

  test('le souhait d’enfants persiste false sans le confondre avec non renseigné', async () => {
    const out = await usersService.updateProfile('u', { wantsChildren: false });
    assert.equal(out.wantsChildren, false);
    const cleared = await usersService.updateProfile('u', { wantsChildren: null } as any);
    assert.equal(cleared.wantsChildren, null);
  });
});
