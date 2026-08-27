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

/**
 * Identifiant du compte pour les codes de vérification : e-mail OU téléphone.
 *
 * La connexion par code se fait par e-mail ; le téléphone reste accepté, car
 * l'inscription s'en sert encore. Côté serveur, l'e-mail est traduit en
 * téléphone avant toute écriture — les codes y sont stockés par numéro.
 */
export interface OtpIdentifiant {
  phone?: string
  email?: string
}

export interface LoginPayload extends OtpIdentifiant {
  password: string
}

export interface OtpVerifyPayload extends OtpIdentifiant {
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
  /** Vrai si une inscription non vérifiée existait déjà pour ce compte. */
  resumed?: boolean
}

export const authApi = {
  register: (payload: RegisterPayload) =>
    post<OtpResponse>('/register', payload),

  login: (payload: LoginPayload) =>
    post<AuthResponse>('/login', payload),

  otpRequest: (id: OtpIdentifiant) =>
    post<OtpResponse>('/otp/request', id),

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
  /** Publication des photos aux autres membres : 'PUBLIC' ou 'PRIVATE'. */
  photosVisibility?: string
  minPhotos?: number
  maxPhotos?: number
  /** Modèle freemium actif côté serveur. Faux en version 1. */
  subscriptionsEnabled?: boolean

  // Champs modifiables depuis « Mon profil » (cf. updateProfileSchema).
  bio?: string | null
  profession?: string | null
  educationLevel?: string | null
  religion?: string | null
  intent?: string | null
  hasChildren?: boolean
  wantsChildren?: boolean | null
  heightCm?: number | null
  weightKg?: number | null
  bodyType?: string | null
  ethnicity?: string | null
  /** Codes ISO. L'API expose et attend un tableau ; le stockage est interne. */
  languages?: string[]
}

/** Champs acceptés par PATCH /users/me. `null` efface une valeur. */
export interface ProfileUpdate {
  firstName?: string
  lastName?: string
  bio?: string
  profession?: string
  city?: string
  educationLevel?: string
  religion?: string
  intent?: string
  /** 'PUBLIC' ou 'PRIVATE' — voir l'enum PhotosVisibility côté schéma. */
  photosVisibility?: string
  hasChildren?: boolean
  wantsChildren?: boolean | null
  heightCm?: number | null
  weightKg?: number | null
  bodyType?: string | null
  ethnicity?: string | null
  languages?: string[] | null
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

function authHeaders(): Record<string, string> {
  const token = getToken()
  if (!token) throw new Error('Non authentifié')
  return { Authorization: `Bearer ${token}` }
}

/** Enregistre les modifications du profil et renvoie le profil relu. */
export async function updateMe(patch: ProfileUpdate): Promise<MeResponse> {
  const res = await fetch('/api/v1/users/me', {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.message || 'Enregistrement impossible.')
  return data as MeResponse
}

/**
 * Supprime une photo. Repasser sous le minimum exigé suspend l'accès à la
 * découverte et à la messagerie : l'appelant doit prévenir avant.
 */
export async function deletePhoto(photoId: string): Promise<void> {
  const res = await fetch(`/api/v1/users/me/photos/${photoId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.message || 'Suppression impossible.')
  }
}

/** Définit la photo principale (celle affichée sur les cartes). Route en PUT. */
export async function setMainPhoto(photoId: string): Promise<void> {
  const res = await fetch(`/api/v1/users/me/photos/${photoId}/main`, {
    method: 'PUT',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.message || 'Mise à jour impossible.')
  }
}
