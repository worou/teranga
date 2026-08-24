import { config } from './index';

/**
 * Longueur minimale d'un secret de signature. 32 caractères ≈ 192 bits une fois
 * encodés : en deçà, un HMAC devient attaquable hors ligne.
 * `openssl rand -base64 48` en produit un correct.
 */
const MIN_SECRET_LENGTH = 32;

interface SecretRule {
  env: string;
  value: string;
  why: string;
  minLength?: number;
}

/**
 * Secrets dont la valeur de repli est publique — elle est dans ce dépôt.
 *
 * Miroir de `frontoffice/src/config/preflight.ts`. La console d'administration
 * a plus à perdre encore : un jeton forgé y donne accès aux membres, aux
 * signalements et aux paiements.
 */
const SECRETS: SecretRule[] = [
  {
    env: 'JWT_SECRET',
    value: config.jwt.secret,
    why: "signe les jetons d'administration — au défaut, n'importe qui peut se forger un accès admin",
    minLength: MIN_SECRET_LENGTH,
  },
  {
    env: 'ADMIN_SECRET',
    value: config.adminSecret,
    why: "protège la création de comptes d'administration",
    minLength: MIN_SECRET_LENGTH,
  },
  {
    env: 'INTERNAL_API_SECRET',
    value: config.internalApiSecret,
    why: 'authentifie les actions relayées au frontoffice — doit être identique des deux côtés',
    minLength: MIN_SECRET_LENGTH,
  },
];

/**
 * Une valeur est-elle un placeholder plutôt qu'un vrai secret ?
 *
 * On ne compare pas seulement aux défauts codés en dur : les valeurs d'exemple
 * de `.env.example` sont, elles aussi, publiées dans ce dépôt. Recopier le
 * fichier d'exemple tel quel donnerait un secret que le monde entier peut lire,
 * tout en étant différent du défaut du code.
 */
function isPlaceholder(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v === '') return true;
  return (
    v.includes('change-me') ||
    v.includes('changeme') ||
    v.includes('change_me') ||
    v.startsWith('dev-') ||
    v.startsWith('admin-secret') ||
    v.includes('votre-') ||
    v.includes('your-')
  );
}

function checkSecret(rule: SecretRule): string | null {
  if (!process.env[rule.env]) return 'non défini';
  if (isPlaceholder(rule.value)) return "valeur d'exemple, publiée dans le dépôt";
  if (rule.minLength && rule.value.length < rule.minLength) {
    return `trop court (${rule.value.length} caractères, minimum ${rule.minLength})`;
  }
  return null;
}

/** Refuse de démarrer en production si un secret est absent, d'exemple ou trop court. */
export function assertProductionConfig(): void {
  if (config.env !== 'production') return;

  const problems: string[] = [];
  for (const rule of SECRETS) {
    const issue = checkSecret(rule);
    if (issue) problems.push(`  - ${rule.env} (${issue}) : ${rule.why}`);
  }

  if (problems.length > 0) {
    throw new Error(
      `Démarrage refusé — ${problems.length} variable(s) d'environnement à corriger :\n` +
        `${problems.join('\n')}\n` +
        `Générer un secret : openssl rand -base64 48 — voir .env.example.`,
    );
  }
}
