import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { paymentsService } from '../services/payments.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @openapi
 * /payments/webhook/cinetpay:
 *   post:
 *     tags: [Payments]
 *     summary: Webhook CinetPay (confirmation de paiement)
 *     description: |
 *       Endpoint **public** (pas d'auth Bearer) appelé par CinetPay après
 *       validation/refus du paiement. Active l'abonnement en cas de succès.
 *
 *       La vérification de signature doit être implémentée en production via
 *       HMAC (champ `x-token` dans les headers).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Payload CinetPay (cf. doc officielle)
 *     responses:
 *       200:
 *         description: Webhook traité
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 processed: { type: boolean }
 *                 status: { type: string, example: COMPLETED }
 */
router.post(
  '/cinetpay',
  asyncHandler(async (req, res) => {
    // TODO: verify HMAC signature via X-TOKEN header before processing
    logger.info('CinetPay webhook received', { headers: req.headers });
    const result = await paymentsService.handleWebhook(req.body);
    res.json(result);
  }),
);

export default router;
