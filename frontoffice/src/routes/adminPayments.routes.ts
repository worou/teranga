import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireInternalSecret } from '../middleware/internalAuth';
import { paymentsService } from '../services/payments.service';

/**
 * Endpoints admin INTERNES (backoffice → frontoffice, serveur à serveur).
 *
 * Servent la validation manuelle des virements bancaires : le backoffice
 * (où réside l'authentification admin) relaie l'action ici pour réutiliser la
 * logique canonique d'activation d'abonnement du paymentsService. Protégés par
 * un secret partagé (cf. requireInternalSecret), jamais exposés au public.
 */
const router = Router();
router.use(requireInternalSecret);

/** POST /api/v1/admin/payments/:id/confirm — valide un virement reçu. */
router.post(
  '/payments/:id/confirm',
  asyncHandler(async (req, res) => {
    const result = await paymentsService.confirmBankTransfer(req.params.id);
    res.json(result);
  }),
);

/** POST /api/v1/admin/payments/:id/reject — rejette un virement non reçu. */
router.post(
  '/payments/:id/reject',
  asyncHandler(async (req, res) => {
    const result = await paymentsService.rejectBankTransfer(req.params.id, req.body?.reason);
    res.json(result);
  }),
);

export default router;
