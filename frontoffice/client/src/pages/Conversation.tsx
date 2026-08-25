import { useCallback, useEffect, useRef, useState } from 'react'
import { useConversationSocket } from '../hooks/useConversationSocket'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import MessageComposer from '../components/MessageComposer'
import { SUBSCRIPTIONS_ENABLED } from '../config'
import { ApiError } from '../api/discovery'
import { clearTokens, fetchMe, type MeResponse } from '../api/auth'
import {
  messagesApi,
  formatBubbleTime,
  formatDaySeparator,
  isNewDay,
  isMessagingLocked,
  type Conversation as ConversationSummary,
  type Message,
} from '../api/messages'
import styles from './Messagerie.module.css'

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
 * Fil d'une conversation.
 *
 * Temps réel par Socket.IO : le serveur diffusait déjà chaque message dans
 * `conversation:<id>`, mais aucun client ne rejoignait ces salles. Le fil se
 * rafraîchissait donc toutes les huit secondes en retransmettant cinquante
 * messages — pour, la plupart du temps, ne rien afficher de nouveau.
 *
 * Trois sources alimentent désormais le fil : la lecture initiale, la socket,
 * et l'écho de son propre envoi. Toutes convergent vers `appendMessages`, qui
 * dédoublonne par identifiant — sans quoi un message envoyé apparaîtrait deux
 * fois, une fois en optimiste et une fois par diffusion.
 */
export default function Conversation() {
  const { conversationId = '' } = useParams()
  const navigate = useNavigate()

  const [me, setMe] = useState<MeResponse | null>(null)
  const [summary, setSummary] = useState<ConversationSummary | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
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

  const scroller = useRef<HTMLDivElement>(null)
  /** Vrai tant que l'utilisateur n'a pas remonté le fil : on suit alors le bas. */
  const stickToBottom = useRef(true)

  // --- Interlocuteur -------------------------------------------------------
  // Le fil ne porte que des messages ; l'identité de l'interlocuteur vient de
  // la liste des conversations, où l'on pioche l'entrée voulue.
  useEffect(() => {
    let alive = true

    fetchMe()
      .then(data => { if (alive) setMe(data) })
      .catch(() => { /* les bulles se placent quand /users/me a répondu */ })

    messagesApi
      .conversations()
      .then(res => {
        if (!alive) return
        setSummary(res.data.find(c => c.id === conversationId) ?? null)
      })
      .catch(() => { /* l'échec parlant vient du chargement du fil, ci-dessous */ })

    return () => { alive = false }
  }, [conversationId])

  // --- Fil -----------------------------------------------------------------
  const load = useCallback(
    async (silent: boolean) => {
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

  // --- Temps réel ----------------------------------------------------------
  // Un message reçu par socket entre par le même chemin que les autres : il est
  // dédoublonné, replacé dans l'ordre, et suit le bas du fil si l'on y était.
  const { connected } = useConversationSocket(conversationId, message => {
    appendMessages([message])
  })

  useEffect(() => {
    setLoading(true)
    load(false)
  }, [load])

  useEffect(() => {
    if (error) return // fil illisible (conversation introuvable) : inutile d'insister
    // Le rythme suit l'état de la socket : lent quand elle délivre, resserré
    // quand elle est tombée — le sondage redevient alors le seul canal.
    const id = setInterval(() => {
      // Onglet en arrière-plan : personne ne lit, on n'interroge pas.
      if (document.visibilityState === 'visible') load(true)
    }, connected ? POLL_MS : POLL_MS_OFFLINE)
    return () => clearInterval(id)
  }, [load, error, connected])

  // --- Défilement ----------------------------------------------------------
  useEffect(() => {
    const el = scroller.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [messages, loading])

  function onScroll() {
    const el = scroller.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  /**
   * Message accepté par le serveur : on l'affiche sans attendre sa diffusion.
   *
   * La socket le renverra sans doute juste après ; `appendMessages` l'ignorera,
   * son identifiant étant déjà connu.
   */
  function onSent(message: Message) {
    appendMessages([message])
    stickToBottom.current = true
  }

  const locked = isMessagingLocked(me, SUBSCRIPTIONS_ENABLED)
  const other = summary?.otherUser

  return (
    <div className={styles.page}>
      <AppHeader initial={me?.firstName} />

      <div className={styles.thread}>
        <div className={styles.threadHead}>
          <Link to="/messages" className={styles.back} aria-label="Retour aux conversations">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>

          <div className={styles.threadWho}>
            {other ? (
              <>
                <Link to={`/profil/${other.id}`} className={styles.threadName}>
                  {other.firstName}
                  {other.isVerified && <span className={styles.verified} title="Profil vérifié">✓</span>}
                </Link>
                <div className={styles.threadMeta}>
                  {[other.age ? `${other.age} ans` : null, other.city, other.profession]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </>
            ) : (
              <span className={styles.threadName}>Conversation</span>
            )}
          </div>
        </div>

        <div className={styles.scroller} ref={scroller} onScroll={onScroll}>
          {/* Cale le fil sur le bas tant qu'il ne remplit pas la hauteur : une
              conversation naissante commence au ras de la zone de saisie, pas
              suspendue en haut d'un grand vide. */}
          <div className={styles.spacer} />

          {loading && <p className={styles.muted}>Chargement de la conversation…</p>}

          {!loading && error && (
            <div className={styles.opener}>
              <strong>Conversation indisponible</strong>
              {error}
              <div style={{ marginTop: 18 }}>
                <Link to="/messages" className="btn btn-ghost">Revenir aux conversations</Link>
              </div>
            </div>
          )}

          {!loading && !error && messages.length === 0 && (
            <div className={styles.opener}>
              <strong>{other ? `Écrivez à ${other.firstName}` : 'Nouvelle conversation'}</strong>
              Une question sur son profil vaut mieux qu'un simple « salut ».
            </div>
          )}

          {!error &&
            messages.map((m, i) => {
              const previous = messages[i - 1]
              const mine = m.senderId === me?.id
              const separator = !previous || isNewDay(previous.createdAt, m.createdAt)
              return (
                <div key={m.id} style={{ display: 'contents' }}>
                  {separator && (
                    <div className={styles.daySeparator}>{formatDaySeparator(m.createdAt)}</div>
                  )}
                  <div className={`${styles.bubble} ${mine ? styles.mine : styles.theirs}`}>
                    {m.content}
                    <span className={styles.bubbleTime}>{formatBubbleTime(m.createdAt)}</span>
                  </div>
                </div>
              )
            })}
        </div>

        {!error && (
          <div className={styles.composerZone}>
            {locked ? (
              <div className={styles.upsell}>
                <strong>Débloquez la messagerie 💬</strong>
                <p>
                  L'accès à la messagerie est réservé aux membres abonnés.
                  Les femmes échangent gratuitement et sans limite.
                </p>
                <Link to="/abonnement" className="btn btn-primary">
                  S'abonner — dès 1 000 F CFA
                </Link>
              </div>
            ) : (
              <MessageComposer
                send={content => messagesApi.send(conversationId, content)}
                placeholder={other ? `Écrire à ${other.firstName}…` : 'Écrire un message…'}
                onSent={onSent}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
