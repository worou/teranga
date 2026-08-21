import './helpers/setup';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, seedUser, seedPhotos } from './helpers/fakePrisma';
import { discoveryService } from '../src/services/discovery.service';

/**
 * Filtres de recherche de la découverte.
 *
 * Point central : les critères facultatifs du profil (taille, poids,
 * silhouette, origine, langues, souhait d'enfants) sont `null` tant que le
 * membre ne les a pas renseignés. `includeUnspecified`, activé par défaut,
 * élargit chaque condition avec « ou non renseigné » : sans lui, un seul
 * filtre viderait la liste de tous les profils incomplets, et la recherche
 * paraîtrait cassée.
 */

const YEAR = 365.25 * 24 * 3600 * 1000;
const birthFor = (age: number) => new Date(Date.now() - age * YEAR);

/** Chercheur : un homme, donc cible féminine par défaut. */
function seedSearcher() {
  return seedUser({
    id: 'me', gender: 'MALE', city: 'Dakar', country: 'SN',
    intent: 'MARRIAGE', religion: 'MUSLIM', birthDate: birthFor(30),
    status: 'ACTIVE', isVerified: true,
  });
}

/** Candidate visible par défaut ; `over` surcharge les champs testés. */
function seedCandidate(id: string, over: Record<string, any> = {}) {
  return seedUser({
    id, gender: 'FEMALE', city: 'Dakar', country: 'SN',
    intent: 'MARRIAGE', religion: 'MUSLIM', birthDate: birthFor(28),
    status: 'ACTIVE', isVerified: true, lastActiveAt: new Date(),
    ...over,
  });
}

const ids = (rows: any[]) => rows.map((r) => r.id).sort();

describe('Recherche — critères facultatifs et profils non renseignés', () => {
  beforeEach(() => { resetDb(); seedSearcher(); });

  test('par défaut, un profil non renseigné reste visible', async () => {
    seedCandidate('renseignee', { bodyType: 'MINCE' });
    seedCandidate('inconnue');
    const feed = await discoveryService.getFeed('me', { bodyType: 'MINCE' });
    assert.deepEqual(ids(feed), ['inconnue', 'renseignee']);
  });

  test('includeUnspecified=false exclut les profils non renseignés', async () => {
    seedCandidate('renseignee', { bodyType: 'MINCE' });
    seedCandidate('inconnue');
    const feed = await discoveryService.getFeed('me', {
      bodyType: 'MINCE', includeUnspecified: false,
    });
    assert.deepEqual(ids(feed), ['renseignee']);
  });

  test('un profil renseigné mais non conforme est écarté dans les deux cas', async () => {
    seedCandidate('ronde', { bodyType: 'RONDE' });
    assert.deepEqual(ids(await discoveryService.getFeed('me', { bodyType: 'MINCE' })), []);
    assert.deepEqual(
      ids(await discoveryService.getFeed('me', { bodyType: 'MINCE', includeUnspecified: false })),
      [],
    );
  });

  test('deux critères facultatifs se cumulent au lieu de s’annuler', async () => {
    seedCandidate('les-deux', { bodyType: 'MINCE', ethnicity: 'AFRICAN' });
    seedCandidate('une-seule', { bodyType: 'RONDE', ethnicity: 'AFRICAN' });
    const feed = await discoveryService.getFeed('me', {
      bodyType: 'MINCE', ethnicity: 'AFRICAN', includeUnspecified: false,
    });
    assert.deepEqual(ids(feed), ['les-deux'], 'le AND doit s’appliquer, pas un OR global');
  });
});

describe('Recherche — langues parlées', () => {
  beforeEach(() => { resetDb(); seedSearcher(); });

  test('les sentinelles évitent les correspondances partielles', async () => {
    seedCandidate('francais', { languages: ',FR,WO,' });
    seedCandidate('fra-autre', { languages: ',FRA,' });
    const feed = await discoveryService.getFeed('me', {
      language: 'FR', includeUnspecified: false,
    });
    assert.deepEqual(ids(feed), ['francais'], '« FR » ne doit pas matcher « FRA »');
  });

  test('la casse saisie n’a pas d’importance', async () => {
    seedCandidate('wolof', { languages: ',WO,' });
    const feed = await discoveryService.getFeed('me', {
      language: 'wo', includeUnspecified: false,
    });
    assert.deepEqual(ids(feed), ['wolof']);
  });
});

describe('Recherche — genre, mensurations, photo et activité', () => {
  beforeEach(() => { resetDb(); seedSearcher(); });

  test('sans filtre, la cible reste le genre opposé', async () => {
    seedCandidate('femme');
    seedCandidate('homme', { gender: 'MALE' });
    assert.deepEqual(ids(await discoveryService.getFeed('me', {})), ['femme']);
  });

  test('un filtre de genre explicite l’emporte sur ce défaut', async () => {
    seedCandidate('femme');
    seedCandidate('homme', { gender: 'MALE' });
    const feed = await discoveryService.getFeed('me', { gender: 'MALE' });
    assert.deepEqual(ids(feed), ['homme']);
  });

  test('les bornes de taille encadrent bien', async () => {
    seedCandidate('petite', { heightCm: 155 });
    seedCandidate('moyenne', { heightCm: 170 });
    seedCandidate('grande', { heightCm: 185 });
    const feed = await discoveryService.getFeed('me', {
      minHeightCm: 165, maxHeightCm: 175, includeUnspecified: false,
    });
    assert.deepEqual(ids(feed), ['moyenne']);
  });

  test('les bornes de poids encadrent bien', async () => {
    seedCandidate('legere', { weightKg: 48 });
    seedCandidate('mediane', { weightKg: 65 });
    const feed = await discoveryService.getFeed('me', {
      minWeightKg: 60, includeUnspecified: false,
    });
    assert.deepEqual(ids(feed), ['mediane']);
  });

  test('« a une photo » écarte les profils sans photo', async () => {
    seedCandidate('avec');
    seedPhotos('avec', 2);
    seedCandidate('sans');
    assert.deepEqual(ids(await discoveryService.getFeed('me', { hasPhoto: true })), ['avec']);
  });

  test('« Connecté » ne garde que l’activité de moins de 5 minutes', async () => {
    seedCandidate('en-ligne', { lastActiveAt: new Date() });
    seedCandidate('ce-matin', { lastActiveAt: new Date(Date.now() - 3 * 3600 * 1000) });
    seedCandidate('le-mois-dernier', { lastActiveAt: new Date(Date.now() - 30 * 86400 * 1000) });
    assert.deepEqual(ids(await discoveryService.getFeed('me', { lastActive: 'online' })), ['en-ligne']);
  });

  test('« Récent » couvre les sept derniers jours', async () => {
    seedCandidate('ce-matin', { lastActiveAt: new Date(Date.now() - 3 * 3600 * 1000) });
    seedCandidate('le-mois-dernier', { lastActiveAt: new Date(Date.now() - 30 * 86400 * 1000) });
    assert.deepEqual(ids(await discoveryService.getFeed('me', { lastActive: 'recent' })), ['ce-matin']);
  });

  test('« Tous » n’exclut personne sur l’activité', async () => {
    seedCandidate('ce-matin', { lastActiveAt: new Date(Date.now() - 3 * 3600 * 1000) });
    seedCandidate('le-mois-dernier', { lastActiveAt: new Date(Date.now() - 30 * 86400 * 1000) });
    const feed = await discoveryService.getFeed('me', { lastActive: 'all' });
    assert.deepEqual(ids(feed), ['ce-matin', 'le-mois-dernier']);
  });

  test('le souhait d’enfants distingue « non » et « non renseigné »', async () => {
    seedCandidate('veut', { wantsChildren: true });
    seedCandidate('veut-pas', { wantsChildren: false });
    seedCandidate('sans-avis');
    assert.deepEqual(
      ids(await discoveryService.getFeed('me', { wantsChildren: true, includeUnspecified: false })),
      ['veut'],
    );
    assert.deepEqual(
      ids(await discoveryService.getFeed('me', { wantsChildren: true })),
      ['sans-avis', 'veut'],
      'sans avis reste visible quand on inclut les non renseignés',
    );
  });

  test('le pseudo cherche aussi dans la profession et la ville', async () => {
    seedCandidate('aminata', { firstName: 'Aminata' });
    seedCandidate('autre', { firstName: 'Fatou', profession: 'Aminatrice' });
    seedCandidate('hors-sujet', { firstName: 'Awa' });
    const feed = await discoveryService.getFeed('me', { q: 'Aminat' });
    assert.deepEqual(ids(feed), ['aminata', 'autre']);
  });
});
