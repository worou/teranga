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

/** Filtres réellement acceptés par l'API (cf. discoveryFiltersSchema). */
export interface DiscoveryFilters {
  q?: string
  minAge?: number
  maxAge?: number
  city?: string
  country?: string
  religion?: string
  intent?: string
  profession?: string
  hasChildren?: boolean
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  if (!token) throw new ApiError('Non authentifié', 401)

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
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

/** Sérialise les filtres actifs en query string (les vides sont omis). */
function toQuery(filters: DiscoveryFilters): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === '' || value === null) continue
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
