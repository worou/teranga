import { io, type Socket } from 'socket.io-client'
import { getToken } from './auth'

/**
 * Connexion temps réel partagée.
 *
 * Le serveur diffusait déjà chaque message dans `conversation:<id>` — mais
 * aucun client web ne rejoignait ces salles : le fil se rafraîchissait
 * uniquement par interrogation périodique, à huit secondes d'intervalle. La
 * diffusion partait dans le vide.
 *
 * Une seule socket pour toute l'application : ouvrir une connexion par écran
 * multiplierait les poignées de main et les authentifications pour rien.
 *
 * Le jeton part dans `auth` de la poignée de main — le serveur le vérifie et
 * refuse la connexion s'il est invalide. Il n'y a donc rien à tenter sans
 * jeton : `connectSocket` renvoie alors `null`.
 */

let socket: Socket | null = null

export function connectSocket(): Socket | null {
  const token = getToken()
  if (!token) return null

  if (socket?.connected || socket?.active) return socket

  socket = io({
    // Même origine : Vite relaie /socket.io vers l'API en développement.
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    // La reconnexion est automatique ; les salles, elles, ne le sont pas —
    // c'est à l'appelant de rejoindre à nouveau sur `connect` (cf. useConversationSocket).
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
  })

  return socket
}

/** Ferme la connexion partagée (déconnexion, expiration de session). */
export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
