import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';

/**
 * Les assistants : des administrateurs qui proposent des consultations payantes.
 *
 * TOUT ce fichier existe pour une seule raison : un assistant est une ligne de
 * la table `Admin`, qui porte `email` et `passwordHash`. Servir un tel objet à
 * un membre, même par mégarde, livrerait des identifiants d'administration. Le
 * risque n'est pas théorique : il suffit d'un `res.json(admin)` écrit un jour
 * de fatigue, ou d'un champ ajouté au modèle des mois plus tard.
 *
 * Deux protections, délibérément redondantes :
 *
 *   1. Un `select` Prisma explicite — les colonnes sensibles n'entrent même pas
 *      dans le processus.
 *   2. `serializeAssistant`, qui RECONSTRUIT un objet champ par champ. Jamais
 *      d'étalement (`...admin`), jamais de suppression de clés : une liste
 *      blanche oublie par défaut, une liste noire expose par défaut.
 *
 * La seconde protection est celle qui survit à la première : si quelqu'un
 * élargit le `select`, le sérialiseur continue de ne rendre que ce qu'il
 * connaît.
 *
 * Voir `photosVisibles()` pour le même parti pris côté photos.
 */

/** Colonnes qu'un membre peut voir. Les coordonnées n'en font PAS partie. */
const CHAMPS_PUBLICS = {
  id: true,
  assistantName: true,
  assistantGender: true,
  bio: true,
  specialities: true,
  photoUrl: true,
  priceFcfa: true,
  priceMonthFcfa: true,
  durationDays: true,
  isAvailable: true,
} as const;

/** Un assistant tel qu'un membre le voit. */
export interface AssistantPublic {
  id: string;
  name: string;
  gender: string | null;
  bio: string | null;
  specialities: string[];
  photoUrl: string | null;
  /** Tarif hebdomadaire, toujours présent. */
  priceFcfa: number;
  durationDays: number;
  /** Tarif mensuel, `null` si l'assistant ne propose que la semaine. */
  priceMonthFcfa: number | null;
  isAvailable: boolean;
}

type LigneAdmin = {
  id: string;
  assistantName: string | null;
  assistantGender: string | null;
  bio: string | null;
  specialities: string | null;
  photoUrl: string | null;
  priceFcfa: number | null;
  priceMonthFcfa: number | null;
  durationDays: number | null;
  isAvailable: boolean;
};

/**
 * Seule fonction autorisée à transformer un administrateur en donnée publique.
 *
 * Reconstruction champ par champ : voir l'en-tête du fichier.
 */
export function serializeAssistant(a: LigneAdmin): AssistantPublic {
  return {
    id: a.id,
    // Le nom interne (`name`) n'est jamais montré : il peut être le vrai nom
    // civil d'un modérateur, qui n'a pas à circuler côté membre.
    name: a.assistantName || 'Assistant',
    gender: a.assistantGender ?? null,
    bio: a.bio ?? null,
    specialities: (a.specialities || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    photoUrl: a.photoUrl ?? null,
    priceFcfa: a.priceFcfa ?? 0,
    durationDays: a.durationDays ?? 7,
    priceMonthFcfa: a.priceMonthFcfa ?? null,
    isAvailable: a.isAvailable,
  };
}

export const assistantsService = {
  /**
   * Les assistants proposés aux membres.
   *
   * Un assistant n'apparaît que s'il est complet : sans tarif ni durée, le
   * membre ne saurait pas ce qu'il achète, et une fiche à « 0 F CFA » ferait
   * une promesse que personne ne tiendra. Le compte doit aussi être actif —
   * un administrateur désactivé ne répondra à personne.
   */
  async list(filters: { gender?: string } = {}): Promise<AssistantPublic[]> {
    const lignes = await prisma.admin.findMany({
      where: {
        isAssistant: true,
        isActive: true,
        priceFcfa: { not: null, gt: 0 },
        durationDays: { not: null, gt: 0 },
        ...(filters.gender ? { assistantGender: filters.gender as any } : {}),
      },
      select: CHAMPS_PUBLICS,
      // Les disponibles d'abord : une fiche indisponible reste consultable,
      // mais n'a pas à occuper le haut de la liste.
      orderBy: [{ isAvailable: 'desc' }, { priceFcfa: 'asc' }],
    });
    return lignes.map(serializeAssistant);
  },

  /** Une fiche. Mêmes règles que la liste — les coordonnées restent cachées. */
  async get(id: string): Promise<AssistantPublic> {
    const ligne = await prisma.admin.findFirst({
      where: {
        id,
        isAssistant: true,
        isActive: true,
        priceFcfa: { not: null, gt: 0 },
        durationDays: { not: null, gt: 0 },
      },
      select: CHAMPS_PUBLICS,
    });
    if (!ligne) throw AppError.notFound('Assistant introuvable');
    return serializeAssistant(ligne);
  },
};
