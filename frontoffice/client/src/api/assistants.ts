import { getToken } from './auth'
import { ApiError } from './discovery'

const BASE = '/api/v1'

/** Un assistant, tel que le serveur le montre aux membres. */
export interface Assistant {
  id: string
  name: string
  gender: 'FEMALE' | 'MALE' | null
  bio: string | null
  specialities: string[]
  photoUrl: string | null
  /** Tarif a la semaine, toujours propose. */
  priceFcfa: number
  durationDays: number
  /** Tarif au mois, `null` si l'assistant ne propose que la semaine. */
  priceMonthFcfa: number | null
  isAvailable: boolean
}

/** Les deux formules. La semaine existe toujours, le mois est facultatif. */
export type Formule = 'semaine' | 'mois'

export type StatutConsultation = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED'

/**
 * Une demande de consultation.
 *
 * `contact` vaut `null` tant que la consultation n'est pas active — le serveur
 * ne l'envoie tout simplement pas. L'écran n'a donc rien à masquer : il montre
 * ce qu'il reçoit. C'est délibéré : un secret qu'on cache à l'affichage a déjà
 * traversé le réseau.
 */
export interface Consultation {
  id: string
  status: StatutConsultation
  /** Confirmée ET dans son terme : le seul état qui donne accès au contact. */
  active: boolean
  /** Confirmée un jour, mais le terme est passé. */
  expired: boolean
  priceFcfa: number
  durationDays: number
  memberNote: string | null
  startsAt: string | null
  expiresAt: string | null
  refusedFor: string | null
  createdAt: string
  assistant: Assistant
  contact: { phone: string | null; whatsapp: string | null } | null
}

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
    throw new ApiError(data?.message || 'Une erreur est survenue.', res.status, data?.details?.code)
  }
  return data as T
}

export const assistantsApi = {
  /** Les assistants. `gender` filtre sur « homme » ou « femme ». */
  list: (gender?: 'FEMALE' | 'MALE') =>
    request<{ data: Assistant[] }>(`/assistants${gender ? `?gender=${gender}` : ''}`)
      .then(r => r.data),

  /** Mes demandes, la plus récente d'abord. */
  consultations: () =>
    request<{ data: Consultation[] }>('/consultations').then(r => r.data),

  /** Demander une consultation. La note est facultative. */
  demander: (assistantId: string, note?: string, formule: Formule = 'semaine') =>
    request<Consultation>('/consultations', {
      method: 'POST',
      body: JSON.stringify({ assistantId, note, formule }),
    }),

  /** Annuler une demande encore en attente. */
  annuler: (id: string) =>
    request<{ cancelled: boolean }>(`/consultations/${id}`, { method: 'DELETE' }),
}

/** Montant lisible : « 5 000 F CFA ». */
export function formatPrix(fcfa: number): string {
  return `${fcfa.toLocaleString('fr-FR')} F CFA`
}

/** Durée lisible : « 7 jours », « 1 jour ». */
export function formatDuree(jours: number): string {
  return `${jours} jour${jours > 1 ? 's' : ''}`
}

const JOUR_MOIS = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' })

/** Échéance lisible d'une consultation active. */
export function formatEcheance(iso: string): string {
  return JOUR_MOIS.format(new Date(iso))
}

export const GENRE_ASSISTANT: Record<string, string> = {
  FEMALE: 'Femme',
  MALE: 'Homme',
}
