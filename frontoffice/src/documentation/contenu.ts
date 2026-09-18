/**
 * Documentation de Téranga — contenu initial.
 *
 * CE FICHIER EST UNE SEMENCE, PAS LA SOURCE DE VÉRITÉ.
 *
 * La documentation vivante est enregistrée en base, sous la clé `documentation`
 * de la table `Setting` — la même table que l'interrupteur de maintenance, et
 * pour la même raison : elle est partagée par les deux applications. Elle
 * s'édite depuis le backoffice, sans redéploiement.
 *
 * Ce fichier sert à deux choses, et deux seulement :
 *
 *   1. Poser le contenu initial (`npm run build && node dist/scripts/documentation-seed.js`).
 *   2. Garder une version de référence dans Git. Si la base est vidée par
 *      accident, on la relance ; si quelqu'un veut savoir ce que disait la
 *      documentation en octobre, l'historique le dit.
 *
 * MODIFIER CE FICHIER NE CHANGE RIEN AU SITE tant que la semence n'est pas
 * rejouée. Pour corriger une réponse, passez par le backoffice.
 *
 * RÈGLE D'ÉCRITURE : ne décrire que ce qui existe. Une documentation qui promet
 * une fonctionnalité absente est pire que pas de documentation — elle fabrique
 * des déçus, et le chatbot la répétera fidèlement à tout le monde.
 */

export interface SectionDoc {
  /** Identifiant stable : sert d'ancre et de clé de mise à jour. */
  id: string;
  titre: string;
  /**
   * Mots que quelqu'un taperait pour trouver cette section — y compris les
   * formulations maladroites et les fautes courantes. C'est sur eux que repose
   * la recherche tant que Claude n'est pas branché.
   */
  motsCles: string[];
  contenu: string;
}

export const DOCUMENTATION: SectionDoc[] = [
  {
    id: 'presentation',
    titre: 'Qu’est-ce que Téranga ?',
    motsCles: [
      'teranga', 'c est quoi', 'presentation', 'site', 'application', 'app',
      'rencontre', 'mariage', 'serieux', 'pourquoi', 'difference', 'gratuit',
    ],
    contenu:
      "Téranga est un site de rencontre sérieuse destiné à l’Afrique francophone et à sa diaspora. " +
      "Il réunit des femmes et des hommes qui souhaitent s’engager, fonder un foyer, bâtir une vie à deux. " +
      "Ce n’est pas une application de rencontres d’un soir.\n\n" +
      "Chaque profil déclare ce qu’il recherche, et chaque inscription est examinée par notre équipe " +
      "avant d’être publiée. L’usage du site est aujourd’hui entièrement gratuit : découverte, messagerie, " +
      "favoris, tout est ouvert sans abonnement.",
  },
  {
    id: 'inscription',
    titre: 'Créer un compte',
    motsCles: [
      'inscription', 'inscrire', 's inscrire', 'creer un compte', 'nouveau compte',
      'ouvrir un compte', 'rejoindre', 'formulaire', 'etapes', 'code', 'email',
      'verification', 'confirmer',
    ],
    contenu:
      "L’inscription se fait en plusieurs étapes courtes depuis « Créer mon compte ».\n\n" +
      "On vous demande : votre prénom, votre date de naissance, votre genre, ce que vous recherchez, " +
      "votre ville et votre pays, puis une adresse e-mail et un mot de passe.\n\n" +
      "Un code à six chiffres vous est envoyé par e-mail pour confirmer votre adresse. " +
      "Si vous ne le recevez pas, vérifiez vos courriers indésirables avant de le redemander : " +
      "vous ne pouvez demander que trois codes toutes les dix minutes.\n\n" +
      "Vous devez avoir 18 ans au moins.",
  },
  {
    id: 'intention',
    titre: 'Que choisir à « Je recherche » ?',
    motsCles: [
      'je recherche', 'intention', 'relation serieuse', 'mariage', 'fonder une famille',
      'quoi cocher', 'quelle difference', 'choisir', 'hesitation',
    ],
    contenu:
      "Trois réponses sont proposées : « une relation sérieuse, et voir où elle mène », " +
      "« le mariage — c’est un projet concret », et « fonder une famille, avoir des enfants ».\n\n" +
      "Aucune n’exclut les autres. Ce sont des points sur la même route, pas des destinations " +
      "concurrentes : une relation sérieuse peut mener au mariage, et le mariage à une famille. " +
      "Choisissez celle qui décrit le mieux où vous en êtes aujourd’hui.\n\n" +
      "Vous pouvez la modifier à tout moment depuis « Mon profil ». " +
      "Elle sert à vous proposer des profils dont les attentes ressemblent aux vôtres.",
  },
  {
    id: 'connexion',
    titre: 'Se connecter',
    motsCles: [
      'connexion', 'connecter', 'se connecter', 'login', 'identifiant',
      'mot de passe', 'code e-mail', 'code email', 'acceder a mon compte',
    ],
    contenu:
      "Deux façons de vous connecter, au choix, depuis la page de connexion :\n\n" +
      "• **Mot de passe** — votre adresse e-mail et le mot de passe choisi à l’inscription.\n" +
      "• **Code e-mail** — un code à six chiffres vous est envoyé ; aucun mot de passe à retenir.\n\n" +
      "Si votre navigateur a enregistré un ancien mot de passe, il peut le remplir automatiquement " +
      "et faire échouer la connexion. Videz le champ et saisissez-le à la main pour en avoir le cœur net.",
  },
  {
    id: 'mot-de-passe-oublie',
    titre: 'Mot de passe oublié ou perdu',
    motsCles: [
      'mot de passe oublie', 'oublie mon mot de passe', 'perdu', 'reinitialiser',
      'changer mon mot de passe', 'nouveau mot de passe', 'je n arrive pas a me connecter',
      'identifiants invalides', 'bloque',
    ],
    contenu:
      "Cliquez sur « Mot de passe oublié ? » sur l’écran de connexion. " +
      "Un code vous est envoyé par e-mail, puis vous choisissez un nouveau mot de passe " +
      "(huit caractères au minimum).\n\n" +
      "Attention : la réinitialisation ferme toutes vos sessions. Il faudra vous reconnecter " +
      "partout, y compris dans l’application installée sur votre téléphone.\n\n" +
      "Si vous vous êtes inscrit par code e-mail sans jamais définir de mot de passe, " +
      "l’onglet « Mot de passe » ne fonctionnera pas pour vous : utilisez l’onglet « Code e-mail », " +
      "ou passez par « Mot de passe oublié ? » pour en définir un.",
  },
  {
    id: 'profil',
    titre: 'Compléter et modifier son profil',
    motsCles: [
      'profil', 'mon profil', 'modifier', 'changer', 'completer', 'remplir',
      'genre', 'age', 'ville', 'pays', 'religion', 'profession', 'description',
      'presentation', 'centres d interet',
    ],
    contenu:
      "Tout se modifie depuis « Mon profil », accessible par le menu de votre avatar en haut à droite.\n\n" +
      "Vous pouvez y changer votre prénom, votre ville, votre pays, votre religion, votre profession, " +
      "votre présentation, vos centres d’intérêt, ce que vous recherchez, et votre genre.\n\n" +
      "Un profil complet est mieux vu : les profils sans présentation reçoivent nettement moins de messages. " +
      "Écrivez quelques lignes sur qui vous êtes et ce que vous espérez trouver.",
  },
  {
    id: 'photos',
    titre: 'Photos : combien, et qui les voit',
    motsCles: [
      'photo', 'photos', 'image', 'ajouter une photo', 'supprimer une photo',
      'combien de photos', 'obligatoire', 'public', 'prive', 'privee', 'visibilite',
      'cacher mes photos', 'anonyme', 'discretion',
    ],
    contenu:
      "Il faut **trois photos au minimum** pour que votre profil soit publié, et vous pouvez en mettre " +
      "jusqu’à six. La première sert de photo principale.\n\n" +
      "Vous choisissez qui les voit, depuis « Mon profil » :\n\n" +
      "• **Public** — tout le monde peut voir vos photos et vous contacter.\n" +
      "• **Privé** — vos photos restent masquées aux autres membres.\n\n" +
      "Vous pouvez changer ce réglage à tout moment ; l’effet est immédiat. " +
      "Un profil en mode privé reste visible dans la découverte, mais ses photos ne s’affichent pas.\n\n" +
      "Cliquez sur une photo pour l’afficher en grand.",
  },
  {
    id: 'validation',
    titre: 'Pourquoi mon profil n’est-il pas encore visible ?',
    motsCles: [
      'pas visible', 'invisible', 'personne ne me voit', 'profil en attente',
      'validation', 'valide', 'verifie', 'attente', 'refuse', 'combien de temps',
      'delai',
    ],
    contenu:
      "Trois raisons possibles :\n\n" +
      "1. **Votre profil est incomplet.** Il faut au moins trois photos et les informations " +
      "obligatoires renseignées.\n" +
      "2. **Il attend d’être examiné.** Chaque inscription est vérifiée par notre équipe avant " +
      "publication. C’est ce qui tient les faux profils à l’écart.\n" +
      "3. **Vos photos sont en mode privé.** Votre profil reste visible, mais sans images.\n\n" +
      "Si votre profil est complet depuis plusieurs jours et toujours pas publié, écrivez-nous.",
  },
  {
    id: 'decouverte',
    titre: 'Découvrir des profils',
    motsCles: [
      'decouverte', 'decouvrir', 'chercher', 'recherche', 'trouver quelqu un',
      'filtre', 'filtrer', 'age', 'ville', 'pays', 'religion', 'profils',
      'suggestions', 'compatibilite',
    ],
    contenu:
      "La page « Découverte » vous propose des profils choisis pour vous. " +
      "Le bouton « Tous les filtres » permet d’affiner : tranche d’âge, ville, pays, religion, " +
      "et ce que la personne recherche.\n\n" +
      "Les profils sont classés par compatibilité : même ville ou même pays, intentions proches, " +
      "religion commune, proximité d’âge, activité récente. " +
      "Des étiquettes vous indiquent ce que vous avez en commun.\n\n" +
      "Sur chaque carte, le cœur ajoute la personne à vos favoris et l’avion permet de lui écrire. " +
      "Cliquez sur la photo pour l’agrandir.",
  },
  {
    id: 'favoris',
    titre: 'Favoris et profils écartés',
    motsCles: [
      'favori', 'favoris', 'coeur', 'like', 'aimer', 'enregistrer', 'garder',
      'passer', 'ecarter', 'retrouver un profil', 'marque page',
    ],
    contenu:
      "Le cœur ajoute un profil à vos **favoris**, que vous retrouvez par l’icône marque-page " +
      "en haut de l’écran. Mettre quelqu’un en favori ne le fait pas disparaître de la découverte : " +
      "une étiquette « Favori » s’affiche simplement sur sa carte.\n\n" +
      "« Passer » retire le profil de vos suggestions. Cette action n’est pas annulable depuis le site " +
      "pour l’instant.",
  },
  {
    id: 'messagerie',
    titre: 'Écrire et lire ses messages',
    motsCles: [
      'message', 'messages', 'messagerie', 'ecrire', 'contacter', 'discuter',
      'conversation', 'chat', 'repondre', 'envoyer', 'lire', 'non lus',
      'tiroir', 'vignette',
    ],
    contenu:
      "Vous pouvez écrire à n’importe quel membre depuis sa fiche de profil ou depuis sa carte " +
      "dans la découverte. Aucun accord préalable n’est nécessaire.\n\n" +
      "L’icône de message en haut de l’écran ouvre un panneau latéral : sur le bord, les vignettes " +
      "de toutes les personnes avec qui vous avez échangé, triées par activité récente. " +
      "Cliquez sur une vignette pour ouvrir la conversation.\n\n" +
      "La pastille rouge indique le nombre de messages non lus. " +
      "« Voir toutes mes conversations » ouvre la liste complète.\n\n" +
      "La messagerie est gratuite et sans limite, pour les femmes comme pour les hommes.",
  },
  {
    id: 'securite',
    titre: 'Sécurité : arnaques, blocage, signalement',
    motsCles: [
      'securite', 'arnaque', 'brouteur', 'escroquerie', 'argent', 'demande d argent',
      'faux profil', 'bloquer', 'signaler', 'harcelement', 'insulte', 'danger',
      'mefiance', 'prudence',
    ],
    contenu:
      "**Ne donnez jamais d’argent à quelqu’un rencontré ici.** Aucune exception. " +
      "Les demandes d’argent suivent toujours les mêmes prétextes : une mère malade, un blocage " +
      "à l’aéroport, un visa urgent, une carte cadeau, un virement à faire suivre.\n\n" +
      "Un filtre automatique bloque les messages qui contiennent ces motifs : ils ne vous parviennent " +
      "jamais, et leur auteur est signalé à notre équipe.\n\n" +
      "Depuis une conversation ou une fiche de profil, vous pouvez **bloquer** une personne " +
      "— elle ne pourra plus vous écrire ni vous voir — ou la **signaler** à la modération.\n\n" +
      "Ne communiquez pas vos coordonnées bancaires, ne cliquez pas sur des liens envoyés par " +
      "un inconnu, et méfiez-vous de quelqu’un qui refuse tout appel vidéo.",
  },
  {
    id: 'assistants',
    titre: 'Se faire conseiller par un assistant',
    motsCles: [
      'assistant', 'assistante', 'conseil', 'conseils', 'conseiller', 'aide',
      'accompagnement', 'coach', 'consultation', 'payer', 'tarif', 'forfait',
      'whatsapp', 'telephone', 'difficulte', 'blocage',
      // Le conseil sentimental est une prestation payante, assurée par des
      // personnes. Ces mots l'amènent ici plutôt que de ne rien trouver.
      'draguer', 'seduire', 'seduction', 'aborder', 'relancer', 'plaire',
      'timide', 'ose pas', 'quoi dire', 'quoi ecrire', 'premier message',
      'elle repond pas', 'il repond pas', 'rendez vous', 'rencontrer',
      'famille', 'parents', 'demande en mariage', 'dot',
    ],
    contenu:
      "Si vous hésitez, si un échange s’enlise, ou si vous préparez une rencontre entre familles, " +
      "vous pouvez faire appel à un assistant — une personne, pas un automate.\n\n" +
      "Rendez-vous dans le menu de votre avatar, « Se faire conseiller ». " +
      "Vous y voyez les assistantes et assistants disponibles, leur présentation, leurs spécialités " +
      "et leur forfait (un montant pour une durée).\n\n" +
      "Vous déposez une demande en expliquant votre besoin. Rien n’est prélevé à ce moment-là : " +
      "notre équipe vous contacte pour le règlement. Une fois celui-ci reçu, les coordonnées de " +
      "l’assistant vous sont communiquées — l’accompagnement se fait par téléphone ou WhatsApp, " +
      "pendant toute la durée du forfait.",
  },
  {
    id: 'compte',
    titre: 'Désactiver ou supprimer son compte',
    motsCles: [
      'desactiver', 'suspendre', 'pause', 'supprimer mon compte', 'effacer',
      'fermer mon compte', 'partir', 'quitter', 'se desinscrire', 'desinscription',
      'revenir',
    ],
    contenu:
      "Les deux options sont au bas de la page « Mon profil ».\n\n" +
      "• **Désactiver** — votre profil disparaît de la découverte et personne ne peut plus vous écrire. " +
      "Vos données sont conservées : il suffit de vous reconnecter pour réactiver le compte.\n" +
      "• **Supprimer** — définitif. Profil, photos et conversations sont effacés. " +
      "On ne peut pas revenir en arrière.\n\n" +
      "Si vous avez simplement besoin de souffler, choisissez la désactivation.",
  },
  {
    id: 'deconnexion',
    titre: 'Se déconnecter',
    motsCles: [
      'deconnexion', 'deconnecter', 'se deconnecter', 'quitter', 'sortir',
      'fermer la session', 'telephone partage',
    ],
    contenu:
      "Cliquez sur votre avatar en haut à droite, puis « Se déconnecter ». " +
      "C’est important sur un téléphone ou un ordinateur partagé.",
  },
  {
    id: 'application',
    titre: 'Installer Téranga sur son téléphone',
    motsCles: [
      'application', 'installer', 'telecharger', 'android', 'iphone', 'ios',
      'apk', 'play store', 'ecran d accueil', 'hors ligne', 'mobile',
    ],
    contenu:
      "Téranga s’installe directement depuis le navigateur, sans passer par un magasin d’applications.\n\n" +
      "• **Android (Chrome)** — une bannière « Installer Téranga » apparaît, ou bien menu ⋮ " +
      "puis « Ajouter à l’écran d’accueil ».\n" +
      "• **iPhone (Safari)** — bouton Partager, puis « Sur l’écran d’accueil ».\n\n" +
      "L’application s’ouvre alors en plein écran, avec son icône, comme n’importe quelle autre. " +
      "Elle se met à jour toute seule.",
  },
  {
    id: 'tarifs',
    titre: 'Combien ça coûte ?',
    motsCles: [
      'prix', 'tarif', 'cout', 'payant', 'gratuit', 'abonnement', 'payer',
      'combien', 'argent', 'facture', 'carte bancaire', 'mobile money',
    ],
    contenu:
      "**L’usage du site est gratuit.** Inscription, découverte, favoris et messagerie : " +
      "tout est ouvert, pour les femmes comme pour les hommes, sans abonnement ni limite.\n\n" +
      "La seule prestation payante est la **consultation d’un assistant**, si vous souhaitez " +
      "être accompagné personnellement. Son tarif est affiché sur la fiche de chaque assistant, " +
      "avant toute demande, et rien n’est prélevé sans votre accord.",
  },
  {
    id: 'probleme',
    titre: 'Un problème, une question sans réponse',
    motsCles: [
      'probleme', 'bug', 'ne marche pas', 'erreur', 'panne', 'contact',
      'contacter', 'aide', 'support', 'ecrire a l equipe', 'reclamation',
      'maintenance', 'site ferme',
    ],
    contenu:
      "Si le site affiche une page de maintenance, c’est qu’une mise à jour est en cours : " +
      "revenez un peu plus tard.\n\n" +
      "Pour tout le reste — un compte bloqué, un comportement anormal, une question à laquelle " +
      "cette aide ne répond pas — écrivez à notre équipe. Décrivez ce que vous faisiez, " +
      "ce que vous attendiez, et ce qui s’est passé à la place : cela nous fait gagner un aller-retour.",
  },
];
