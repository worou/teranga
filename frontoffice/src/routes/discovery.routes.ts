import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import {
  optionalAuth,
  requireAuth,
  requireCompleteProfile,
  requireSubscriptionForMessaging,
} from '../middleware/auth';
import { discoveryService } from '../services/discovery.service';
import { matchesService } from '../services/matches.service';
import { discoveryFiltersSchema, likeSchema, sendMessageSchema } from '../validators';

const router = Router();

/**
 * Gardes posées **par route**, plus globalement : la consultation est publique,
 * l'interaction ne l'est pas.
 *
 *   - `GET /discovery/feed` — `optionalAuth` : un visiteur voit les profils.
 *   - tout le reste (like, pass, matchs, messages) — `requireAuth` +
 *     `requireCompleteProfile` : agir suppose un compte, et un compte complet.
 *
 * `requireCompleteProfile` est volontairement absent du fil : un membre à deux
 * photos ne doit pas être moins bien traité qu'un inconnu de passage.
 */
const canAct = [requireAuth, requireCompleteProfile];

/**
 * @openapi
 * /discovery/feed:
 *   get:
 *     tags: [Discovery]
 *     summary: Obtenir le fil de profils à découvrir
 *     description: |
 *       Retourne une liste de profils pertinents, excluant :
 *       - L'utilisateur lui-même
 *       - Les utilisateurs déjà likés / passés
 *       - Les utilisateurs bloqués ou qui vous ont bloqué
 *
 *       **Limitations free-tier pour les hommes** : 10 profils max / jour.
 *
 *       **Consultable sans être connecté.** Un visiteur anonyme obtient la même
 *       liste, sans score de compatibilité ni traits communs (il n'y a personne
 *       à qui le comparer) et sans genre cible par défaut. Interagir — liker,
 *       matcher, écrire — exige en revanche un compte.
 *     security: [{ bearerAuth: [] }, {}]
 *     parameters:
 *       - in: query
 *         name: minAge
 *         schema: { type: integer, example: 25 }
 *       - in: query
 *         name: maxAge
 *         schema: { type: integer, example: 40 }
 *       - in: query
 *         name: city
 *         schema: { type: string, example: Dakar }
 *       - in: query
 *         name: country
 *         schema: { type: string, example: SN }
 *       - in: query
 *         name: religion
 *         schema: { type: string, enum: [CHRISTIAN, MUSLIM, OTHER, UNDISCLOSED] }
 *       - in: query
 *         name: intent
 *         schema: { type: string, enum: [SERIOUS_RELATIONSHIP, MARRIAGE, FAMILY] }
 *       - in: query
 *         name: hasChildren
 *         schema: { type: boolean }
 *       - in: query
 *         name: profession
 *         description: Filtre partiel sur la profession.
 *         schema: { type: string, example: Médecin }
 *       - in: query
 *         name: q
 *         description: Recherche plein-texte (prénom, profession, bio, ville).
 *         schema: { type: string, example: pharma }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *     responses:
 *       200:
 *         description: Liste de profils
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/DiscoveryProfile' }
 *       403: { description: "Limite quotidienne atteinte" }
 */
router.get(
  '/discovery/feed',
  optionalAuth,
  validate(discoveryFiltersSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { limit, ...filters } = req.query as any;
    // `optionalAuth` : `req.auth` est absent pour un visiteur non connecté.
    const profiles = await discoveryService.getFeed(req.auth?.userId ?? null, filters, limit);
    res.json(profiles);
  }),
);

/**
 * @openapi
 * /discovery/like:
 *   post:
 *     tags: [Discovery]
 *     summary: Liker un profil
 *     description: |
 *       Enregistre un like. Si la personne vous a déjà liké, c'est un **match** —
 *       la messagerie s'ouvre alors.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/LikeRequest' }
 *     responses:
 *       200:
 *         description: Like enregistré
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/LikeResponse' }
 */
router.post(
  '/discovery/like',
  ...canAct,
  validate(likeSchema),
  asyncHandler(async (req, res) => {
    const result = await discoveryService.like(
      req.auth!.userId,
      req.body.receiverId,
      req.body.isSuperLike,
    );
    res.json(result);
  }),
);

/**
 * @openapi
 * /discovery/pass:
 *   post:
 *     tags: [Discovery]
 *     summary: Passer un profil (refuser)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [receiverId]
 *             properties:
 *               receiverId: { type: string, format: uuid }
 *     responses:
 *       200: { description: "Profil passé" }
 */
router.post(
  '/discovery/pass',
  ...canAct,
  asyncHandler(async (req, res) => {
    const result = await discoveryService.pass(req.auth!.userId, req.body.receiverId);
    res.json(result);
  }),
);

/**
 * @openapi
 * /matches:
 *   get:
 *     tags: [Matches]
 *     summary: Lister mes matches
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Liste paginée
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/PaginatedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Match' }
 */
router.get(
  '/matches',
  ...canAct,
  asyncHandler(async (req, res) => {
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = parseInt((req.query.limit as string) || '20', 10);
    const result = await matchesService.getMatches(req.auth!.userId, page, limit);
    res.json(result);
  }),
);

/**
 * @openapi
 * /matches/{matchId}:
 *   delete:
 *     tags: [Matches]
 *     summary: Unmatch (rompre le match)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: matchId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: "Unmatched" }
 */
router.delete(
  '/matches/:matchId',
  ...canAct,
  asyncHandler(async (req, res) => {
    const result = await matchesService.unmatch(req.auth!.userId, req.params.matchId);
    res.json(result);
  }),
);

/**
 * @openapi
 * /matches/{matchId}/messages:
 *   get:
 *     tags: [Messages]
 *     summary: Lister les messages d'un match
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: matchId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Liste des messages (du plus ancien au plus récent)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/PaginatedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Message' }
 */
router.get(
  '/matches/:matchId/messages',
  ...canAct,
  asyncHandler(async (req, res) => {
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const result = await matchesService.getMessages(req.auth!.userId, req.params.matchId, page, limit);
    res.json(result);
  }),
);

/**
 * @openapi
 * /matches/{matchId}/messages:
 *   post:
 *     tags: [Messages]
 *     summary: Envoyer un message
 *     description: |
 *       **Hommes** : nécessite un abonnement actif.
 *       **Femmes** : gratuit et illimité.
 *
 *       Chaque message passe par l'IA anti-brouteur. Un message détecté comme
 *       demande d'argent ou harcèlement est bloqué et l'expéditeur est signalé
 *       à la modération.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: matchId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/SendMessageRequest' }
 *     responses:
 *       201:
 *         description: Message envoyé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Message' }
 *       403:
 *         description: Message bloqué (abonnement requis ou détecté comme brouteur)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post(
  '/matches/:matchId/messages',
  ...canAct,
  requireSubscriptionForMessaging,
  validate(sendMessageSchema),
  asyncHandler(async (req, res) => {
    const message = await matchesService.sendMessage(
      req.auth!.userId,
      req.params.matchId,
      req.body.content,
    );
    res.status(201).json(message);
  }),
);

export default router;
