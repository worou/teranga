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

export const authApi = {
  register: (payload: RegisterPayload) =>
    post<{ message: string }>('/register', payload),

  login: (payload: LoginPayload) =>
    post<AuthResponse>('/login', payload),

  otpRequest: (phone: string) =>
    post<{ message: string }>('/otp/request', { phone }),

  otpVerify: (payload: OtpVerifyPayload) =>
    post<AuthResponse>('/otp/verify', payload),
}

export function saveTokens(data: AuthResponse) {
  localStorage.setItem('teranga_token', data.accessToken)
  if (data.refreshToken) localStorage.setItem('teranga_refresh', data.refreshToken)
}
