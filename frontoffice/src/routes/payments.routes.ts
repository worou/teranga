import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { requireAuth, requireSubscriptionsEnabled } from '../middleware/auth';
import { subscriptionsService } from '../services/subscriptions.service';
import { paymentsService } from '../services/payments.service';
import { subscribeSchema } from '../validators';

const router = Router();

/**
 * Le tunnel d'abonnement n'existe que si le système est activé.
 *
 * LES CHEMINS SONT OBLIGATOIRES ICI, et c'est tout le sujet. Ce garde vivait
 * dans `server.ts`, monté sur le préfixe : `app.use('/api/v1', garde, routeur)`
 * l'applique à TOUTES les requêtes du préfixe, pas aux seules routes du
 * routeur. Abonnements désactivés, il appelait `next(erreur)` et tuait tout ce
 * qui était monté après — `/events`, `/moderation`, `/trusted-circle` et
 * `/notifications` répondaient « L'abonnement n'est pas disponible », sans le
 * moindre rapport avec ce qu'on leur demandait.
 *
 * Le déplacer ici en `router.use(garde)` SANS chemin ne changeait rien : un
 * routeur monté sur `/api/v1` est traversé par toutes les requêtes du préfixe,
 * qu'une de ses routes corresponde ou non. Il fallait nommer ce que ce fichier
 * possède.
 */
router.use(['/pricing', '/subscriptions', '/payments'], requireSubscriptionsEnabled);

/**
 * @openapi
 * /pricing:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Catalogue des formules d'abonnement
 *     description: Public, accessible sans authentification.
 *     responses:
 *       200:
 *         description: Catalogue
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PricingCatalog' }
 */
router.get(
  '/pricing',
  asyncHandler(async (_req, res) => {
    res.json(paymentsService.getCatalog());
  }),
);

// Auth required for the rest
router.use(requireAuth);

/**
 * @openapi
 * /payments/methods:
 *   get:
 *     tags: [Payments]
 *     summary: Moyens de paiement disponibles dans mon pays
 *     description: |
 *       Retourne la liste des opérateurs mobile money (Orange Money, Wave, MTN,
 *       Moov, Free Money, Wizall…) réellement disponibles dans le pays de
 *       l'utilisateur, plus la carte bancaire. Zone F CFA (UEMOA) uniquement.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Liste des moyens de paiement
 */
router.get(
  '/payments/methods',
  asyncHandler(async (req, res) => {
    const methods = await paymentsService.getMethodsForUser(req.auth!.userId);
    res.json(methods);
  }),
);

/**
 * @openapi
 * /subscriptions/me:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Mon abonnement actuel
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Détails
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Subscription' }
 */
router.get(
  '/subscriptions/me',
  asyncHandler(async (req, res) => {
    const sub = await subscriptionsService.getMySubscription(req.auth!.userId);
    res.json(sub);
  }),
);

/**
 * @openapi
 * /subscriptions/me/cancel:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Annuler le renouvellement de mon abonnement
 *     description: |
 *       Stoppe le renouvellement automatique. L'accès reste actif jusqu'à la date
 *       d'expiration.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Renouvellement annulé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Subscription' }
 */
router.post(
  '/subscriptions/me/cancel',
  asyncHandler(async (req, res) => {
    const result = await subscriptionsService.cancel(req.auth!.userId);
    res.json(result);
  }),
);

/**
 * @openapi
 * /payments/subscribe:
 *   post:
 *     tags: [Payments]
 *     summary: Souscrire à un abonnement (initie le paiement)
 *     description: |
 *       Initie un paiement via CinetPay. Selon le moyen choisi :
 *       - **Mobile Money** (Orange Money, Wave, MTN, Moov, M-Pesa, Airtel) : une
 *         demande USSD est envoyée au numéro fourni. L'utilisateur doit valider
 *         avec son code PIN.
 *       - **Carte bancaire** : retourne une `paymentUrl` à ouvrir dans un
 *         navigateur pour saisir les détails de la carte.
 *       - **Facturation opérateur** : débit direct sur le crédit télécom.
 *
 *       L'abonnement est activé dès réception du webhook de confirmation.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/SubscribeRequest' }
 *     responses:
 *       201:
 *         description: Paiement initié
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PaymentInitResponse' }
 *       400: { description: "Initiation échouée" }
 */
router.post(
  '/payments/subscribe',
  validate(subscribeSchema),
  asyncHandler(async (req, res) => {
    const result = await paymentsService.initiate(
      req.auth!.userId,
      req.body.plan,
      req.body.method,
      req.body.phoneNumber,
      req.body.autoRenew,
    );
    res.status(201).json(result);
  }),
);

/**
 * @openapi
 * /payments/me:
 *   get:
 *     tags: [Payments]
 *     summary: Historique de mes paiements
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Liste
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Payment' }
 */
router.get(
  '/payments/me',
  asyncHandler(async (req, res) => {
    const payments = await paymentsService.listForUser(req.auth!.userId);
    res.json(payments);
  }),
);

/**
 * @openapi
 * /payments/{paymentId}/status:
 *   get:
 *     tags: [Payments]
 *     summary: Vérifier le statut d'un paiement (polling fallback)
 *     description: |
 *       À utiliser si l'application n'a pas reçu le webhook de confirmation.
 *       Interroge CinetPay pour obtenir le statut courant.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Statut
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Payment' }
 */
router.get(
  '/payments/:paymentId/status',
  asyncHandler(async (req, res) => {
    const payment = await paymentsService.checkStatus(req.auth!.userId, req.params.paymentId);
    res.json(payment);
  }),
);

export default router;
