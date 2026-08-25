import './helpers/setup';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, seedUser, fakePrisma } from './helpers/fakePrisma';
import { conversationsService } from '../src/services/conversations.service';

/**
 * Messagerie : lecture d'un fil et appartenance.
 *
 * Le service n'était couvert par aucun test. Deux comportements sont vérifiés
 * ici parce qu'ils ne se voient pas à l'œil nu :
 *
 *  - la lecture incrémentale (`since`), qui évite de retransmettre cinquante
 *    messages à chaque sondage ;
 *  - `isParticipant`, sur lequel repose désormais l'adhésion aux salles
 *    Socket.IO — sans lui, tout membre rejoignait la conversation d'autrui.
 */

const MINUTE = 60_000;

/** Conversation entre `a` et `b`, avec des messages espacés d'une minute. */
function seedConversation(id: string, a: string, b: string, contents: string[], from = b) {
  fakePrisma.match.insert({ id, userAId: a, userBId: b, status: 'MATCHED', matchedAt: new Date(Date.now() - 60 * MINUTE) });
  return contents.map((content, i) =>
    fakePrisma.message.insert({
      matchId: id,
      senderId: from,
      content,
      blockedByAi: false,
      readAt: null,
      createdAt: new Date(Date.now() - (contents.length - i) * MINUTE),
    }),
  );
}

describe('Messagerie — lecture incrémentale du fil', () => {
  beforeEach(() => {
    resetDb();
    seedUser({ id: 'moi', phone: '+221770000001' });
    seedUser({ id: 'elle', phone: '+221770000002' });
  });

  test('sans `since`, le fil complet est renvoyé avec son total', async () => {
    seedConversation('c1', 'moi', 'elle', ['un', 'deux', 'trois']);
    const res = await conversationsService.getMessages('moi', 'c1');
    assert.deepEqual(res.data.map((m: any) => m.content), ['un', 'deux', 'trois']);
    assert.equal(res.pagination.total, 3);
  });

  test('avec `since`, seuls les messages suivants remontent', async () => {
    const msgs = seedConversation('c1', 'moi', 'elle', ['un', 'deux', 'trois']);
    const res = await conversationsService.getMessages('moi', 'c1', 1, 50, msgs[2].createdAt);
    assert.deepEqual(res.data.map((m: any) => m.content), ['trois']);
  });

  test('la borne est inclusive : aucun message ne peut être sauté', async () => {
    const msgs = seedConversation('c1', 'moi', 'elle', ['un', 'deux']);
    // Deux messages exactement à la même milliseconde — un `gt` en perdrait un.
    fakePrisma.message.insert({
      matchId: 'c1', senderId: 'elle', content: 'jumeau',
      blockedByAi: false, readAt: null, createdAt: msgs[1].createdAt,
    });
    const res = await conversationsService.getMessages('moi', 'c1', 1, 50, msgs[1].createdAt);
    const contenus = res.data.map((m: any) => m.content);
    assert.ok(contenus.includes('jumeau'), 'le message de même horodatage doit remonter');
    assert.ok(contenus.includes('deux'), 'le recouvrement de borne est assumé');
  });

  test('une lecture incrémentale n’annonce pas de total trompeur', async () => {
    const msgs = seedConversation('c1', 'moi', 'elle', ['un', 'deux', 'trois']);
    const res = await conversationsService.getMessages('moi', 'c1', 1, 50, msgs[2].createdAt);
    assert.equal(res.pagination.total, null, 'un fragment n’est pas la taille du fil');
    assert.equal(res.pagination.totalPages, null);
  });

  test('un fil au repos ne réécrit rien', async () => {
    seedConversation('c1', 'moi', 'elle', ['un']);
    await conversationsService.getMessages('moi', 'c1'); // marque comme lu
    const avant = fakePrisma.message.rows.map((r: any) => r.readAt?.getTime());

    const futur = new Date(Date.now() + MINUTE);
    const res = await conversationsService.getMessages('moi', 'c1', 1, 50, futur);
    assert.equal(res.data.length, 0);
    const apres = fakePrisma.message.rows.map((r: any) => r.readAt?.getTime());
    assert.deepEqual(apres, avant, 'aucune écriture quand rien n’est arrivé');
  });

  test('les messages arrêtés par la modération restent invisibles', async () => {
    seedConversation('c1', 'moi', 'elle', ['visible']);
    fakePrisma.message.insert({
      matchId: 'c1', senderId: 'elle', content: 'demande d’argent',
      blockedByAi: true, readAt: null, createdAt: new Date(),
    });
    const res = await conversationsService.getMessages('moi', 'c1');
    assert.deepEqual(res.data.map((m: any) => m.content), ['visible']);
  });
});

describe('Messagerie — appartenance à une conversation', () => {
  beforeEach(() => {
    resetDb();
    seedUser({ id: 'moi', phone: '+221770000001' });
    seedUser({ id: 'elle', phone: '+221770000002' });
    seedUser({ id: 'intrus', phone: '+221770000003' });
    seedConversation('c1', 'moi', 'elle', ['coucou']);
  });

  test('les deux participants sont reconnus', async () => {
    assert.equal(await conversationsService.isParticipant('moi', 'c1'), true);
    assert.equal(await conversationsService.isParticipant('elle', 'c1'), true);
  });

  test('un tiers est refusé — c’est ce qui garde les salles Socket.IO closes', async () => {
    assert.equal(await conversationsService.isParticipant('intrus', 'c1'), false);
  });

  test('une conversation inexistante ne laisse entrer personne', async () => {
    assert.equal(await conversationsService.isParticipant('moi', 'conversation-fantome'), false);
  });

  test('le prédicat ne lève pas : la socket doit refuser sans rompre', async () => {
    await assert.doesNotReject(() => conversationsService.isParticipant('intrus', 'c1'));
  });
});

describe('Messagerie — liste des conversations et compteurs de non-lus', () => {
  beforeEach(() => {
    resetDb();
    seedUser({ id: 'moi', phone: '+221770000001', firstName: 'Moi' });
    seedUser({ id: 'elle', phone: '+221770000002', firstName: 'Elle' });
    seedUser({ id: 'lui', phone: '+221770000003', firstName: 'Lui' });
  });

  test('chaque conversation reçoit SON compte de non-lus', async () => {
    seedConversation('c1', 'moi', 'elle', ['a', 'b', 'c']);
    seedConversation('c2', 'moi', 'lui', ['x']);

    const res = await conversationsService.getConversations('moi');
    const parId = new Map(res.data.map((c: any) => [c.id, c.unreadCount]));
    assert.equal(parId.get('c1'), 3, 'le groupBy doit rendre à césar ce qui est à césar');
    assert.equal(parId.get('c2'), 1);
  });

  test('une conversation sans non-lu affiche zéro, pas undefined', async () => {
    seedConversation('c1', 'moi', 'elle', ['a']);
    await conversationsService.getMessages('moi', 'c1'); // tout marquer comme lu
    const res = await conversationsService.getConversations('moi');
    assert.equal(res.data[0].unreadCount, 0);
  });

  test('mes propres messages ne comptent pas comme non lus', async () => {
    seedConversation('c1', 'moi', 'elle', ['a', 'b'], 'moi');
    const res = await conversationsService.getConversations('moi');
    assert.equal(res.data[0].unreadCount, 0, 'on ne se notifie pas soi-même');
  });

  test('un message bloqué ne gonfle pas la pastille', async () => {
    seedConversation('c1', 'moi', 'elle', ['visible']);
    fakePrisma.message.insert({
      matchId: 'c1', senderId: 'elle', content: 'arnaque',
      blockedByAi: true, readAt: null, createdAt: new Date(),
    });
    const res = await conversationsService.getConversations('moi');
    assert.equal(
      res.data[0].unreadCount,
      1,
      'sinon la pastille annonce un message que le fil ne montrera jamais',
    );
  });

  test('la projection n’expose pas le téléphone du correspondant', async () => {
    seedConversation('c1', 'moi', 'elle', ['a']);
    const res = await conversationsService.getConversations('moi');
    const other = res.data[0].otherUser as any;
    assert.equal(other.firstName, 'Elle');
    assert.equal(other.phone, undefined, 'select et non include : la base ne renvoie que l’utile');
    assert.equal(other.passwordHash, undefined);
  });
});
