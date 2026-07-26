import { getToken } from './auth'

const BASE = '/api/v1'

export type PlanKey = 'DISCOVERY' | 'STANDARD' | 'ENGAGEMENT'

export interface PlanInfo {
  amount: number
  months: number
  monthlyDisplay?: number
  currency: string
}
export type PricingCatalog = Record<PlanKey, PlanInfo>

export interface PaymentMethod {
  method: string
  label: string
  isMobileMoney: boolean
}
export interface MethodsResponse {
  country: string
  supported: boolean
  dialingCode: string | null
  methods: PaymentMethod[]
}

export interface BankTransferDetails {
  beneficiary: string
  iban: string
  bic: string
  bankName: string
  reference: string    // motif à indiquer lors du virement
  amountEur: string
  amountFcfa: number
  currency: string     // 'EUR'
}

export interface SubscribeResponse {
  paymentId: string
  paymentUrl: string | null
  ussdInstruction?: string
  amountEur?: string   // présent pour PayPal (montant converti)
  currency?: string    // 'EUR' pour PayPal
  bankTransfer?: BankTransferDetails // présent pour le virement bancaire
  expiresAt: string
}

export interface PaymentStatus {
  id: string
  plan: PlanKey
  method: string
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED'
  amountFcfa: number
  failureReason?: string | null
}

/** fetch authentifié : ajoute le Bearer et remonte le message d'erreur API. */
async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as any)?.message || 'Une erreur est survenue.')
  }
  return data as T
}

export const paymentsApi = {
  pricing: () => authFetch<PricingCatalog>('/pricing'),

  methods: () => authFetch<MethodsResponse>('/payments/methods'),

  subscribe: (body: { plan: PlanKey; method: string; phoneNumber?: string; autoRenew: boolean }) =>
    authFetch<SubscribeResponse>('/payments/subscribe', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  status: (paymentId: string) =>
    authFetch<PaymentStatus>(`/payments/${paymentId}/status`),
}
