import { useEffect, useRef, useState } from 'react'
import { connectSocket } from '../api/socket'
import type { Message } from '../api/messages'

/**
 * Abonne le fil affiché aux messages diffusés en temps réel.
 *
 * Rejoint `conversation:<id>` à l'ouverture, quitte à la fermeture. Le serveur
 * vérifie l'appartenance avant d'accorder l'adhésion : demander une salle dont
 * on n'est pas participant ne donne rien (`join_denied`).
 *
 * ⚠️ La salle n'est PAS rejointe à nouveau toute seule après une coupure : la
 * reconnexion de Socket.IO restaure la connexion, pas les adhésions. D'où le
 * `on('connect')` ci-dessous, sans lequel un fil resterait muet après le
 * moindre passage en veille.
 *
 * Le sondage subsiste en filet dans `Conversation.tsx`, à un rythme lent :
 * une socket peut tomber sans que rien ne le signale à l'écran.
 */
export function useConversationSocket(
  conversationId: string,
  onMessage: (message: Message) => void,
) {
  const [connected, setConnected] = useState(false)
  /** Référence vivante : évite de re-souscrire à chaque rendu du parent. */
  const handler = useRef(onMessage)
  handler.current = onMessage

  useEffect(() => {
    if (!conversationId) return
    const socket = connectSocket()
    if (!socket) return

    const join = () => {
      setConnected(true)
      socket.emit('join_conversation', conversationId)
    }
    const onDisconnect = () => setConnected(false)
    const onNewMessage = (message: Message) => handler.current(message)

    if (socket.connected) join()
    socket.on('connect', join)
    socket.on('disconnect', onDisconnect)
    socket.on('new_message', onNewMessage)

    return () => {
      socket.emit('leave_conversation', conversationId)
      socket.off('connect', join)
      socket.off('disconnect', onDisconnect)
      socket.off('new_message', onNewMessage)
    }
  }, [conversationId])

  return { connected }
}
