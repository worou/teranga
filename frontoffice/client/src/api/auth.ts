const BASE = '/api/v1/auth'

export interface RegisterPayload {
  phone: string
  firstName: string
  lastName?: string
  gender: 'FEMALE' | 'MALE' | 'NON_BINARY' | 'UNDISCLOSED'
  birthDate: string
  intent: 'SERIOUS_RELATIONSHIP' | 'MARRIAGE' | 'FAMILY'
  city: string
  country: string
  email?: string
  password?: string
  religion?: string
  profession?: string
}

export interface LoginPayload {
  phone: string
  password: string
}

export interface OtpVerifyPayload {
  phone: string
  code: string
}

export interface AuthResponse {
  accessToken: string
  refreshToken?: string
  redirectUrl?: string
  /** Profil sérialisé par l'API (porte l'état de complétude des photos). */
  user?: MeResponse
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.message || 'Une erreur est survenue.')
  }
  return data as T
}

/**
 * Réponses portant l'OTP. `devCode` n'est renvoyé qu'en développement et
 * seulement si aucun fournisseur SMS n'est configuré : il permet de finaliser
 * l'inscription en local sans compte Twilio. Absent en production.
 */
export interface OtpResponse {
  message?: string
  devCode?: string
  /** Vrai si une inscription non vérifiée existait déjà pour ce numéro. */
  resumed?: boolean
}

export const authApi = {
  register: (payload: RegisterPayload) =>
    post<OtpResponse>('/register', payload),

  login: (payload: LoginPayload) =>
    post<AuthResponse>('/login', payload),

  otpRequest: (phone: string) =>
    post<OtpResponse>('/otp/request', { phone }),

  otpVerify: (payload: OtpVerifyPayload) =>
    post<AuthResponse>('/otp/verify', payload),
}

const TOKEN_KEY = 'teranga_token'
const REFRESH_KEY = 'teranga_refresh'

export function saveTokens(data: AuthResponse) {
  localStorage.setItem(TOKEN_KEY, data.accessToken)
  if (data.refreshToken) localStorage.setItem(REFRESH_KEY, data.refreshToken)
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function isAuthenticated(): boolean {
  return !!getToken()
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

/** Profil renvoyé par GET /users/me (sous-ensemble utilisé par l'UI). */
export interface MeResponse {
  id: string
  firstName: string
  lastName?: string | null
  phone: string
  gender: 'FEMALE' | 'MALE' | 'NON_BINARY' | 'UNDISCLOSED'
  city?: string | null
  country?: string | null
  status: string
  subscription?: { plan: string; status: string; expiresAt?: string | null } | null
  /** Complétude du profil — l'API est seule juge du seuil (config.profile). */
  photos?: UploadedPhoto[]
  photosCount?: number
  profileComplete?: boolean
  minPhotos?: number
  maxPhotos?: number
  /** Modèle freemium actif côté serveur. Faux en version 1. */
  subscriptionsEnabled?: boolean
}

/** Récupère le profil courant. Lève si le token est absent/expiré (401). */
export async function fetchMe(): Promise<MeResponse> {
  const token = getToken()
  if (!token) throw new Error('Non authentifié')
  const res = await fetch('/api/v1/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.message || 'Session expirée.')
  return data as MeResponse
}

export interface UploadedPhoto {
  id: string
  url: string
  isMain: boolean
  order: number
}

/**
 * Upload de photos (multipart). IMPORTANT : ne PAS fixer de Content-Type —
 * le navigateur génère lui-même la frontière multipart pour le FormData.
 */
export async function uploadPhotos(files: File[], token: string): Promise<UploadedPhoto[]> {
  const form = new FormData()
  files.forEach(f => form.append('photos', f))

  const res = await fetch('/api/v1/users/me/photos/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.message || "Échec de l'envoi des photos.")
  }
  return data as UploadedPhoto[]
}
