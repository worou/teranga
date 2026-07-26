import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { paymentsService } from '../services/payments.service';
import { config } from '../config';
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
    // La signature HMAC (en-tête x-token) est vérifiée dans le service.
    const xToken = (req.header('x-token') || req.header('X-TOKEN')) ?? undefined;
    logger.info('CinetPay webhook received', { hasToken: !!xToken });
    const result = await paymentsService.handleWebhook(req.body, xToken);
    res.json(result);
  }),
);

/**
 * Simulateur de page de paiement CinetPay — **développement uniquement**.
 * Ouvert par le client à la place de la vraie page CinetPay (carte / mobile
 * money) ; confirme le paiement via le vrai webhook, puis redirige.
 */
router.get(
  '/cinetpay/mock',
  asyncHandler(async (req, res) => {
    if (config.env !== 'development') {
      res.status(404).send('Introuvable');
      return;
    }
    const ref = String(req.query.ref || '');
    await paymentsService.mockCinetPayComplete(ref);
    res.redirect(`${config.corsOrigin[0]}/abonnement?paid=1&ref=${ref}`);
  }),
);

/**
 * @openapi
 * /payments/webhook/paypal:
 *   post:
 *     tags: [Payments]
 *     summary: Webhook IPN PayPal (confirmation de paiement)
 *     description: |
 *       Endpoint **public** appelé par PayPal (Paiements Standard). Le corps
 *       brut est renvoyé à PayPal pour validation avant activation.
 *     responses:
 *       200: { description: "IPN reçue" }
 */
router.post(
  '/paypal',
  asyncHandler(async (req, res) => {
    // Corps brut requis pour la validation (renvoi inchangé à PayPal).
    const rawBody = (req as any).rawBody
      ? (req as any).rawBody.toString('utf8')
      : new URLSearchParams(req.body as Record<string, string>).toString();
    logger.info('PayPal IPN received', { txn: req.body?.txn_id });
    await paymentsService.handlePayPalIpn(req.body, rawBody);
    // PayPal attend un simple 200 (corps vide).
    res.sendStatus(200);
  }),
);

/**
 * Simulateur de paiement PayPal — **développement uniquement**. Ouvert par le
 * client à la place de la vraie page PayPal ; déclenche une IPN simulée via le
 * vrai chemin de traitement, puis redirige vers l'écran d'abonnement.
 */
router.get(
  '/paypal/mock',
  asyncHandler(async (req, res) => {
    if (config.env !== 'development') {
      res.status(404).send('Introuvable');
      return;
    }
    const pid = String(req.query.pid || '');
    await paymentsService.mockPayPalComplete(pid);
    res.redirect(`${config.paypal.returnUrl}&pid=${pid}`);
  }),
);

export default router;
