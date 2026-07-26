/**
 * Amorçage du jeu de test — DOIT être importé avant tout module de `src/`.
 *
 * Trois substitutions, faites via le cache de modules CommonJS pour n'exiger
 * aucune modification du code de production :
 *   1. `src/config/prisma` → double en mémoire (aucune base requise) ;
 *   2. `axios`             → simulateur CinetPay (aucun appel réseau) ;
 *   3. `src/utils/logger`  → silencieux (mettre TEST_LOGS=1 pour les voir).
 *
 * Les variables d'environnement sont posées ici, AVANT le premier `require` de
 * `src/config`. `dotenv.config()` n'écrase jamais une variable déjà définie :
 * le `.env` de développement (NODE_ENV=development, sans clés CinetPay) ne peut
 * donc pas nous renvoyer dans la branche « mock dev » du service — on teste
 * bien la branche de production (HMAC + contrôle du montant).
 */

/* eslint-disable @typescript-eslint/no-var-requires */
import { fakePrisma } from './fakePrisma';
import { fakeAxios } from './cinetpayMock';

process.env.NODE_ENV = 'test';
process.env.CINETPAY_API_KEY = 'test-api-key';
process.env.CINETPAY_SITE_ID = '999999';
process.env.CINETPAY_SECRET_KEY = 'test-secret-key';
process.env.CINETPAY_NOTIFY_URL = 'https://api.teranga.test/api/v1/payments/webhook/cinetpay';
process.env.CINETPAY_RETURN_URL = 'https://app.teranga.test/abonnement/retour';
process.env.API_BASE_URL = 'https://api.teranga.test';
process.env.SUB_REMINDER_DAYS_BEFORE = '3';
process.env.SUB_RENEW_PATH = '/abonnement';
// Base déterministe : virement bancaire NON configuré par défaut (indépendant
// du .env local du développeur). Les tests qui l'exercent l'activent via
// config.bankTransfer. `dotenv` n'écrasant pas une variable déjà définie, poser
// une chaîne vide ici neutralise tout BANK_TRANSFER_* présent dans le .env.
process.env.BANK_TRANSFER_BENEFICIARY = '';
process.env.BANK_TRANSFER_IBAN = '';
process.env.BANK_TRANSFER_BIC = '';
process.env.BANK_TRANSFER_BANK = '';
// Email marchand PayPal déterministe pour les tests (indépendant du .env local,
// et n'expose aucun email réel).
process.env.PAYPAL_EMAIL = 'merchant@example.com';

/** Clé secrète utilisée pour signer les webhooks dans les tests. */
export const TEST_SECRET_KEY = 'test-secret-key';

/** Remplace un module par un faux, avant que quiconque ne le charge. */
function stubModule(request: string, exports: unknown) {
  const resolved = require.resolve(request);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    path: resolved,
    loaded: true,
    children: [],
    paths: [],
    exports,
  } as unknown as NodeJS.Module;
}

const silentLogger = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };

stubModule('../../src/config/prisma', { prisma: fakePrisma, default: fakePrisma });
stubModule('axios', fakeAxios);
if (process.env.TEST_LOGS !== '1') {
  stubModule('../../src/utils/logger', { logger: silentLogger });
}

// `config` est chargé APRÈS les variables d'environnement ci-dessus.
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const config = require('../../src/config').config as typeof import('../../src/config').config;

// Garde-fou : si une substitution échouait, les tests taperaient sur la vraie
// base / le vrai CinetPay. Mieux vaut un échec immédiat et lisible.
if (require('../../src/config/prisma').prisma !== fakePrisma) {
  throw new Error('setup: la substitution de src/config/prisma a échoué');
}
if (config.env !== 'test' || !config.cinetpay.apiKey) {
  throw new Error('setup: configuration de test non appliquée (NODE_ENV / clés CinetPay)');
}

/**
 * Exécute `fn` avec des surcharges temporaires de `config` (objet mutable),
 * puis restaure. Sert notamment à couvrir la branche « mock dev ».
 */
export async function withConfig(
  overrides: { env?: string; cinetpay?: Partial<typeof config.cinetpay> },
  fn: () => Promise<void>,
) {
  const prevEnv = config.env;
  const prevCinetpay = { ...config.cinetpay };
  if (overrides.env !== undefined) (config as any).env = overrides.env;
  Object.assign(config.cinetpay, overrides.cinetpay || {});
  try {
    await fn();
  } finally {
    (config as any).env = prevEnv;
    Object.assign(config.cinetpay, prevCinetpay);
  }
}
