import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';
import { serializeAssistant, type AssistantPublic } from './assistants.service';

/**
 * Les consultations : un membre demande conseil à un assistant, contre un
 * forfait réglé hors ligne.
 *
 * LE POINT CENTRAL DE CE FICHIER
 *
 * L'échange a lieu par téléphone ou WhatsApp, hors de la plateforme. Ce qui
 * s'achète est donc, très concrètement, UN NUMÉRO. Le livrer trop tôt, c'est
 * donner le service ; le livrer à la mauvaise personne, c'est exposer les
 * coordonnées personnelles d'un administrateur.
 *
 * D'où `coordonneesVisibles()` : une seule fonction décide, un seul endroit à
 * relire. Si cette condition apparaît une deuxième fois ailleurs, elle finira
 * par diverger — et c'est la divergence, pas la règle, qui ouvre la fuite.
 *
 * L'EXPIRATION N'EST PAS UN STATUT
 *
 * Aucune tâche planifiée ne tourne ici. `status` ne consigne donc que des
 * décisions humaines, et l'expiration se calcule à chaque lecture. Un champ
 * « expiré » que rien ne met à jour serait un champ qui ment — et ici, il
 * mentirait en laissant des coordonnées visibles après leur terme.
 */

export type StatutConsultation = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';

/** Ce que le membre voit de sa demande. */
export interface ConsultationPublic {
  id: string;
  status: StatutConsultation;
  /** Vrai seulement si confirmée ET non échue — c'est l'état qui donne accès. */
  active: boolean;
  /** Vrai si elle a été confirmée mais que le terme est passé. */
  expired: boolean;
  priceFcfa: number;
  durationDays: number;
  memberNote: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  refusedFor: string | null;
  createdAt: string;
  assistant: AssistantPublic;
  /** Coordonnées — `null` tant que la consultation n'est pas active. */
  contact: { phone: string | null; whatsapp: string | null } | null;
}

type LigneConsultation = {
  id: string;
  status: string;
  priceFcfa: number;
  durationDays: number;
  memberNote: string | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  refusedFor: string | null;
  createdAt: Date;
  admin: any;
};

/**
 * La consultation donne-t-elle accès aux coordonnées ?
 *
 * Confirmée ET dans son terme. Rien d'autre n'ouvre : ni une demande en
 * attente — sinon il suffirait d'en déposer vingt pour collecter les numéros —
 * ni une consultation échue.
 */
function coordonneesVisibles(c: { status: string; expiresAt: Date | null }): boolean {
  if (c.status !== 'CONFIRMED') return false;
  if (!c.expiresAt) return false;
  return c.expiresAt.getTime() > Date.now();
}

/** Consultation échue : confirmée un jour, mais le terme est passé. */
function estEchue(c: { status: string; expiresAt: Date | null }): boolean {
  return c.status === 'CONFIRMED' && !!c.expiresAt && c.expiresAt.getTime() <= Date.now();
}

function serialize(c: LigneConsultation): ConsultationPublic {
  const active = coordonneesVisibles(c);
  return {
    id: c.id,
    status: c.status as StatutConsultation,
    active,
    expired: estEchue(c),
    priceFcfa: c.priceFcfa,
    durationDays: c.durationDays,
    memberNote: c.memberNote,
    startsAt: c.startsAt?.toISOString() ?? null,
    expiresAt: c.expiresAt?.toISOString() ?? null,
    refusedFor: c.refusedFor,
    createdAt: c.createdAt.toISOString(),
    assistant: serializeAssistant(c.admin),
    // Le seul endroit de toute l'application où ces deux champs sortent.
    contact: active
      ? { phone: c.admin.contactPhone ?? null, whatsapp: c.admin.contactWhatsapp ?? null }
      : null,
  };
}

/**
 * Colonnes de l'assistant jointes à une consultation.
 *
 * Elles incluent les coordonnées — c'est nécessaire, `serialize` en a besoin
 * pour les rendre quand la consultation est active. Ce `select` est donc le
 * seul du code à les charger, et il n'est utilisé que sur les consultations
 * D'UN membre donné.
 */
const ASSISTANT_AVEC_CONTACT = {
  id: true,
  assistantName: true,
  assistantGender: true,
  bio: true,
  specialities: true,
  photoUrl: true,
  priceFcfa: true,
  durationDays: true,
  isAvailable: true,
  contactPhone: true,
  contactWhatsapp: true,
} as const;

export const consultationsService = {
  /**
   * Demander une consultation.
   *
   * Le tarif et la durée sont recopiés depuis la fiche : c'est ce qui a été
   * montré au membre, et c'est ce qui l'engage. Modifier son forfait ensuite ne
   * doit pas réécrire un accord déjà pris.
   */
  async request(userId: string, adminId: string, memberNote?: string) {
    const assistant = await prisma.admin.findFirst({
      where: {
        id: adminId,
        isAssistant: true,
        isActive: true,
        isAvailable: true,
        priceFcfa: { not: null, gt: 0 },
        durationDays: { not: null, gt: 0 },
      },
      select: { id: true, priceFcfa: true, durationDays: true },
    });
    if (!assistant) throw AppError.notFound('Assistant indisponible');

    // Une demande en cours suffit. Sans ce garde, un membre impatient
    // empilerait les demandes et la file de validation deviendrait illisible.
    const existante = await prisma.consultation.findFirst({
      where: { userId, adminId, status: { in: ['PENDING', 'CONFIRMED'] } },
      select: { id: true, status: true, expiresAt: true },
    });
    if (existante && (existante.status === 'PENDING' || coordonneesVisibles(existante))) {
      throw AppError.conflict(
        existante.status === 'PENDING'
          ? 'Vous avez déjà une demande en attente auprès de cet assistant.'
          : 'Vous avez déjà une consultation en cours avec cet assistant.',
      );
    }

    const creee = await prisma.consultation.create({
      data: {
        userId,
        adminId,
        priceFcfa: assistant.priceFcfa!,
        durationDays: assistant.durationDays!,
        memberNote: memberNote?.trim() || null,
      },
      include: { admin: { select: ASSISTANT_AVEC_CONTACT } },
    });
    return serialize(creee as LigneConsultation);
  },

  /** Les consultations d'un membre, la plus récente d'abord. */
  async listForUser(userId: string): Promise<ConsultationPublic[]> {
    const lignes = await prisma.consultation.findMany({
      where: { userId },
      include: { admin: { select: ASSISTANT_AVEC_CONTACT } },
      orderBy: { createdAt: 'desc' },
    });
    return lignes.map((l) => serialize(l as LigneConsultation));
  },

  /**
   * Annuler sa demande.
   *
   * Seulement tant qu'elle est en attente : une consultation confirmée a été
   * payée et ses coordonnées ont été vues. L'annuler d'un clic laisserait
   * croire à un remboursement automatique, qui n'existe pas.
   */
  async cancel(userId: string, id: string) {
    const c = await prisma.consultation.findFirst({
      where: { id, userId },
      select: { id: true, status: true },
    });
    if (!c) throw AppError.notFound('Demande introuvable');
    if (c.status !== 'PENDING') {
      throw AppError.badRequest('Seule une demande en attente peut être annulée.');
    }
    await prisma.consultation.update({ where: { id }, data: { status: 'CANCELLED' } });
    return { cancelled: true };
  },
};
