import { getToken } from './auth'
import { ApiError, type Photo } from './discovery'

/**
 * Blocage et signalement.
 *
 * Les deux existaient côté serveur depuis le début — `POST /moderation/blocks`,
 * `DELETE /moderation/blocks/:id`, `POST /moderation/reports` — et n'étaient
 * appelés de nulle part. La mécanique fonctionnait donc parfaitement sans que
 * personne puisse s'en servir : un membre importuné n'avait aucun moyen de
 * faire disparaître l'autre, ni de le signaler.
 *
 * Ce sont deux gestes distincts, et il faut les proposer tous les deux :
 *   — BLOQUER agit pour soi, immédiatement et symétriquement : chacun sort du
 *     fil de l'autre, et l'écriture est refusée dans les deux sens ;
 *   — SIGNALER n'a aucun effet visible pour l'auteur du signalement, mais fait
 *     remonter le cas à la modération. Sans lui, la file du backoffice ne
 *     reçoit que ce que le filtre anti-brouteur détecte tout seul — un
 *     comportement déplacé qui n'emploie aucun mot suspect n'arrive jamais.
 */

const BASE = '/api/v1'

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

/** Motifs acceptés par `reportSchema`. L'ordre est celui de la liste affichée. */
export const MOTIFS_SIGNALEMENT = [
  ['HARASSMENT', 'Harcèlement ou insultes'],
  ['SCAM', 'Demande d’argent, arnaque'],
  ['FAKE_PROFILE', 'Faux profil, usurpation'],
  ['INAPPROPRIATE_CONTENT', 'Contenu inapproprié'],
  ['SPAM', 'Publicité, spam'],
  ['OTHER', 'Autre'],
] as const

export type MotifSignalement = (typeof MOTIFS_SIGNALEMENT)[number][0]

/** Une entrée de la liste des personnes bloquées. */
export interface Blocage {
  id: string
  createdAt: string
  blocked: {
    id: string
    firstName: string
    /** Vide si la personne ne publie pas ses photos — l'écran affiche l'initiale. */
    photos: Photo[]
  }
}

export const moderationApi = {
  bloquer: (blockedUserId: string, reason?: string) =>
    request<{ id: string }>('/moderation/blocks', {
      method: 'POST',
      body: JSON.stringify({ blockedUserId, ...(reason ? { reason } : {}) }),
    }),

  debloquer: (blockedUserId: string) =>
    request<{ unblocked: boolean }>(`/moderation/blocks/${blockedUserId}`, { method: 'DELETE' }),

  listerBlocages: () => request<Blocage[]>('/moderation/blocks'),

  signaler: (reportedUserId: string, reason: MotifSignalement, description?: string) =>
    request<{ id: string }>('/moderation/reports', {
      method: 'POST',
      body: JSON.stringify({
        reportedUserId,
        reason,
        ...(description?.trim() ? { description: description.trim() } : {}),
      }),
    }),
}
