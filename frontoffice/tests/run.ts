/**
 * Point d'entrée du jeu de test des modules Abonnement & Paiement mobile.
 *
 *   npm test                    → toute la suite
 *   TEST_LOGS=1 npm test        → avec les logs applicatifs
 *
 * L'ordre des imports compte : `helpers/setup` substitue Prisma, axios et le
 * logger AVANT que le moindre module de `src/` ne soit chargé.
 */
import './helpers/setup';

import './cinetpayHmac.test';
import './orangeSms.test';
import './twilioSms.test';
import './paypal.test';
import './paypalIpn.test';
import './registerValidation.test';
import './profilePhotos.test';
import './subscriptionsFlag.test';
import './discoveryFilters.test';
import './profileEdit.test';
import './mobileMoney.test';
import './payments.initiate.test';
import './bankTransfer.test';
import './payments.webhook.test';
import './payments.status.test';
import './subscriptions.service.test';
import './subscriptionLifecycle.test';
