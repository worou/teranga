import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdmin } from '../middleware/requireAdmin';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';

const router = Router();
router.use(requireAdmin);

/** GET /api/admin/users — liste paginée */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const skip  = (page - 1) * limit;
    const search = (req.query.search as string) || '';
    const verification = (req.query.verification as string) || '';

    const clauses: any[] = [];

    if (search) {
      // PAS de `mode: 'insensitive'` : c'est une option PostgreSQL, et Prisma
      // la REFUSE sur MySQL — la recherche renvoyait 500 à chaque frappe, la
      // liste ne répondant que tant qu'on ne cherchait rien. La casse est de
      // toute façon déjà ignorée par la collation utf8mb4_unicode_ci de la
      // base (même constat que dans `discovery.service.ts` du frontoffice).
      clauses.push({
        OR: [
          { firstName: { contains: search } },
          { lastName:  { contains: search } },
          { phone:     { contains: search } },
          { email:     { contains: search } },
        ],
      });
    }

    // File d'attente de la modération. Le critère est `verificationStatus`,
    // surtout pas `isVerified` : un profil REJETÉ reste `isVerified: false`
    // pour toujours — c'est le sens du rejet. Une file bâtie sur ce booléen
    // le remonterait à chaque chargement, sans aucun moyen de l'en sortir.
    if (verification) {
      // Un compte banni ou supprimé n'a plus à être jugé sur son profil : il
      // sort des trois vues, pas seulement de l'attente.
      clauses.push({ status: { notIn: ['BANNED', 'DELETED'] as const } });

      if (verification === 'pending') {
        clauses.push({ verificationStatus: { in: ['PENDING', 'IN_REVIEW'] as const } });
      } else if (verification === 'verified') {
        clauses.push({ verificationStatus: 'VERIFIED' as const });
      } else if (verification === 'rejected') {
        clauses.push({ verificationStatus: 'REJECTED' as const });
      } else {
        throw AppError.badRequest(
          'verification doit valoir pending, verified ou rejected',
        );
      }
    }

    // Les deux filtres se composent : chercher un nom DANS la file d'attente
    // doit rester possible.
    const where = clauses.length ? { AND: clauses } : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, firstName: true, lastName: true,
          phone: true, email: true, gender: true,
          // `isVerified` est la seconde porte : un compte peut être ACTIVE
          // (il a confirmé son e-mail, il se connecte) tout en restant
          // INVISIBLE dans la découverte, qui filtre dessus. Sans ce champ,
          // la liste ne pouvait pas distinguer les deux, et un profil en
          // attente de validation était indiscernable d'un profil validé.
          // `phoneVerified` répond à une tout autre question.
          status: true, phoneVerified: true, isVerified: true,
          // Sans lui, l'écran ne peut pas distinguer « en attente » de
          // « rejeté » : les deux valent `isVerified: false`, et la liste
          // afficherait « à valider » sur un profil déjà tranché.
          verificationStatus: true,
          createdAt: true, city: true, country: true, birthDate: true,
          // Nécessaires au formulaire d'édition : sans eux, il s'ouvrirait
          // vide sur ces champs et l'enregistrement les effacerait — ou
          // échouerait sur une valeur vide hors énumération.
          intent: true, religion: true, profession: true,
          // De quoi juger un profil sans ouvrir une seconde page. Le coût est
          // borné : la pagination plafonne à 100 lignes, et la photo
          // principale ne ramène qu'une URL.
          bio: true,
          photos: { where: { isMain: true }, take: 1, select: { url: true } },
          subscription: { select: { plan: true, status: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  }),
);

/** GET /api/admin/users/:id */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { subscription: true, photos: true },
    });
    if (!user) throw AppError.notFound('Utilisateur introuvable');
    res.json(user);
  }),
);

/**
 * PATCH /api/admin/users/:id — corriger la fiche d'un membre.
 *
 * CE QUI N'EST PAS MODIFIABLE ICI, ET POURQUOI
 *
 *   e-mail, téléphone : ce sont les identifiants de connexion. Les changer
 *     depuis un panneau d'administration, c'est prendre la main sur le compte
 *     de quelqu'un — pas corriger sa fiche.
 *   mot de passe : même raison, en pire.
 *   statut, vérification : ils ont leurs routes dédiées, avec leurs propres
 *     règles (une sanction ne se lève pas au détour d'un formulaire).
 *   visibilité des photos : c'est un choix de confidentialité qui appartient
 *     au membre. Rendre publiques les photos de quelqu'un qui les a mises en
 *     privé serait exactement ce que le réglage promet d'empêcher.
 *
 * Le reste — identité affichée, lieu, recherche, présentation — est ce qu'un
 * membre pourrait corriger lui-même. L'administrateur ne fait que l'aider,
 * typiquement quand une erreur d'inscription rend le compte inutilisable :
 * un genre coché de travers ne fait apparaître le profil dans le fil de
 * personne.
 */
const GENRES = ['FEMALE', 'MALE', 'NON_BINARY', 'UNDISCLOSED'];
const INTENTIONS = ['SERIOUS_RELATIONSHIP', 'MARRIAGE', 'FAMILY'];
const RELIGIONS = ['CHRISTIAN', 'MUSLIM', 'OTHER', 'UNDISCLOSED'];

/** Âge calendaire, identique au calcul du frontoffice. */
function ageAu(d: Date): number {
  const n = new Date();
  let age = n.getFullYear() - d.getFullYear();
  const m = n.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < d.getDate())) age--;
  return age;
}

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const data: Record<string, unknown> = {};

    const texte = (cle: string, max: number, obligatoire = false) => {
      if (b[cle] === undefined) return;
      const v = b[cle] === null ? null : String(b[cle]).trim();
      if (obligatoire && !v) throw AppError.badRequest(`${cle} ne peut pas être vide`);
      if (v && v.length > max) throw AppError.badRequest(`${cle} : ${max} caractères maximum`);
      data[cle] = v || (obligatoire ? undefined : null);
    };

    texte('firstName', 60, true);
    texte('lastName', 60);
    texte('city', 80, true);
    texte('profession', 80);
    texte('bio', 500);

    if (b.gender !== undefined) {
      if (!GENRES.includes(b.gender)) throw AppError.badRequest('Genre invalide');
      data.gender = b.gender;
    }
    if (b.intent !== undefined) {
      if (!INTENTIONS.includes(b.intent)) throw AppError.badRequest('Intention invalide');
      data.intent = b.intent;
    }
    if (b.religion !== undefined) {
      if (!RELIGIONS.includes(b.religion)) throw AppError.badRequest('Religion invalide');
      data.religion = b.religion;
    }
    if (b.country !== undefined) {
      const c = String(b.country).trim().toUpperCase();
      if (c.length !== 2) throw AppError.badRequest('Pays : code ISO à deux lettres attendu');
      data.country = c;
    }
    if (b.birthDate !== undefined) {
      const d = new Date(b.birthDate);
      if (Number.isNaN(d.getTime())) throw AppError.badRequest('Date de naissance invalide');
      // Le même seuil que l'inscription. Sans ce contrôle, une correction
      // administrative pourrait rendre un mineur visible — le formulaire
      // public l'interdit, ce panneau ne doit pas offrir la porte de service.
      if (d.getTime() > Date.now()) throw AppError.badRequest('Date de naissance dans le futur');
      if (ageAu(d) < 18) throw AppError.badRequest('Le membre doit avoir au moins 18 ans');
      data.birthDate = d;
    }

    if (Object.keys(data).length === 0) throw AppError.badRequest('Aucun champ à modifier');

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: {
        id: true, firstName: true, lastName: true, gender: true, birthDate: true,
        city: true, country: true, intent: true, religion: true, profession: true, bio: true,
      },
    });
    res.json(user);
  }),
);

/** PATCH /api/admin/users/:id/status — bannir / réactiver */
router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!['ACTIVE', 'BANNED', 'SUSPENDED'].includes(status)) {
      throw AppError.badRequest('Statut invalide');
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status },
      select: { id: true, status: true, firstName: true, lastName: true },
    });
    res.json(user);
  }),
);

/** PATCH /api/admin/users/:id/verify — approuver / rejeter la vérification. */
router.patch(
  '/:id/verify',
  asyncHandler(async (req, res) => {
    const { action } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      throw AppError.badRequest('Action invalide (approve | reject)');
    }
    const data =
      action === 'approve'
        ? { isVerified: true, verificationStatus: 'VERIFIED' as const }
        : { isVerified: false, verificationStatus: 'REJECTED' as const };

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, isVerified: true, verificationStatus: true, firstName: true },
    });
    res.json(user);
  }),
);

export default router;
