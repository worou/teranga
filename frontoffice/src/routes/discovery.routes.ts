import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { optionalAuth, requireAuth, requireCompleteProfile } from '../middleware/auth';
import { discoveryService } from '../services/discovery.service';
import { discoveryFiltersSchema, likeSchema } from '../validators';

const router = Router();

/**
 * Gardes posées **par route**, plus globalement : la consultation est publique,
 * l'interaction ne l'est pas.
 *
 *   - `GET /discovery/feed` — `optionalAuth` : un visiteur voit les profils.
 *   - like et pass — `requireAuth` + `requireCompleteProfile` : agir suppose un
 *     compte, et un compte complet.
 *
 * `requireCompleteProfile` est volontairement absent du fil : un membre à deux
 * photos ne doit pas être moins bien traité qu'un inconnu de passage.
 *
 * La messagerie a quitté ce routeur : voir `conversations.routes.ts`.
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
 *       Enregistre un like — un signal d'intérêt, et rien de plus. Il n'ouvre
 *       aucune conversation : la messagerie est accessible à tout membre sans
 *       accord préalable. La réponse indique si l'intérêt est réciproque.
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
/**
 * @openapi
 * /discovery/favorites:
 *   get:
 *     tags: [Discovery]
 *     summary: Mes favoris — les profils que j'ai aimés
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: "Liste paginée, du plus récent au plus ancien" }
 */
router.get(
  '/discovery/favorites',
  ...canAct,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    res.json(await discoveryService.getFavorites(req.auth!.userId, page, limit));
  }),
);

/**
 * @openapi
 * /discovery/like/{receiverId}:
 *   delete:
 *     tags: [Discovery]
 *     summary: Retirer un profil de mes favoris
 *     description: |
 *       Idempotent : retirer ce qui n'y est pas renvoie 200, pas 404. Un
 *       double-clic ne doit pas produire une erreur.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: receiverId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: "Retiré" }
 */
router.delete(
  '/discovery/like/:receiverId',
  ...canAct,
  asyncHandler(async (req, res) => {
    res.json(await discoveryService.unlike(req.auth!.userId, req.params.receiverId));
  }),
);

router.post(
  '/discovery/pass',
  ...canAct,
  asyncHandler(async (req, res) => {
    const result = await discoveryService.pass(req.auth!.userId, req.body.receiverId);
    res.json(result);
  }),
);


export default router;
