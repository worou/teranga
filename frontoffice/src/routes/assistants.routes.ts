import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { assistantsService } from '../services/assistants.service';

const router = Router();

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
 */
router.use(requireAuth);

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

export default router;
