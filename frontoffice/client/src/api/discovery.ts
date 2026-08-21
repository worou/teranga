import { getToken } from './auth'

const BASE = '/api/v1'

/** Photo de profil telle que renvoyée par l'API. */
export interface Photo {
  id: string
  url: string
  isMain: boolean
  order: number
}

/** Traits communs calculés par le score de compatibilité côté API. */
export interface SharedTraits {
  sameCity?: boolean
  sameCountry?: boolean
  sameIntent?: boolean
  sameReligion?: boolean
}

/** Profil tel qu'exposé par /discovery/feed et /users/:id. */
export interface Profile {
  id: string
  firstName: string
  age: number
  city?: string | null
  country?: string | null
  profession?: string | null
  bio?: string | null
  intent?: string | null
  religion?: string | null
  isVerified?: boolean
  photos: Photo[]
  score?: number
  sharedTraits?: SharedTraits
}

/**
 * Filtres acceptés par l'API (miroir de `discoveryFiltersSchema`).
 *
 * `includeUnspecified` s'applique aux critères facultatifs du profil (taille,
 * poids, silhouette, origine, langue, souhait d'enfants) : activé, il conserve
 * les profils qui n'ont pas renseigné le critère. C'est le défaut, sans quoi un
 * seul filtre viderait la liste de tous les profils encore incomplets.
 */
export interface DiscoveryFilters {
  q?: string
  gender?: string
  minAge?: number
  maxAge?: number
  city?: string
  country?: string
  religion?: string
  intent?: string
  profession?: string
  minHeightCm?: number
  maxHeightCm?: number
  minWeightKg?: number
  maxWeightKg?: number
  bodyType?: string
  ethnicity?: string
  language?: string
  hasChildren?: boolean
  wantsChildren?: boolean
  hasPhoto?: boolean
  lastActive?: 'all' | 'recent' | 'online'
  includeUnspecified?: boolean
}

/**
 * Erreur d'API porteuse du code applicatif. `PHOTOS_REQUIRED` signale une
 * inscription non finalisée : l'appelant redirige vers l'étape photos plutôt
 * que d'afficher un message d'échec générique.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
  }
}

/**
 * Appel API. Le jeton n'est joint que s'il existe : les routes publiques
 * (fil de profils, profil public) répondent alors en anonyme, et les routes
 * protégées renvoient un vrai 401 du serveur.
 *
 * Refuser l'appel côté client faute de jeton priverait le visiteur des pages
 * publiques — c'est le serveur qui décide de ce qui est ouvert.
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(
      data?.message || 'Une erreur est survenue.',
      res.status,
      data?.details?.code,
    )
  }
  return data as T
}

/**
 * Sérialise les filtres actifs en query string.
 *
 * Les valeurs vides sont omises, mais `false` est transmis : `hasPhoto=false`
 * et `includeUnspecified=false` sont des choix, pas des absences de choix.
 */
function toQuery(filters: DiscoveryFilters): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const q = params.toString()
  return q ? `?${q}` : ''
}

export const discoveryApi = {
  feed: (filters: DiscoveryFilters = {}) =>
    request<Profile[]>(`/discovery/feed${toQuery(filters)}`),

  profile: (id: string) => request<Profile>(`/users/${id}`),

  like: (receiverId: string, isSuperLike = false) =>
    request<{ isMatch?: boolean; matchId?: string }>('/discovery/like', {
      method: 'POST',
      body: JSON.stringify({ receiverId, isSuperLike }),
    }),

  pass: (receiverId: string) =>
    request<unknown>('/discovery/pass', {
      method: 'POST',
      body: JSON.stringify({ receiverId }),
    }),

  matches: () =>
    request<{ data: unknown[]; pagination: { total: number } }>('/matches?limit=1'),

  notifications: () =>
    request<{ data: { id: string; readAt?: string | null }[] }>('/notifications?limit=30'),
}

/**
 * Pays desservis (miroir de src/config/mobileMoney.ts). Noms seuls, sans
 * drapeau : Windows ne rend pas les emoji d'indicatif régional et affiche les
 * deux lettres brutes (« ѕɴ Sénégal »).
 */
export const COUNTRY_LABELS: Record<string, string> = {
  SN: 'Sénégal',
  CI: "Côte d'Ivoire",
  ML: 'Mali',
  BF: 'Burkina Faso',
  BJ: 'Bénin',
  TG: 'Togo',
  NE: 'Niger',
  GW: 'Guinée-Bissau',
}

export const INTENT_LABELS: Record<string, string> = {
  SERIOUS_RELATIONSHIP: 'Relation sérieuse',
  MARRIAGE: 'Mariage',
  FAMILY: 'Fonder une famille',
}

export const RELIGION_LABELS: Record<string, string> = {
  MUSLIM: 'Islam',
  CHRISTIAN: 'Christianisme',
  OTHER: 'Autre',
  UNDISCLOSED: 'Non précisée',
}

/**
 * Genres proposables à la recherche. « Ne se prononce pas » (UNDISCLOSED) est
 * volontairement absent : l'inscription ne l'offre pas, aucun membre ne peut
 * donc le porter, et le filtre ne renverrait jamais personne.
 * L'enum Prisma le conserve pour les comptes historiques.
 */
export const GENDER_LABELS: Record<string, string> = {
  FEMALE: 'Une femme',
  MALE: 'Un homme',
  NON_BINARY: 'Non binaire',
}

export const BODY_TYPE_LABELS: Record<string, string> = {
  MINCE: 'Mince',
  MOYENNE: 'Moyenne',
  RONDE: 'Ronde',
}

/**
 * Origine ethnique — donnée sensible au sens du RGPD (art. 9). Toujours
 * déclarative et facultative, jamais déduite.
 */
export const ETHNICITY_LABELS: Record<string, string> = {
  AFRICAN: 'Africaine',
  ARAB: 'Arabe',
  ASIAN: 'Asiatique',
  EUROPEAN: 'Européenne',
  LATIN: 'Latine',
  NORTH_AMERICAN: 'Nord-américaine',
  UNDISCLOSED: 'Ne se prononce pas',
}

/** Langues courantes de la zone couverte + langues de la diaspora. */
export const LANGUAGE_LABELS: Record<string, string> = {
  FR: 'Français',
  EN: 'Anglais',
  AR: 'Arabe',
  WO: 'Wolof',
  BM: 'Bambara',
  FF: 'Peul',
  MO: 'Moré',
  DY: 'Dioula',
  FO: 'Fon',
  EW: 'Éwé',
  PT: 'Portugais',
  ES: 'Espagnol',
}

export const LAST_ACTIVE_LABELS: Record<string, string> = {
  all: 'Tous',
  recent: 'Récent (7 j)',
  online: 'Connecté',
}

/** Chips « ce que vous avez en commun », dérivées du score de l'API. */
export function sharedLabels(traits?: SharedTraits): string[] {
  if (!traits) return []
  const out: string[] = []
  if (traits.sameCity) out.push('Même ville')
  else if (traits.sameCountry) out.push('Même pays')
  if (traits.sameIntent) out.push('Même intention')
  if (traits.sameReligion) out.push('Même religion')
  return out
}
