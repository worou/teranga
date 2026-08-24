import { Router } from 'express';
import type { Server as SocketServer } from 'socket.io';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import {
  requireAuth,
  requireCompleteProfile,
  requireSubscriptionForMessaging,
} from '../middleware/auth';
import { conversationsService } from '../services/conversations.service';
import { emitNewMessage } from '../sockets';
import { sendMessageSchema } from '../validators';

const router = Router();

/**
 * Messagerie.
 *
 * Depuis la suppression du système de match, tout membre au profil complet
 * peut écrire à tout autre membre actif : la conversation naît du premier
 * message, elle ne suppose plus d'accord préalable. Les deux barrières qui
 * restent sont le blocage (vérifié à chaque envoi, côté service) et l'IA
 * anti-brouteur.
 *
 * `requireCompleteProfile` demeure : écrire suppose un compte abouti, pas
 * seulement un compte.
 */
const canAct = [requireAuth, requireCompleteProfile];

/**
 * @openapi
 * /conversations:
 *   get:
 *     tags: [Messages]
 *     summary: Lister ses conversations
 *     description: |
 *       Seules les conversations comptant au moins un message visible sont
 *       renvoyées : une conversation ouverte sans rien écrire n'apparaît nulle part.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Liste paginée }
 */
router.get(
  '/conversations',
  ...canAct,
  asyncHandler(async (req, res) => {
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = parseInt((req.query.limit as string) || '20', 10);
    res.json(await conversationsService.getConversations(req.auth!.userId, page, limit));
  }),
);

/**
 * @openapi
 * /conversations/unread-count:
 *   get:
 *     tags: [Messages]
 *     summary: Nombre total de messages non lus
 *     description: |
 *       Une seule agrégation, pour la pastille de l'en-tête — relue à chaque
 *       navigation. Évite d'y charger la liste complète des conversations.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ unread: number }" }
 */
router.get(
  '/conversations/unread-count',
  ...canAct,
  asyncHandler(async (req, res) => {
    res.json(await conversationsService.getUnreadCount(req.auth!.userId));
  }),
);

/**
 * @openapi
 * /conversations/with/{userId}:
 *   get:
 *     tags: [Messages]
 *     summary: La conversation avec ce membre, si elle existe
 *     description: |
 *       Ne crée jamais rien : consulter une fiche ne doit pas faire surgir une
 *       conversation vide chez l'autre. Répond `null` s'il n'y en a pas encore.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: "La conversation, ou null" }
 */
router.get(
  '/conversations/with/:userId',
  ...canAct,
  asyncHandler(async (req, res) => {
    const conversation = await conversationsService.findConversationWith(
      req.auth!.userId,
      req.params.userId,
    );
    res.json({ conversation });
  }),
);

/**
 * @openapi
 * /conversations/{conversationId}/messages:
 *   get:
 *     tags: [Messages]
 *     summary: Lister les messages d'une conversation
 *     description: |
 *       Du plus ancien au plus récent. Marque au passage les messages reçus
 *       comme lus. Reste lisible après un blocage — bloquer arrête les messages
 *       à venir, cela n'efface pas les précédents.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200: { description: Liste paginée }
 */
router.get(
  '/conversations/:conversationId/messages',
  ...canAct,
  asyncHandler(async (req, res) => {
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = parseInt((req.query.limit as string) || '50', 10);
    res.json(
      await conversationsService.getMessages(
        req.auth!.userId,
        req.params.conversationId,
        page,
        limit,
      ),
    );
  }),
);

/** Diffusion temps réel, hors du chemin d'erreur : un souci de socket ne doit
 *  pas faire échouer un message déjà enregistré. */
function broadcast(req: { app: { get: (k: string) => unknown } }, conversationId: string, message: unknown) {
  const io = req.app.get('io') as SocketServer | undefined;
  if (!io) return;
  try {
    emitNewMessage(io, conversationId, message);
  } catch {
    /* le message est en base : la diffusion est un confort, pas un contrat */
  }
}

/**
 * @openapi
 * /conversations/{conversationId}/messages:
 *   post:
 *     tags: [Messages]
 *     summary: Envoyer un message dans une conversation existante
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Message envoyé }
 *       403: { description: "Refusé : blocage, abonnement requis, ou message arrêté par la modération" }
 */
router.post(
  '/conversations/:conversationId/messages',
  ...canAct,
  requireSubscriptionForMessaging,
  validate(sendMessageSchema),
  asyncHandler(async (req, res) => {
    const message = await conversationsService.sendMessage(
      req.auth!.userId,
      req.params.conversationId,
      req.body.content,
    );
    broadcast(req, req.params.conversationId, message);
    res.status(201).json(message);
  }),
);

/**
 * @openapi
 * /conversations/with/{userId}/messages:
 *   post:
 *     tags: [Messages]
 *     summary: Écrire à un membre, en ouvrant la conversation si besoin
 *     description: |
 *       Chemin d'entrée de la messagerie ouverte : on écrit à une personne, pas
 *       à un match. La conversation est créée au premier message accepté.
 *
 *       **Hommes** : nécessite un abonnement actif si le système d'abonnement
 *       est activé. **Femmes** : gratuit et illimité.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Message envoyé }
 *       403: { description: "Refusé : blocage, abonnement requis, ou message arrêté par la modération" }
 *       404: { description: Profil introuvable ou inactif }
 */
router.post(
  '/conversations/with/:userId/messages',
  ...canAct,
  requireSubscriptionForMessaging,
  validate(sendMessageSchema),
  asyncHandler(async (req, res) => {
    const message = await conversationsService.sendMessageTo(
      req.auth!.userId,
      req.params.userId,
      req.body.content,
    );
    broadcast(req, message.conversationId, message);
    res.status(201).json(message);
  }),
);

export default router;
