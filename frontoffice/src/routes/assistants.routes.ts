import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { assistantsService } from '../services/assistants.service';
import { consultationsService } from '../services/consultations.service';
import { z } from 'zod';
import { validate } from '../middleware/validate';

const router = Router();

/** La note est facultative, et bornée : c'est un besoin, pas un dossier. */
const demandeSchema = z.object({
  assistantId: z.string().min(1),
  note: z.string().max(1000).optional(),
  /** Défaut : la semaine, seule formule toujours proposée. */
  formule: z.enum(['semaine', 'mois']).optional(),
});

/**
 * Les assistants, côté membre.
 *
 * Réservé aux membres connectés (`requireAuth`) : la liste porte des personnes
 * avec leur photo et leur tarif, elle n'a pas à être moissonnée par n'importe
 * qui. Ce n'est pas `requireCompleteProfile` en revanche — quelqu'un dont le
 * profil coince est précisément celui qui a besoin d'un conseil.
 *
 * Aucune coordonnée n'est servie ici, quel que soit l'appelant : le téléphone
 * et le WhatsApp ne sortent que par la consultation confirmée de leur membre.
 *
 * ⚠️ Le garde est monté SUR SES CHEMINS, pas sur le routeur. Ce routeur est
 * monté sur le préfixe `/api/v1` : un `router.use(requireAuth)` sans chemin
 * s'applique alors à TOUTE requête qui le traverse, y compris celles destinées
 * aux routeurs déclarés après lui — qui répondent 401 sans jamais être
 * atteints. Le tunnel d'abonnement s'était déjà fait prendre ainsi, et avait
 * tué quatre familles de routes.
 */
router.use(['/assistants', '/consultations'], requireAuth);

/**
 * @openapi
 * /assistants:
 *   get:
 *     tags: [Assistants]
 *     summary: Lister les assistants disponibles
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: gender
 *         schema: { type: string, enum: [FEMALE, MALE] }
 *         description: Filtrer par genre de l'assistant
 *     responses:
 *       200:
 *         description: Liste des assistants, sans leurs coordonnées
 */
router.get(
  '/assistants',
  asyncHandler(async (req, res) => {
    // Seuls deux genres sont proposés au filtre — c'est ce que demande le
    // service : « un assistant, homme ou femme ». Toute autre valeur est
    // ignorée plutôt que refusée : un filtre inconnu doit tout montrer, pas
    // faire échouer l'écran.
    const brut = String(req.query.gender || '').toUpperCase();
    const gender = brut === 'FEMALE' || brut === 'MALE' ? brut : undefined;

    const data = await assistantsService.list({ gender });
    res.json({ data });
  }),
);

/**
 * @openapi
 * /assistants/{id}:
 *   get:
 *     tags: [Assistants]
 *     summary: Fiche d'un assistant
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "Fiche, sans coordonnées" }
 *       404: { description: "Assistant introuvable" }
 */
router.get(
  '/assistants/:id',
  asyncHandler(async (req, res) => {
    res.json(await assistantsService.get(req.params.id));
  }),
);

/**
 * @openapi
 * /consultations:
 *   get:
 *     tags: [Assistants]
 *     summary: Mes demandes de consultation
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: |
 *           Les coordonnées de l'assistant ne sont présentes que sur une
 *           consultation confirmée et non échue.
 */
router.get(
  '/consultations',
  asyncHandler(async (req, res) => {
    res.json({ data: await consultationsService.listForUser(req.auth!.userId) });
  }),
);

/**
 * @openapi
 * /consultations:
 *   post:
 *     tags: [Assistants]
 *     summary: Demander une consultation
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: "Demande enregistrée, en attente de validation" }
 *       404: { description: "Assistant indisponible" }
 *       409: { description: "Demande déjà en cours avec cet assistant" }
 */
router.post(
  '/consultations',
  validate(demandeSchema),
  asyncHandler(async (req, res) => {
    const c = await consultationsService.request(
      req.auth!.userId,
      req.body.assistantId,
      req.body.note,
      req.body.formule ?? 'semaine',
    );
    res.status(201).json(c);
  }),
);

/**
 * @openapi
 * /consultations/{id}:
 *   delete:
 *     tags: [Assistants]
 *     summary: Annuler une demande en attente
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "Annulée" }
 *       400: { description: "Seule une demande en attente peut être annulée" }
 */
router.delete(
  '/consultations/:id',
  asyncHandler(async (req, res) => {
    res.json(await consultationsService.cancel(req.auth!.userId, req.params.id));
  }),
);

export default router;
