import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdmin } from '../middleware/requireAdmin';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';

/**
 * Le volet « assistant » d'un administrateur, et la file des demandes.
 *
 * TROIS RÈGLES QUI STRUCTURENT CE FICHIER
 *
 * 1. On ne modifie que SA PROPRE fiche. Ce sont les coordonnées personnelles
 *    d'une personne : qu'un administrateur puisse inscrire son numéro sur la
 *    fiche d'un collègue serait au mieux une méprise, au pire une nuisance.
 *    D'où `/me` partout, et jamais d'identifiant en paramètre.
 *
 * 2. Confirmer une demande, c'est livrer un numéro de téléphone à un membre
 *    contre un règlement reçu hors ligne. C'est donc un acte, pas un réglage :
 *    on consigne qui l'a fait (`confirmedBy`) et quand (`confirmedAt`). Le
 *    jour où quelqu'un demandera « qui a donné mon numéro à cette personne »,
 *    la réponse doit exister.
 *
 * 3. La file n'est PAS visible par tous les administrateurs. Une demande porte
 *    ce qu'un membre a écrit de sa difficulté — « je n'arrive pas à », « ma
 *    famille refuse » — et cela ne regarde que deux personnes : l'assistant
 *    sollicité, et celui qui encaisse. Un compte de modération ordinaire n'a
 *    aucune raison de lire ces confidences.
 *
 *    Voient donc une demande : l'assistant concerné, et les SUPERADMIN, qui
 *    tiennent la caisse.
 */
const router = Router();
router.use(requireAdmin);

/** Champs qu'un administrateur peut renseigner sur son propre volet. */
function lireFiche(body: any) {
  const genre = String(body?.assistantGender ?? '').toUpperCase();
  const nombre = (v: any) => {
    const n = parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const texte = (v: any, max: number) => {
    const t = String(v ?? '').trim();
    return t ? t.slice(0, max) : null;
  };

  return {
    isAssistant: body?.isAssistant === true,
    isAvailable: body?.isAvailable !== false,
    assistantName: texte(body?.assistantName, 80),
    // Seuls deux genres : le service annoncé est « un assistant, homme ou
    // femme ». Toute autre valeur est effacée plutôt que conservée à moitié.
    assistantGender: genre === 'FEMALE' || genre === 'MALE' ? (genre as any) : null,
    bio: texte(body?.bio, 2000),
    specialities: texte(body?.specialities, 300),
    // Une adresse d'image, pas une adresse postale. Sans ce contrôle le champ
    // accueille n'importe quoi — il a déjà reçu « 7 Rue Jean Moulin » — et la
    // fiche affiche une image cassée que personne ne comprend.
    photoUrl: (() => {
      const u = texte(body?.photoUrl, 500);
      if (!u) return null;
      return /^https?:\/\//i.test(u) ? u : null;
    })(),
    contactPhone: texte(body?.contactPhone, 40),
    contactWhatsapp: texte(body?.contactWhatsapp, 40),
    priceFcfa: nombre(body?.priceFcfa),
    priceMonthFcfa: nombre(body?.priceMonthFcfa),
    // Les nouvelles fiches valent 7 : la formule de base est hebdomadaire.
    // Le champ n'est plus demandé, il reste pour les fiches antérieures.
    durationDays: nombre(body?.durationDays) || 7,
  };
}

/** GET /api/admin/assistants/me — ma fiche d'assistant. */
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const adminId = (req as any).admin.adminId;
    const fiche = await prisma.admin.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        isAssistant: true,
        isAvailable: true,
        assistantName: true,
        assistantGender: true,
        bio: true,
        specialities: true,
        photoUrl: true,
        contactPhone: true,
        contactWhatsapp: true,
        priceFcfa: true,
        priceMonthFcfa: true,
        durationDays: true,
      },
    });
    if (!fiche) throw AppError.notFound('Compte introuvable');
    res.json(fiche);
  }),
);

/**
 * PUT /api/admin/assistants/me
 *
 * Se déclarer assistant sans tarif ni durée ne sert à rien : le frontoffice
 * écarte les fiches incomplètes, la personne se croirait publiée sans l'être.
 * On refuse donc ici, où l'on peut encore le dire.
 */
router.put(
  '/me',
  asyncHandler(async (req, res) => {
    const adminId = (req as any).admin.adminId;
    const data = lireFiche(req.body);

    if (data.isAssistant) {
      if (!data.assistantName) throw AppError.badRequest('Un nom affiché est nécessaire.');
      if (!data.priceFcfa) {
        throw AppError.badRequest('Un tarif à la semaine est nécessaire : c’est la formule de base.');
      }
      if (req.body?.photoUrl && String(req.body.photoUrl).trim() && !data.photoUrl) {
        throw AppError.badRequest(
          'La photo doit être une adresse Internet commençant par http:// ou https://, pas une adresse postale.',
        );
      }
      if (!data.contactPhone && !data.contactWhatsapp) {
        throw AppError.badRequest(
          'Au moins un moyen de contact est nécessaire : sans lui, la consultation n’a pas de canal.',
        );
      }
    }

    await prisma.admin.update({ where: { id: adminId }, data });
    res.json({ saved: true });
  }),
);

/**
 * GET /api/admin/assistants/consultations?status=PENDING
 *
 * La file. `PENDING` par défaut : c'est ce qui attend une décision.
 */
router.get(
  '/consultations',
  asyncHandler(async (req, res) => {
    const statut = String(req.query.status || 'PENDING').toUpperCase();
    const connus = ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED'];
    const moi = (req as any).admin;

    const lignes = await prisma.consultation.findMany({
      where: {
        ...(connus.includes(statut) ? { status: statut } : {}),
        // Un administrateur ordinaire ne voit que les demandes qui lui sont
        // adressées. Le SUPERADMIN voit tout : c'est lui qui encaisse.
        ...(moi.role === 'SUPERADMIN' ? {} : { adminId: moi.adminId }),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        admin: { select: { id: true, assistantName: true, name: true } },
      },
    });

    res.json({
      data: lignes.map((c) => ({
        id: c.id,
        status: c.status,
        // Échue ou non : calculé, jamais stocké (voir le schéma).
        expired: c.status === 'CONFIRMED' && !!c.expiresAt && c.expiresAt.getTime() <= Date.now(),
        priceFcfa: c.priceFcfa,
        durationDays: c.durationDays,
        memberNote: c.memberNote,
        startsAt: c.startsAt,
        expiresAt: c.expiresAt,
        confirmedAt: c.confirmedAt,
        confirmedBy: c.confirmedBy,
        refusedFor: c.refusedFor,
        createdAt: c.createdAt,
        member: c.user,
        assistant: { id: c.admin.id, name: c.admin.assistantName || c.admin.name || 'Assistant' },
      })),
    });
  }),
);

/**
 * PATCH /api/admin/assistants/consultations/:id — { action: 'confirm' | 'reject', motif? }
 *
 * La confirmation démarre le forfait MAINTENANT, pour la durée convenue au
 * moment de la demande. On ne repart pas du tarif courant de l'assistant :
 * c'est l'accord passé avec ce membre qui fait foi.
 */
router.patch(
  '/consultations/:id',
  asyncHandler(async (req, res) => {
    const moi = (req as any).admin;
    const action = String(req.body?.action ?? '');

    // Même périmètre que la lecture : on ne tranche que sur ce qu'on a le droit
    // de voir. Sans ce garde, un administrateur pourrait confirmer à l'aveugle
    // une demande adressée à quelqu'un d'autre — et livrer le numéro d'un
    // collègue sans avoir vu passer le moindre paiement.
    const c = await prisma.consultation.findFirst({
      where: {
        id: req.params.id,
        ...(moi.role === 'SUPERADMIN' ? {} : { adminId: moi.adminId }),
      },
      select: { id: true, status: true, durationDays: true },
    });
    if (!c) throw AppError.notFound('Demande introuvable');
    if (c.status !== 'PENDING') {
      throw AppError.badRequest('Cette demande a déjà été traitée.');
    }

    if (action === 'confirm') {
      const debut = new Date();
      const fin = new Date(debut.getTime() + c.durationDays * 86_400_000);
      await prisma.consultation.update({
        where: { id: c.id },
        data: {
          status: 'CONFIRMED',
          startsAt: debut,
          expiresAt: fin,
          confirmedAt: debut,
          confirmedBy: moi.adminId,
        },
      });
      return res.json({ status: 'CONFIRMED', expiresAt: fin });
    }

    if (action === 'reject') {
      await prisma.consultation.update({
        where: { id: c.id },
        data: {
          status: 'REJECTED',
          refusedFor: String(req.body?.motif ?? '').trim().slice(0, 300) || null,
        },
      });
      return res.json({ status: 'REJECTED' });
    }

    throw AppError.badRequest('Action inconnue.');
  }),
);

export default router;
