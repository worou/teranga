import { getToken, type MeResponse } from './auth'
import { ApiError, type Photo } from './discovery'

const BASE = '/api/v1'

/**
 * Un message tel que l'API le renvoie.
 *
 * Les messages arrêtés par l'IA anti-brouteur n'apparaissent jamais ici : le
 * serveur les enregistre pour la modération (`blockedByAi`) mais les exclut de
 * la liste. Un message refusé n'existe donc pour personne, pas même pour son
 * auteur — d'où le refus d'afficher une bulle avant la réponse du serveur.
 */
export interface Message {
  id: string
  conversationId: string
  senderId: string
  content: string
  readAt?: string | null
  createdAt: string
}

/** Interlocuteur, tel que résumé par `GET /conversations`. */
export interface Correspondent {
  id: string
  firstName: string
  age: number
  city?: string | null
  profession?: string | null
  isVerified?: boolean
  photos: Photo[]
}

/** Conversation sans son interlocuteur — `GET /conversations/with/:userId`, où
 *  l'appelant connaît déjà le membre concerné. */
export interface ConversationRef {
  id: string
  startedAt: string
  lastMessage: Message | null
  unreadCount: number
}

/** Une entrée de la liste des conversations. */
export interface Conversation extends ConversationRef {
  otherUser: Correspondent
}

export interface Paginated<T> {
  data: T[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

/**
 * Longueur maximale acceptée par `sendMessageSchema` côté serveur. Recopiée
 * ici pour arrêter la saisie avant l'appel plutôt que d'essuyer un 400.
 */
export const MAX_MESSAGE_LENGTH = 2000

/**
 * Appel API. Même forme que dans `discovery.ts` — le helper y est privé, on ne
 * peut pas le réutiliser. `ApiError`, en revanche, est partagée : les appelants
 * testent le même type et le même `code` quelle que soit la route.
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

export const messagesApi = {
  /**
   * Conversations du membre. Le serveur n'y met que celles comptant au moins un
   * message visible : une conversation ouverte sans rien écrire n'apparaît chez
   * personne.
   */
  conversations: (limit = 50) =>
    request<Paginated<Conversation>>(`/conversations?limit=${limit}`),

  /**
   * Total des messages non lus — une seule agrégation côté serveur.
   * L'en-tête le relit à chaque navigation : il ne doit pas y charger toute la
   * liste des conversations, qui n'a plus de borne haute.
   */
  unreadCount: () =>
    request<{ unread: number }>('/conversations/unread-count').then(r => r.unread),

  /**
   * La conversation avec ce membre, ou `null`. Ne crée rien — consulter une
   * fiche ne doit pas faire surgir une conversation vide chez l'autre.
   */
  findWith: (userId: string) =>
    request<{ conversation: ConversationRef | null }>(`/conversations/with/${userId}`)
      .then(r => r.conversation),

  /**
   * Fil d'une conversation, du plus ancien au plus récent — le service se
   * charge de l'ordre. ⚠️ Effet de bord assumé côté serveur : cet appel marque
   * les messages reçus comme lus.
   */
  thread: (conversationId: string, limit = 50) =>
    request<Paginated<Message>>(`/conversations/${conversationId}/messages?limit=${limit}`),

  /** Écrire dans une conversation déjà ouverte. */
  send: (conversationId: string, content: string) =>
    request<Message>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  /**
   * Écrire à un membre. La conversation est ouverte par le serveur si elle
   * n'existe pas encore : c'est le chemin d'entrée depuis une fiche de profil,
   * où l'on connaît la personne mais pas de conversation.
   */
  sendTo: (userId: string, content: string) =>
    request<Message>(`/conversations/with/${userId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
}

const HOUR_MINUTE = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const FULL_DAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

/** Nombre de jours civils écoulés depuis `iso` (0 = aujourd'hui). */
function daysAgo(iso: string): number {
  const then = new Date(iso)
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  return Math.floor((midnight.getTime() - then.getTime()) / 86_400_000) + 1
}

/** Horodatage court de la liste : l'heure aujourd'hui, la date au-delà. */
export function formatListTime(iso: string): string {
  const d = daysAgo(iso)
  if (d <= 0) return HOUR_MINUTE.format(new Date(iso))
  if (d === 1) return 'Hier'
  return DAY_MONTH.format(new Date(iso))
}

/** Heure d'une bulle. */
export function formatBubbleTime(iso: string): string {
  return HOUR_MINUTE.format(new Date(iso))
}

/** Séparateur de journée dans le fil. */
export function formatDaySeparator(iso: string): string {
  const d = daysAgo(iso)
  if (d <= 0) return "Aujourd'hui"
  if (d === 1) return 'Hier'
  return FULL_DAY.format(new Date(iso))
}

/** Vrai si `a` et `b` ne tombent pas le même jour — pose un séparateur. */
export function isNewDay(a: string, b: string): boolean {
  return new Date(a).toDateString() !== new Date(b).toDateString()
}

/**
 * La messagerie est-elle fermée à ce membre ?
 *
 * Miroir de `requireSubscriptionForMessaging` : seuls les hommes paient, les
 * femmes et les personnes non binaires écrivent gratuitement et sans limite.
 * Le serveur reste seul juge — `fallbackEnabled` (le drapeau de construction)
 * ne sert que tant que `/users/me` n'a pas répondu.
 *
 * Version 1 : le système d'abonnement est désactivé, la fonction renvoie donc
 * toujours faux. Elle reprend son effet le jour où le drapeau est relevé.
 */
export function isMessagingLocked(me: MeResponse | null, fallbackEnabled: boolean): boolean {
  const subscriptionsOn = me?.subscriptionsEnabled ?? fallbackEnabled
  if (!subscriptionsOn) return false
  if (me?.gender !== 'MALE') return false

  const sub = me?.subscription
  const hasPaidAccess = !!(
    sub &&
    sub.plan !== 'FREE' &&
    sub.status === 'ACTIVE' &&
    sub.expiresAt &&
    new Date(sub.expiresAt) > new Date()
  )
  return !hasPaidAccess
}
