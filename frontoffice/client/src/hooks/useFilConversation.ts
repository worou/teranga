import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useConversationSocket } from './useConversationSocket'
import { ApiError } from '../api/discovery'
import { clearTokens } from '../api/auth'
import { messagesApi, type Message } from '../api/messages'

/** Intervalle de rafraîchissement du fil, en millisecondes. */
/**
 * Filet de sécurité, pas mécanisme principal.
 *
 * Les messages arrivent par socket. Le sondage ne sert qu'au cas où elle est
 * tombée sans le dire — d'où un rythme lent, et une lecture incrémentale qui
 * ne redemande que ce qui a suivi le dernier message détenu.
 */
const POLL_MS = 45_000

/** Socket absente ou coupée : le sondage redevient le seul canal, on l'accélère. */
const POLL_MS_OFFLINE = 8_000

/**
 * Le fil d'une conversation : lecture, temps réel, et rattrapage.
 *
 * Extrait de `Conversation.tsx` pour servir aussi le tiroir de messagerie. Ce
 * n'est pas une économie de lignes : trois sources alimentent le fil (lecture
 * initiale, socket, écho de son propre envoi) et toutes convergent vers
 * `appendMessages`, qui dédoublonne par identifiant. Une seconde copie de cette
 * convergence, c'est la certitude qu'un jour l'une des deux affichera les
 * messages en double.
 *
 * `conversationId` vide est un état légitime, pas une erreur : le tiroir
 * s'ouvre sur la pile des vignettes avant qu'aucune conversation ne soit
 * choisie. Le hook reste alors inerte — aucune requête, aucun sondage.
 *
 * ⚠️ Lire un fil le marque comme lu côté serveur. Ce hook ne doit donc pas
 * être monté avec un identifiant que l'utilisateur n'a pas explicitement
 * ouvert : cela effacerait ses non-lus sans qu'il ait rien vu.
 */
export function useFilConversation(conversationId: string) {
  const navigate = useNavigate()

  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  /** Panne de chargement : le fil n'est pas lisible, on cesse d'interroger. */
  const [error, setError] = useState('')

  /** Horodatage du dernier message détenu : borne des lectures incrémentales. */
  const lastAt = useRef<string | null>(null)

  /**
   * Fusionne des messages dans le fil, sans doublon et en ordre chronologique.
   *
   * Le dédoublonnage par identifiant est ce qui rend inoffensifs à la fois le
   * recouvrement de borne du sondage (`gte`) et la course entre l'ajout
   * optimiste d'un envoi et sa diffusion par socket.
   */
  const appendMessages = useCallback((incoming: Message[]) => {
    if (incoming.length === 0) return
    setMessages(prev => {
      const seen = new Set(prev.map(m => m.id))
      const fresh = incoming.filter(m => !seen.has(m.id))
      if (fresh.length === 0) return prev
      const merged = [...prev, ...fresh].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
      lastAt.current = merged[merged.length - 1].createdAt
      return merged
    })
  }, [])

  const load = useCallback(
    async (silent: boolean) => {
      if (!conversationId) return
      try {
        // Première lecture : le fil entier. Sondages suivants : seulement la
        // suite, ce qui rend une conversation au repos quasiment gratuite.
        const since = silent ? lastAt.current ?? undefined : undefined
        const res = await messagesApi.thread(conversationId, 50, since)
        if (since) {
          appendMessages(res.data)
        } else {
          setMessages(res.data)
          lastAt.current = res.data.length ? res.data[res.data.length - 1].createdAt : null
        }
        setError('')
      } catch (err) {
        if (err instanceof ApiError && err.code === 'PHOTOS_REQUIRED') {
          navigate('/inscription', { replace: true })
          return
        }
        if (err instanceof ApiError && err.status === 401) {
          clearTokens()
          navigate('/connexion', { replace: true })
          return
        }
        // Un rafraîchissement silencieux qui échoue ne doit pas effacer un fil
        // déjà affiché : seule la première lecture pose une erreur d'écran.
        if (!silent) {
          setError(err instanceof Error ? err.message : 'Conversation illisible.')
        }
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [conversationId, navigate, appendMessages],
  )

  // Un message reçu par socket entre par le même chemin que les autres : il est
  // dédoublonné et replacé dans l'ordre.
  const { connected } = useConversationSocket(conversationId, message => {
    appendMessages([message])
  })

  useEffect(() => {
    // Changer de conversation, c'est repartir d'un fil vierge : sans cela, les
    // messages de la précédente resteraient affichés le temps du chargement.
    setMessages([])
    lastAt.current = null
    setError('')
    if (!conversationId) { setLoading(false); return }
    setLoading(true)
    load(false)
  }, [conversationId, load])

  useEffect(() => {
    if (!conversationId) return
    if (error) return // fil illisible (conversation introuvable) : inutile d'insister
    // Le rythme suit l'état de la socket : lent quand elle délivre, resserré
    // quand elle est tombée — le sondage redevient alors le seul canal.
    const id = setInterval(() => {
      // Onglet en arrière-plan : personne ne lit, on n'interroge pas.
      if (document.visibilityState === 'visible') load(true)
    }, connected ? POLL_MS : POLL_MS_OFFLINE)
    return () => clearInterval(id)
  }, [conversationId, load, error, connected])

  return { messages, loading, error, appendMessages, connected }
}
