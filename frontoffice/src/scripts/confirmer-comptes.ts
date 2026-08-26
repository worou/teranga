/**
 * Confirmation des comptes — outil d'exploitation.
 *
 * Un compte doit franchir DEUX portes indépendantes avant d'exister vraiment
 * sur le site, et les confondre est l'erreur qui coûte le plus cher ici :
 *
 *   1. CONFIRMATION  — la personne prouve qu'elle contrôle son e-mail (ou son
 *      téléphone) en saisissant un code. Le compte passe PENDING_VERIFICATION
 *      → ACTIVE. Elle peut se connecter.
 *   2. VALIDATION    — un administrateur approuve le profil. `isVerified`
 *      passe à true. Sans cette seconde porte, le compte est ACTIVE mais
 *      INVISIBLE : le fil de découverte filtre sur `isVerified: true`
 *      (discovery.service.ts) et l'ouverture d'un profil aussi
 *      (users.service.ts). La personne se connecte, ne voit personne, et
 *      personne ne la voit — sans le moindre message d'erreur.
 *
 * D'où `--tout`, qui franchit les deux : c'est presque toujours ce qu'on veut
 * quand on « confirme un compte » à la main.
 *
 * ─── Lancer ───────────────────────────────────────────────────────────────
 *   En production (sans ts-node, d'où l'emplacement sous src/) :
 *       cd ~/teranga/frontoffice && node dist/scripts/confirmer-comptes.js …
 *   En développement :
 *       npx ts-node --transpile-only src/scripts/confirmer-comptes.ts …
 *
 *   État des comptes (lecture seule) :
 *       … --etat
 *   Donner un code à quelqu'un qui n'a rien reçu :
 *       … --email awa@example.com --code --appliquer
 *   Confirmer et rendre visible :
 *       … --email awa@example.com --tout --appliquer
 *
 * ─── Sécurité ─────────────────────────────────────────────────────────────
 * L'outil SIMULE par défaut : il affiche ce qu'il changerait et ne touche à
 * rien tant que `--appliquer` n'est pas donné. Il exige aussi une cible
 * explicite. `--tous` existe mais n'est jamais le défaut : marquer en masse
 * des comptes `isVerified` contourne précisément la modération que ce drapeau
 * sert à imposer — sur un site de rencontres, c'est la porte ouverte aux faux
 * profils.
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { generateOtpCode } from '../utils/helpers';

// ——— Présentation ———
const c = {
  titre: (s: string) => `\n\x1b[1;33m▸ ${s}\x1b[0m`,
  ok: (s: string) => `  \x1b[0;32m✔\x1b[0m ${s}`,
  info: (s: string) => `  \x1b[0;36mi\x1b[0m ${s}`,
  alerte: (s: string) => `  \x1b[0;31m✘\x1b[0m ${s}`,
};

// ——— Arguments ———
const args = process.argv.slice(2);
const aDrapeau = (nom: string) => args.includes(`--${nom}`);
const valeur = (nom: string): string | null => {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};

const cible = {
  email: valeur('email'),
  tel: valeur('tel'),
  id: valeur('id'),
  tous: aDrapeau('tous'),
};
const action = {
  etat: aDrapeau('etat'),
  code: aDrapeau('code'),
  confirmer: aDrapeau('confirmer') || aDrapeau('tout'),
  valider: aDrapeau('valider') || aDrapeau('tout'),
};
const appliquer = aDrapeau('appliquer');

// Canal : quel drapeau de vérification poser. `verifyOtp` ne certifie que ce
// qui a été prouvé — un code reçu par e-mail n'atteste rien du téléphone. On
// reproduit cette asymétrie au lieu de poser les deux, sous peine de changer
// en douce la sémantique de vérification depuis un outil de maintenance.
const canal = (valeur('canal') || 'email') as 'email' | 'sms';
if (canal !== 'email' && canal !== 'sms') {
  console.error(c.alerte(`--canal doit valoir « email » ou « sms », reçu « ${canal} ».`));
  process.exit(1);
}

const AIDE = `
Confirmation des comptes Téranga

  CIBLE (obligatoire, une seule)
    --email <adresse>     le compte portant cette adresse
    --tel <numéro>        le compte portant ce téléphone
    --id <uuid>           le compte portant cet identifiant
    --tous                tous les comptes non confirmés ou non validés

  ACTION (au moins une)
    --etat                n'affiche que l'état, ne modifie rien
    --code                génère un code de confirmation valable 10 min
    --confirmer           PENDING_VERIFICATION → ACTIVE (porte 1)
    --valider             rend le compte visible : isVerified (porte 2)
    --tout                --confirmer et --valider

  OPTIONS
    --canal email|sms     quel drapeau poser avec --confirmer (défaut : email)
    --appliquer           exécute réellement. Sans lui : simulation.

  Exemples
    --etat
    --email awa@example.com --code --appliquer
    --email awa@example.com --tout --appliquer
`;

type Compte = {
  id: string;
  firstName: string;
  phone: string;
  email: string | null;
  status: string;
  isVerified: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: Date;
};

const CHAMPS = {
  id: true,
  firstName: true,
  phone: true,
  email: true,
  status: true,
  isVerified: true,
  emailVerified: true,
  phoneVerified: true,
  createdAt: true,
} as const;

/** Une ligne lisible : les deux portes, et ce qui manque. */
function ligne(u: Compte): string {
  const porte1 = u.status === 'ACTIVE' ? 'confirmé' : 'NON confirmé';
  const porte2 = u.isVerified ? 'visible' : 'INVISIBLE';
  const preuve = [u.emailVerified && 'e-mail', u.phoneVerified && 'tél'].filter(Boolean).join('+') || '—';
  return [
    '  ',
    (u.firstName || '?').padEnd(12),
    (u.email || u.phone).padEnd(30),
    porte1.padEnd(13),
    porte2.padEnd(10),
    `preuve:${preuve}`.padEnd(16),
    u.createdAt.toISOString().slice(0, 10),
  ].join(' ');
}

async function trouverCibles(): Promise<Compte[]> {
  if (cible.id) return prisma.user.findMany({ where: { id: cible.id }, select: CHAMPS });
  if (cible.email) return prisma.user.findMany({ where: { email: cible.email }, select: CHAMPS });
  if (cible.tel) return prisma.user.findMany({ where: { phone: cible.tel }, select: CHAMPS });
  // --tous et --etat : les comptes vivants, les plus récents d'abord.
  return prisma.user.findMany({
    where: { deletedAt: null },
    select: CHAMPS,
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Insère un code de confirmation valable 10 minutes et renvoie sa valeur en
 * clair — à transmettre à la personne par un canal sûr.
 *
 * Le code est stocké haché (bcrypt, coût 8), exactement comme le fait
 * `askOtp` : `verifyOtp` compare avec `bcrypt.compare`, un code en clair en
 * base ne serait jamais reconnu.
 *
 * Cet outil contourne délibérément la limite de 3 demandes par heure : elle
 * protège des abus côté public, elle n'a pas de sens pour une intervention
 * d'exploitation destinée précisément à débloquer quelqu'un.
 */
async function genererCode(u: Compte): Promise<string> {
  const code = generateOtpCode();
  await prisma.otpCode.create({
    data: {
      userId: u.id,
      phone: u.phone, // `verifyOtp` retrouve le code par téléphone, pas par id.
      code: await bcrypt.hash(code, 8),
      purpose: 'registration',
      channel: canal,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
  return code;
}

async function main() {
  if (args.length === 0 || aDrapeau('aide') || aDrapeau('help')) {
    console.log(AIDE);
    return;
  }

  const aUneCible = !!(cible.id || cible.email || cible.tel || cible.tous);
  const aUneAction = action.code || action.confirmer || action.valider;

  if (aUneAction && !aUneCible) {
    console.error(c.alerte('Aucune cible. Précisez --email, --tel, --id, ou --tous.'));
    console.error(AIDE);
    process.exit(1);
  }

  const comptes = await trouverCibles();
  if (comptes.length === 0) {
    console.log(c.alerte('Aucun compte ne correspond.'));
    return;
  }

  console.log(c.titre(`Comptes (${comptes.length})`));
  comptes.forEach((u) => console.log(ligne(u)));

  const invisibles = comptes.filter((u) => u.status === 'ACTIVE' && !u.isVerified).length;
  if (invisibles > 0) {
    console.log(
      c.info(
        `${invisibles} compte(s) confirmé(s) mais invisible(s) : connectables, ` +
          'absents du fil de découverte. --valider les rend visibles.',
      ),
    );
  }

  if (!aUneAction) return; // --etat, ou aucune action : lecture seule.

  // En mode --tous, on ne retouche que ce qui en a besoin : reposer un
  // drapeau déjà posé n'est pas dangereux, mais le journal deviendrait
  // illisible et masquerait ce qui a réellement changé.
  const aTraiter = cible.tous
    ? comptes.filter(
        (u) =>
          (action.confirmer && u.status !== 'ACTIVE') ||
          (action.valider && !u.isVerified) ||
          action.code,
      )
    : comptes;

  if (aTraiter.length === 0) {
    console.log(c.ok('Rien à faire : tous les comptes ciblés sont déjà en règle.'));
    return;
  }

  console.log(c.titre(appliquer ? 'Application' : 'Simulation — rien ne sera modifié'));

  for (const compte of aTraiter) {
    const qui = compte.email || compte.phone;
    const changements: string[] = [];

    if (action.confirmer && compte.status !== 'ACTIVE') {
      changements.push(`status → ACTIVE, ${canal === 'email' ? 'emailVerified' : 'phoneVerified'} → true`);
    }
    if (action.valider && !compte.isVerified) {
      changements.push('isVerified → true, verificationStatus → VERIFIED');
    }

    if (!appliquer) {
      if (action.code) changements.push('nouveau code de confirmation (10 min)');
      console.log(
        changements.length
          ? c.info(`${qui} : ${changements.join(' ; ')}`)
          : c.ok(`${qui} : rien à changer`),
      );
      continue;
    }

    // ——— Porte 1 : confirmation ———
    // Transition identique à `verifyOtp` (auth.service.ts), y compris
    // l'asymétrie e-mail / téléphone.
    if (action.confirmer && compte.status !== 'ACTIVE') {
      await prisma.user.update({
        where: { id: compte.id },
        data: {
          status: 'ACTIVE',
          ...(canal === 'email' ? { emailVerified: true } : { phoneVerified: true }),
        },
      });
      console.log(c.ok(`${qui} : confirmé (${canal})`));
    }

    // ——— Porte 2 : validation ———
    // `isVerified` et `verificationStatus` vont par paire, comme dans le
    // backoffice (users.routes.ts). Poser l'un sans l'autre produirait un
    // compte visible sur le site mais toujours « en attente » en modération —
    // un état qu'aucun chemin de l'application ne sait créer.
    if (action.valider && !compte.isVerified) {
      await prisma.user.update({
        where: { id: compte.id },
        data: { isVerified: true, verificationStatus: 'VERIFIED' },
      });
      console.log(c.ok(`${qui} : validé, désormais visible`));
    }

    // ——— Code de confirmation ———
    if (action.code) {
      const code = await genererCode(compte);
      console.log(c.ok(`${qui} : code ${code}  (valable 10 minutes, canal ${canal})`));
    }
  }

  if (!appliquer) {
    console.log(c.titre('Simulation'));
    console.log(c.info('Aucune modification. Ajoutez --appliquer pour exécuter.'));
  }
}

main()
  .catch((e) => {
    console.error(c.alerte(e instanceof Error ? e.message : String(e)));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
