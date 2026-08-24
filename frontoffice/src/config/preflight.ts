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
  /** Longueur minimale exigée. Omise pour les secrets purement partagés. */
  minLength?: number;
}

/**
 * Secrets dont la valeur de repli est publique — elle est dans ce dépôt.
 *
 * En développement, ces défauts rendent le projet démarrable sans rien
 * configurer, ce qui est le but. En production, ils sont l'équivalent d'une
 * porte sans serrure : `JWT_SECRET` laissé au défaut permet à quiconque a lu
 * le code de forger un jeton pour n'importe quel compte.
 *
 * `internalAuth.ts` posait déjà ce contrôle pour le secret interne, mais par
 * requête. Un serveur qui démarre avec une clé de signature connue ne doit pas
 * démarrer du tout.
 */
const SECRETS: SecretRule[] = [
  {
    env: 'JWT_SECRET',
    value: config.jwt.secret,
    why: "signe les jetons d'authentification — au défaut, n'importe qui peut se faire passer pour n'importe quel membre",
    minLength: MIN_SECRET_LENGTH,
  },
  {
    env: 'INTERNAL_API_SECRET',
    value: config.internalApiSecret,
    why: 'autorise les actions admin venues du backoffice (validation de virement)',
    minLength: MIN_SECRET_LENGTH,
  },
];

/**
 * Une valeur est-elle un placeholder plutôt qu'un vrai secret ?
 *
 * On ne compare pas seulement aux défauts codés en dur : les valeurs
 * d'exemple de `.env.example` sont, elles aussi, publiées dans ce dépôt.
 * Recopier le fichier d'exemple tel quel donnerait un secret que le monde
 * entier peut lire, tout en étant différent du défaut du code. D'où la règle
 * par motif, qui couvre les deux cas et ceux qu'on ajoutera demain.
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

/** Décrit ce qui cloche avec un secret, ou `null` s'il est acceptable. */
function checkSecret(rule: SecretRule): string | null {
  if (!process.env[rule.env]) return 'non défini';
  if (isPlaceholder(rule.value)) return 'valeur d\'exemple, publiée dans le dépôt';
  if (rule.minLength && rule.value.length < rule.minLength) {
    return `trop court (${rule.value.length} caractères, minimum ${rule.minLength})`;
  }
  return null;
}

/**
 * Refuse de démarrer en production si un secret est absent, resté à sa valeur
 * d'exemple, ou trop court.
 *
 * Tous les problèmes sont listés d'un coup : corriger une variable par
 * redémarrage successif est pénible et fait perdre du temps en déploiement.
 */
export function assertProductionConfig(): void {
  if (config.env !== 'production') return;

  const problems: string[] = [];
  for (const rule of SECRETS) {
    const issue = checkSecret(rule);
    if (issue) problems.push(`  - ${rule.env} (${issue}) : ${rule.why}`);
  }

  if (config.database.url === '') {
    problems.push('  - DATABASE_URL (non défini) : aucune base configurée');
  }

  if (problems.length > 0) {
    throw new Error(
      `Démarrage refusé — ${problems.length} variable(s) d'environnement à corriger :\n` +
        `${problems.join('\n')}\n` +
        `Générer un secret : openssl rand -base64 48 — voir .env.example.`,
    );
  }
}

/**
 * Avertissements de configuration : ne bloquent pas le démarrage, mais
 * signalent un déploiement qui se comportera mal.
 */
export function warnProductionConfig(): string[] {
  if (config.env !== 'production') return [];
  const warnings: string[] = [];

  // Sans `trust proxy`, express-rate-limit voit l'adresse du proxy et non celle
  // du client : tous les utilisateurs partagent alors un seul compteur.
  if (config.trustProxy === 0) {
    warnings.push(
      "TRUST_PROXY vaut 0 : si l'application est derrière un reverse proxy, la " +
        'limitation de débit comptera tous les utilisateurs comme un seul.',
    );
  }

  if (!process.env.CORS_ORIGIN) {
    warnings.push(
      "CORS_ORIGIN n'est pas défini : le repli vise localhost. Sans effet si le " +
        "client est servi par ce même serveur, bloquant s'il est hébergé ailleurs.",
    );
  }

  return warnings;
}
