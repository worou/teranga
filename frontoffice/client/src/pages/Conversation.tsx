import { useEffect, useRef, useState } from 'react'
import { useFilConversation } from '../hooks/useFilConversation'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import MessageComposer from '../components/MessageComposer'
import { SUBSCRIPTIONS_ENABLED } from '../config'
import { fetchMe, type MeResponse } from '../api/auth'
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
import { ModerationActions } from '../components/ModerationActions'

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
 *
 * Toute cette mécanique vit dans `useFilConversation`, que partage le tiroir
 * de messagerie de l'en-tête. Cet écran n'en garde que la mise en page, le
 * défilement — l'élément défilant lui est propre — et l'interlocuteur.
 */
export default function Conversation() {
  const { conversationId = '' } = useParams()
  const navigate = useNavigate()

  const [me, setMe] = useState<MeResponse | null>(null)
  const [summary, setSummary] = useState<ConversationSummary | null>(null)
  const { messages, loading, error, appendMessages } = useFilConversation(conversationId)

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

          {/* Le second endroit où l'on décide d'arrêter : c'est dans la
              conversation, pas sur la fiche, qu'un échange dérape. Y renvoyer
              le membre serait lui demander un détour au pire moment. */}
          {other && (
            <div className={styles.threadActions}>
              <ModerationActions
                userId={other.id}
                firstName={other.firstName}
                onBlocked={() => setTimeout(() => navigate('/messages'), 1800)}
              />
            </div>
          )}
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
