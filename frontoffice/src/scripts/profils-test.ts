/**
 * Profils de test — création et suppression.
 *
 * Dix comptes complets (profil + deux photos chacun), visibles dans le fil de
 * découverte, pour travailler sur l'interface sans dépendre d'inscriptions
 * réelles.
 *
 * ─── CE QUI REND CES COMPTES SUPPRIMABLES ─────────────────────────────────
 *
 * Tout repose sur une marque unique : l'adresse e-mail se termine par
 * `@teranga.test`. Le TLD `.test` est réservé par la RFC 2606 — aucun domaine
 * réel ne peut le porter, donc aucun membre réel ne peut porter cette adresse.
 * `--supprimer` filtre EXACTEMENT là-dessus, jamais sur « les dix derniers
 * inscrits » ni sur une liste de prénoms : un compte réel qui s'appellerait
 * Awa Diop ne risque rien.
 *
 * Trois autres garde-fous, parce qu'un profil de test qui fuit vers la
 * production est une fausse fiche sur un site de rencontres :
 *   — les photos portent « PROFIL DE TEST » en toutes lettres ;
 *   — la biographie se termine par la même mention ;
 *   — les fichiers s'appellent `profil-test-*.webp` dans `uploads/`.
 *
 * Ce préfixe n'est pas qu'une commodité de lecture : `--supprimer` s'en sert
 * en second passage. Une création interrompue entre l'écriture de l'image et
 * l'insertion en base laisserait un fichier que plus aucune ligne Photo ne
 * désigne, et qu'un nettoyage guidé par la base ne pourrait pas voir.
 *
 * ─── LES PHOTOS ───────────────────────────────────────────────────────────
 *
 * Ce ne sont pas des portraits : ce sont des aplats dégradés aux couleurs de
 * la marque, portant les initiales. C'est délibéré. Mettre le visage d'une
 * personne réelle sur un profil fabriqué est précisément ce que le reste du
 * code s'interdit (voir `client/src/components/HeroSlideshow.tsx`), et une
 * photo d'illustration récupérée en ligne finit toujours par ressembler à un
 * vrai membre. Une image générée ne trompe personne.
 *
 * Elles sont fabriquées par `ffmpeg`, à la demande, et seulement si le fichier
 * manque. Sans `ffmpeg` sur la machine, les comptes sont créés quand même,
 * sans photo, et le script le dit.
 *
 * ─── Lancer ───────────────────────────────────────────────────────────────
 *   En développement :
 *       cd frontoffice
 *       npx ts-node --transpile-only src/scripts/profils-test.ts --etat
 *   En production (sans ts-node — d'où l'emplacement sous src/) :
 *       node dist/scripts/profils-test.js --etat
 *
 *   Voir ce qui existe (lecture seule) :
 *       … --etat
 *   Créer les dix comptes :
 *       … --creer --appliquer
 *   Tout effacer :
 *       … --supprimer --appliquer
 *
 * ─── Sécurité ─────────────────────────────────────────────────────────────
 * L'outil SIMULE par défaut : il annonce ce qu'il ferait et ne touche à rien
 * tant que `--appliquer` n'est pas donné. `--supprimer` affiche la liste
 * nominative des comptes concernés avant de les effacer.
 *
 * ─── Tester la messagerie avec ces comptes ────────────────────────────────
 *
 * Ils sont `ACTIVE` et `isVerified`, donc visibles dans la découverte, et ils
 * peuvent s'écrire entre eux sans autre préparation : la messagerie n'exige
 * ni match — la notion a été retirée, `openConversation` crée la conversation
 * au premier message — ni abonnement, le palier payant étant désactivé dans
 * cette version (`config.subscriptionsEnabled` est faux). Le seul frein est
 * le quota de 30 conversations NOUVELLES par jour et par membre ; répondre
 * dans une conversation entamée ne compte jamais.
 *
 * Un piège pour qui essaie le chat : le filtre anti-brouteur de
 * `conversations.service.ts` refuse certains messages, et le refus déclenche
 * un signalement automatique. « bitcoin », « iban », « western union », une
 * insulte, ou un innocent « besoin de 2 minutes » — le motif est
 * `besoin de <nombre>` — sont bloqués. Une phrase ordinaire passe.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { uploadDir } from '../config/upload';
import { config } from '../config';

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

const action = {
  etat: aDrapeau('etat'),
  creer: aDrapeau('creer'),
  supprimer: aDrapeau('supprimer'),
};
const appliquer = aDrapeau('appliquer');

const AIDE = `
Profils de test Téranga

  ACTIONS (une seule à la fois)
    --etat            liste les profils de test présents (lecture seule)
    --creer           crée les dix comptes manquants, avec leurs photos
    --supprimer       efface tous les comptes @teranga.test et leurs photos

  --appliquer         exécute réellement. Sans lui, le script se contente
                      d'annoncer ce qu'il ferait.
  --aide              affiche ce message

  Mot de passe des comptes créés : ${'Test1234!'}
  Connexion : avec l'adresse e-mail du compte, ou son téléphone.
`;

/**
 * La marque, et la seule. Le TLD `.test` est réservé (RFC 2606) : aucun
 * domaine réel ne peut le porter. Modifier cette constante sans lancer
 * `--supprimer` avant laisserait des comptes orphelins que plus rien ne
 * désigne.
 */
const DOMAINE_TEST = '@teranga.test';
const MOT_DE_PASSE = 'Test1234!';
const MENTION = 'Profil de démonstration, créé pour les tests.';

type ProfilTest = {
  prenom: string;
  nom: string;
  genre: 'FEMALE' | 'MALE';
  naissance: string;
  ville: string;
  pays: string;
  metier: string;
  intention: 'MARRIAGE' | 'SERIOUS_RELATIONSHIP' | 'FAMILY';
  religion: 'MUSLIM' | 'CHRISTIAN' | 'OTHER' | 'UNDISCLOSED';
  bio: string;
  taille: number;
  langues: string;
  enfants: boolean;
  veutEnfants: boolean;
  etudes: string;
  /** Couleur haute du dégradé de la photo — pour que les dix se distinguent. */
  teinte: string;
};

/**
 * Les âges sont volontairement étalés de 24 à 40 ans, et le genre réparti
 * 5/5. Le fil de découverte filtre sur la tranche d'âge ET sur le genre
 * recherché par celui qui regarde : dix profils du même âge ou du même genre
 * disparaîtraient derrière le moindre filtre, et l'on croirait le script raté.
 */
const PROFILS: ProfilTest[] = [
  {
    prenom: 'Awa', nom: 'Diallo', genre: 'FEMALE', naissance: '1998-04-12',
    ville: 'Dakar', pays: 'SN', metier: 'Sage-femme', intention: 'MARRIAGE',
    religion: 'MUSLIM', taille: 168, langues: ',FR,WO,', enfants: false,
    veutEnfants: true, etudes: 'Licence',
    bio: "J'aime les longues marches sur la Corniche et la cuisine de ma grand-mère.",
    teinte: '0xD49060',
  },
  {
    prenom: 'Nafissatou', nom: 'Bâ', genre: 'FEMALE', naissance: '1995-09-30',
    ville: 'Thiès', pays: 'SN', metier: 'Comptable', intention: 'MARRIAGE',
    religion: 'MUSLIM', taille: 162, langues: ',FR,WO,PU,', enfants: true,
    veutEnfants: true, etudes: 'Master',
    bio: 'Mère d\'un garçon de six ans. Je cherche quelqu\'un de patient et de droit.',
    teinte: '0xB8691A',
  },
  {
    prenom: 'Adjoua', nom: 'Koffi', genre: 'FEMALE', naissance: '1992-01-18',
    ville: 'Abidjan', pays: 'CI', metier: 'Ingénieure agronome',
    intention: 'SERIOUS_RELATIONSHIP', religion: 'CHRISTIAN', taille: 171,
    langues: ',FR,EN,', enfants: false, veutEnfants: true, etudes: 'Ingénieur',
    bio: 'Passionnée de jardins potagers et de romans policiers.',
    teinte: '0x8B4513',
  },
  {
    prenom: 'Mireille', nom: 'Ngo Bell', genre: 'FEMALE', naissance: '1990-06-05',
    ville: 'Douala', pays: 'CM', metier: 'Pharmacienne', intention: 'FAMILY',
    religion: 'CHRISTIAN', taille: 165, langues: ',FR,EN,', enfants: true,
    veutEnfants: false, etudes: 'Doctorat',
    bio: 'Deux filles, un métier que j\'aime, et l\'envie de bâtir quelque chose de solide.',
    teinte: '0xC97B3A',
  },
  {
    prenom: 'Salimata', nom: 'Traoré', genre: 'FEMALE', naissance: '2001-11-22',
    ville: 'Bamako', pays: 'ML', metier: 'Étudiante en droit',
    intention: 'SERIOUS_RELATIONSHIP', religion: 'MUSLIM', taille: 159,
    langues: ',FR,BM,', enfants: false, veutEnfants: true, etudes: 'Licence',
    bio: 'Je termine mes études. Sérieuse, mais pas au point d\'en oublier de rire.',
    teinte: '0xE0A070',
  },
  {
    prenom: 'Ousmane', nom: 'Sarr', genre: 'MALE', naissance: '1993-03-08',
    ville: 'Dakar', pays: 'SN', metier: 'Développeur', intention: 'MARRIAGE',
    religion: 'MUSLIM', taille: 182, langues: ',FR,WO,EN,', enfants: false,
    veutEnfants: true, etudes: 'Master',
    bio: 'Je code la semaine, je joue au foot le dimanche. Je cherche du sérieux.',
    teinte: '0x5B2E0C',
  },
  {
    prenom: 'Cheikh', nom: 'Mbaye', genre: 'MALE', naissance: '1988-07-14',
    ville: 'Dakar', pays: 'SN', metier: 'Architecte', intention: 'MARRIAGE',
    religion: 'MUSLIM', taille: 178, langues: ',FR,WO,', enfants: false,
    veutEnfants: true, etudes: 'Ingénieur',
    bio: 'Je dessine des maisons. J\'aimerais en habiter une à deux.',
    teinte: '0x7A3E12',
  },
  {
    prenom: 'Yao', nom: 'N\'Guessan', genre: 'MALE', naissance: '1996-12-01',
    ville: 'Abidjan', pays: 'CI', metier: 'Kinésithérapeute',
    intention: 'SERIOUS_RELATIONSHIP', religion: 'CHRISTIAN', taille: 175,
    langues: ',FR,', enfants: false, veutEnfants: true, etudes: 'Licence',
    bio: 'Calme, curieux, bon public. J\'écoute plus que je ne parle.',
    teinte: '0xA55A20',
  },
  {
    prenom: 'Landry', nom: 'Fotso', genre: 'MALE', naissance: '1986-02-27',
    ville: 'Douala', pays: 'CM', metier: 'Chef d\'entreprise', intention: 'FAMILY',
    religion: 'CHRISTIAN', taille: 180, langues: ',FR,EN,', enfants: true,
    veutEnfants: true, etudes: 'Master',
    bio: 'Un fils de dix ans. Je ne cherche ni à combler un vide ni à aller vite.',
    teinte: '0x6B3510',
  },
  {
    prenom: 'Ibrahima', nom: 'Camara', genre: 'MALE', naissance: '1999-08-19',
    ville: 'Paris', pays: 'FR', metier: 'Infirmier', intention: 'MARRIAGE',
    religion: 'MUSLIM', taille: 176, langues: ',FR,EN,WO,', enfants: false,
    veutEnfants: true, etudes: 'Licence',
    bio: 'Né à Kolda, soignant à Paris. Attaché aux deux rives.',
    teinte: '0xD1854C',
  },
];

// ——— Identité dérivée : e-mail, téléphone, noms de fichiers ———
const sansAccent = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z]+/g, '-').toLowerCase();

const identite = (p: ProfilTest, i: number) => {
  const cle = `${sansAccent(p.prenom)}-${sansAccent(p.nom)}`.replace(/-+/g, '-').replace(/^-|-$/g, '');
  return {
    cle,
    email: `${cle}${DOMAINE_TEST}`,
    // Plage 77 9900 0xx, distincte de celle de `prisma/seed.ts` (77 1000 0xx).
    // La marque reste l'e-mail : ce numéro n'est qu'une commodité de connexion.
    phone: `+221779900${String(i + 1).padStart(3, '0')}`,
    // Autant de photos que l'application en EXIGE, pas un nombre choisi au
    // hasard. Le script en créait deux quand le minimum était de trois : les
    // comptes existaient, se connectaient, apparaissaient dans la découverte —
    // et `requireCompleteProfile` refusait tout le reste avec
    // « PHOTOS_REQUIRED ». Des profils de test incapables d'aimer ou d'écrire
    // ne testent pas grand-chose.
    photos: Array.from(
      { length: Math.max(2, config.profile.minPhotos) },
      (_, n) => `profil-test-${cle}-${n + 1}.webp`,
    ),
  };
};

/**
 * L'e-mail est la SEULE marque sur laquelle `--supprimer` s'appuie : deux
 * profils qui se réduiraient à la même clé (les accents et les apostrophes
 * tombent) partageraient une adresse, le second échouerait à la création, et
 * la liste ne correspondrait plus à ce qui est en base. Autant s'en rendre
 * compte au démarrage plutôt qu'au dixième compte.
 */
{
  const cles = PROFILS.map((p, i) => identite(p, i).email);
  const doublon = cles.find((e, i) => cles.indexOf(e) !== i);
  if (doublon) throw new Error(`Deux profils produisent la même adresse : ${doublon}`);
}

// ——— Fabrication des photos ———

/**
 * `drawtext` a besoin d'un fichier de police : il n'en cherche aucune tout
 * seul. On essaie les emplacements habituels des trois systèmes ; si aucun ne
 * répond, la photo est produite sans initiales plutôt que pas du tout.
 */
function trouverPolice(): string | null {
  const candidates = [
    'C:/Windows/Fonts/georgia.ttf',
    'C:/Windows/Fonts/arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf',
    '/System/Library/Fonts/Supplemental/Georgia.ttf',
  ];
  return candidates.find((f) => fs.existsSync(f)) ?? null;
}

/** `C:/…/georgia.ttf` → `C\:/…/georgia.ttf` : dans un filtre, `:` sépare les options. */
const echapper = (chemin: string) => chemin.replace(/\\/g, '/').replace(/:/g, '\\:');

function ffmpegDisponible(): boolean {
  const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  return r.status === 0;
}

/**
 * Une image 800×1000 (le 4/5 des cartes de profil) : dégradé de la teinte du
 * profil vers l'encre de la marque, initiales au centre, mention en pied.
 * `variante` fait pivoter le dégradé et remplace les initiales par le prénom,
 * pour que les deux photos d'un même profil ne soient pas jumelles.
 */
function genererPhoto(
  destination: string,
  teinte: string,
  texte: string,
  variante: boolean,
  police: string | null,
): boolean {
  const source = variante
    ? `gradients=s=800x1000:c0=0x2B1605:c1=${teinte}:x0=800:y0=0:x1=0:y1=1000:d=1:n=2`
    : `gradients=s=800x1000:c0=${teinte}:c1=0x2B1605:x0=0:y0=0:x1=800:y1=1000:d=1:n=2`;

  const filtres: string[] = [];
  if (police) {
    const f = `fontfile='${echapper(police)}'`;
    const taille = variante ? 96 : 260;
    filtres.push(
      `drawtext=${f}:text='${texte.replace(/'/g, '')}':fontcolor=0xF5E6D3:fontsize=${taille}:x=(w-text_w)/2:y=(h-text_h)/2-40`,
    );
    filtres.push(
      `drawtext=${f}:text='PROFIL DE TEST':fontcolor=0xF5E6D3@0.75:fontsize=30:x=(w-text_w)/2:y=h-120`,
    );
  }

  // WebP plutôt que PNG : le même dégradé coûte 130 Ko en PNG contre une
  // dizaine ici, et le format fait déjà partie de ceux qu'accepte l'upload
  // des membres (config/upload.ts). `-frames:v 1` évite que ffmpeg choisisse
  // l'encodeur `libwebp_anim` et produise un conteneur animé.
  const argv = ['-v', 'error', '-y', '-f', 'lavfi', '-i', source, '-frames:v', '1'];
  if (filtres.length) argv.push('-vf', filtres.join(','));
  argv.push('-c:v', 'libwebp', '-quality', '82', '-compression_level', '6', destination);

  return spawnSync('ffmpeg', argv, { stdio: 'ignore' }).status === 0;
}

/**
 * Chemin réel d'une photo, ou `null` si l'URL ne désigne pas un fichier de
 * `uploads/`. Le `basename` n'est pas décoratif : il neutralise tout
 * `../../` qui traînerait dans une URL enregistrée en base.
 */
function fichierLocal(url: string): string | null {
  if (!url.startsWith('/uploads/')) return null;
  const racine = path.resolve(uploadDir);
  const cible = path.resolve(racine, path.basename(url));
  return cible.startsWith(racine + path.sep) ? cible : null;
}

/**
 * Compte — et, si `effacer`, supprime — les images `profil-test-*` restées
 * dans `uploads/`. Le préfixe est le filet de sécurité du nommage : il
 * rattrape les fichiers qu'aucune ligne de la base ne désigne plus.
 * À n'appeler qu'une fois les comptes de test supprimés, sans quoi on
 * effacerait les photos de comptes encore vivants.
 */
function balayerOrphelins(effacer: boolean, connus?: Set<string>): number {
  let n = 0;
  let fichiers: string[];
  try {
    fichiers = fs.readdirSync(uploadDir);
  } catch {
    return 0;
  }
  for (const nom of fichiers) {
    if (!nom.startsWith('profil-test-')) continue;
    // `connus` sert au décompte de la simulation : un fichier encore rattaché
    // à une ligne Photo n'est pas un orphelin, il sera effacé par le premier
    // passage. L'annoncer ici le compterait deux fois.
    if (connus?.has(nom)) continue;
    if (!effacer) {
      n++;
      continue;
    }
    try {
      fs.unlinkSync(path.join(uploadDir, nom));
      n++;
    } catch (e) {
      console.log(c.alerte(`Fichier non supprimé : ${nom} (${(e as Error).message})`));
    }
  }
  return n;
}

// ——— Actions ———

async function etat() {
  const comptes = await prisma.user.findMany({
    where: { email: { endsWith: DOMAINE_TEST } },
    include: { photos: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(c.titre(`Profils de test en base : ${comptes.length}`));
  if (!comptes.length) {
    console.log(c.info('Aucun. `--creer --appliquer` les met en place.'));
    return;
  }
  for (const u of comptes) {
    const age = Math.floor((Date.now() - u.birthDate.getTime()) / 31_557_600_000);
    console.log(
      c.info(
        `${u.firstName} ${u.lastName ?? ''} — ${age} ans, ${u.city} (${u.country}) · ` +
          `${u.photos.length} photo(s) · ${u.status}${u.isVerified ? ', vérifié' : ''} · ${u.email}`,
      ),
    );
  }
}

async function creer() {
  const police = trouverPolice();
  const avecFfmpeg = ffmpegDisponible();

  console.log(c.titre(appliquer ? 'Création des profils de test' : 'Simulation — rien ne sera écrit'));
  if (!avecFfmpeg) {
    console.log(c.alerte('ffmpeg est introuvable : les comptes seront créés SANS photo.'));
    console.log(c.info('Installer ffmpeg puis relancer `--creer --appliquer` ajoutera les images manquantes.'));
  } else if (!police) {
    console.log(c.info('Aucune police système trouvée : les photos seront des dégradés sans initiales.'));
  }

  const motDePasse = appliquer ? await bcrypt.hash(MOT_DE_PASSE, 10) : '';
  let crees = 0;
  let ignores = 0;

  for (let i = 0; i < PROFILS.length; i++) {
    const p = PROFILS[i];
    const id = identite(p, i);

    const existant = await prisma.user.findUnique({ where: { email: id.email } });
    if (existant) {
      console.log(c.info(`${p.prenom} ${p.nom} — déjà présent, ignoré.`));
      ignores++;
      continue;
    }

    if (!appliquer) {
      console.log(c.ok(`${p.prenom} ${p.nom} (${id.email}) serait créé, avec 2 photos.`));
      crees++;
      continue;
    }

    // Photos d'abord : un compte sans image est moins gênant qu'une ligne
    // Photo qui pointe vers un fichier absent.
    const urls: string[] = [];
    if (avecFfmpeg) {
      const initiales = `${p.prenom[0]}${p.nom[0]}`.toUpperCase();
      id.photos.forEach((nom, n) => {
        const destination = path.join(uploadDir, nom);
        const texte = n === 0 ? initiales : `${p.prenom}${n > 1 ? ' ' + (n + 1) : ''}`;
        if (fs.existsSync(destination) || genererPhoto(destination, p.teinte, texte, n % 2 === 1, police)) {
          urls.push(`/uploads/${nom}`);
        }
      });
    }

    try {
      await prisma.user.create({
        data: {
          phone: id.phone,
          email: id.email,
          passwordHash: motDePasse,
          firstName: p.prenom,
          lastName: p.nom,
          birthDate: new Date(p.naissance),
          gender: p.genre,
          intent: p.intention,
          religion: p.religion,
          city: p.ville,
          country: p.pays,
          profession: p.metier,
          bio: `${p.bio} ${MENTION}`,
          hasChildren: p.enfants,
          wantsChildren: p.veutEnfants,
          heightCm: p.taille,
          languages: p.langues,
          educationLevel: p.etudes,
          // Visibles dans la découverte : elle exige ACTIVE **et** isVerified.
          // Sans les deux, le compte existe et personne ne le voit.
          status: 'ACTIVE',
          verificationStatus: 'VERIFIED',
          isVerified: true,
          emailVerified: true,
          phoneVerified: true,
          // Activités échelonnées : le filtre « en ligne » / « actif
          // récemment » a ainsi de quoi trier.
          lastActiveAt: new Date(Date.now() - i * 7 * 3600 * 1000),
          photos: {
            create: urls.map((url, n) => ({
              url,
              order: n,
              isMain: n === 0,
              moderationStatus: 'VERIFIED' as const,
            })),
          },
        },
      });
    } catch (e) {
      // Les fichiers sont déjà sur le disque ; sans ligne Photo pour les
      // désigner, `--supprimer` ne les retrouverait plus par la base. On les
      // reprend tout de suite plutôt que de laisser des orphelins.
      for (const url of urls) {
        const fichier = fichierLocal(url);
        if (fichier && fs.existsSync(fichier)) fs.unlinkSync(fichier);
      }
      const motif = (e as Error).message.split('\n')[0];
      console.log(c.alerte(`${p.prenom} ${p.nom} — création refusée : ${motif}`));
      continue;
    }

    console.log(c.ok(`${p.prenom} ${p.nom} — créé (${urls.length} photo(s)) · ${id.email}`));
    crees++;
  }

  console.log(
    c.titre(appliquer ? `${crees} compte(s) créé(s), ${ignores} ignoré(s).` : `${crees} compte(s) seraient créés.`),
  );
  if (!appliquer) console.log(c.info('Ajouter --appliquer pour exécuter.'));
  else if (crees) console.log(c.info(`Connexion : e-mail du compte + mot de passe « ${MOT_DE_PASSE} ».`));
}

async function supprimer() {
  const comptes = await prisma.user.findMany({
    where: { email: { endsWith: DOMAINE_TEST } },
    include: { photos: true },
  });

  console.log(c.titre(appliquer ? 'Suppression des profils de test' : 'Simulation — rien ne sera effacé'));
  if (!comptes.length) {
    console.log(c.info('Aucun compte ne porte une adresse ' + DOMAINE_TEST + '. Rien à faire.'));
    return;
  }

  // La liste nominative AVANT d'effacer : c'est le dernier moment où une
  // erreur de marque (un compte réel dans le lot) peut être vue.
  for (const u of comptes) {
    console.log(c.info(`${u.firstName} ${u.lastName ?? ''} · ${u.email} · ${u.photos.length} photo(s)`));
  }
  console.log(c.titre(`${comptes.length} compte(s) concerné(s).`));

  if (!appliquer) {
    const connus = new Set(comptes.flatMap((u) => u.photos.map((ph) => path.basename(ph.url))));
    const orphelins = balayerOrphelins(false, connus);
    if (orphelins) console.log(c.info(`${orphelins} fichier(s) photo orphelin(s) seraient également balayés.`));
    console.log(c.info('Ajouter --appliquer pour exécuter.'));
    return;
  }

  // Les fichiers d'abord : la ligne Photo disparaîtra avec le compte (les
  // relations sont en `onDelete: Cascade`), mais rien en base n'efface un
  // fichier sur le disque. Après le delete, on ne saurait plus lesquels.
  let effaces = 0;
  for (const u of comptes) {
    for (const photo of u.photos) {
      const fichier = fichierLocal(photo.url);
      if (!fichier || !fs.existsSync(fichier)) continue;
      try {
        fs.unlinkSync(fichier);
        effaces++;
      } catch (e) {
        console.log(c.alerte(`Fichier non supprimé : ${photo.url} (${(e as Error).message})`));
      }
    }
  }

  const { count } = await prisma.user.deleteMany({ where: { email: { endsWith: DOMAINE_TEST } } });

  // Second passage, par nom de fichier. Une création interrompue entre
  // l'écriture de l'image et l'insertion en base laisse un fichier que plus
  // aucune ligne Photo ne désigne : le passage précédent, qui suit la base,
  // ne peut pas le voir. Puisqu'il ne reste plus un seul compte de test,
  // tout `profil-test-*` encore présent est par définition un orphelin.
  const orphelins = balayerOrphelins(true);

  console.log(
    c.ok(
      `${count} compte(s) supprimé(s), ${effaces} fichier(s) photo effacé(s)` +
        (orphelins ? `, ${orphelins} orphelin(s) balayé(s).` : '.'),
    ),
  );
}

// ——— Enchaînement ———
async function main() {
  const actions = [action.etat, action.creer, action.supprimer].filter(Boolean).length;
  if (aDrapeau('aide') || actions === 0) {
    console.log(AIDE);
    return;
  }
  if (actions > 1) {
    console.error(c.alerte('Une seule action à la fois : --etat, --creer ou --supprimer.'));
    process.exitCode = 1;
    return;
  }

  if (action.etat) await etat();
  else if (action.creer) await creer();
  else await supprimer();
}

main()
  .catch((e) => {
    console.error(c.alerte((e as Error).message));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
