import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { ApiError } from '../api/discovery'
import { clearTokens, fetchMe, type MeResponse } from '../api/auth'
import { messagesApi, formatListTime, type Conversation } from '../api/messages'
import styles from './Messagerie.module.css'

/**
 * Liste des conversations.
 *
 * `GET /conversations` porte déjà le dernier message et le nombre de non-lus,
 * et n'y met que les conversations comptant au moins un message visible : une
 * conversation ouverte sans rien écrire n'apparaît nulle part.
 */
export default function Messages() {
  const navigate = useNavigate()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true

    fetchMe()
      .then(data => { if (alive) setMe(data) })
      .catch(() => { /* l'en-tête se contente de l'initiale : jamais bloquant */ })

    messagesApi
      .conversations()
      .then(res => {
        if (!alive) return
        // L'API trie par date d'ouverture ; on trie par dernière activité, seul
        // ordre utile dans une messagerie.
        const sorted = [...res.data].sort(
          (a, b) =>
            new Date(b.lastMessage?.createdAt ?? b.startedAt).getTime() -
            new Date(a.lastMessage?.createdAt ?? a.startedAt).getTime(),
        )
        setConversations(sorted)
      })
      .catch(err => {
        if (!alive) return
        // Inscription non finalisée : `canAct` exige le minimum de photos.
        // On renvoie à l'étape photos, seule action qui débloque la situation.
        if (err instanceof ApiError && err.code === 'PHOTOS_REQUIRED') {
          navigate('/inscription', { replace: true })
          return
        }
        if (err instanceof ApiError && err.status === 401) {
          clearTokens()
          navigate('/connexion', { replace: true })
          return
        }
        setError(err instanceof Error ? err.message : 'Chargement impossible.')
      })
      .finally(() => { if (alive) setLoading(false) })

    return () => { alive = false }
  }, [navigate])

  return (
    <div className={styles.page}>
      <AppHeader initial={me?.firstName} />

      <div className={styles.wrap}>
        <div className={styles.head}>
          <h1 className={styles.title}>Mes <em>conversations</em></h1>
          <p className={styles.subtitle}>
            Vous pouvez écrire à n'importe quel membre, depuis sa fiche de profil.
          </p>
        </div>

        {error && (
          <div className={styles.alertError}><span>⚠</span> {error}</div>
        )}

        {loading && <p className={styles.muted}>Chargement de vos conversations…</p>}

        {!loading && !error && conversations.length === 0 && (
          <div className={styles.empty}>
            <h2>Aucune conversation pour l'instant</h2>
            <p>
              Parcourez les profils et écrivez au premier qui vous plaît :
              la conversation s'ouvre dès votre premier message.
            </p>
            <Link to="/decouverte" className="btn btn-primary">Découvrir des profils</Link>
          </div>
        )}

        {conversations.length > 0 && (
          <div className={styles.list}>
            {conversations.map(c => (
              <ConversationRow key={c.id} conversation={c} myId={me?.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ConversationRow({
  conversation,
  myId,
}: {
  conversation: Conversation
  myId?: string
}) {
  const { otherUser: other, lastMessage, unreadCount } = conversation
  const photo = other.photos?.[0]?.url
  const mineLast = !!lastMessage && !!myId && lastMessage.senderId === myId

  return (
    <Link
      to={`/messages/${conversation.id}`}
      className={`${styles.row} ${unreadCount > 0 ? styles.unread : ''}`}
    >
      {photo ? (
        <img className={styles.avatar} src={photo} alt={other.firstName} loading="lazy" />
      ) : (
        <div className={`${styles.avatar} ${styles.avatarFallback}`}>
          {other.firstName.slice(0, 1).toUpperCase()}
        </div>
      )}

      <div className={styles.rowBody}>
        <div className={styles.rowTop}>
          <span className={styles.name}>{other.firstName}</span>
          {other.age ? <span className={styles.age}>{other.age} ans</span> : null}
          {other.isVerified && <span className={styles.verified} title="Profil vérifié">✓</span>}
          <span className={styles.time}>
            {formatListTime(lastMessage?.createdAt ?? conversation.startedAt)}
          </span>
        </div>

        <div className={`${styles.preview} ${unreadCount > 0 ? styles.strong : ''}`}>
          {lastMessage ? (
            <>
              {mineLast && <span className={styles.previewMine}>Vous : </span>}
              {lastMessage.content}
            </>
          ) : (
            // Le serveur ne renvoie que les conversations ayant au moins un
            // message ; ce repli ne devrait pas s'afficher.
            <em>Aucun message.</em>
          )}
        </div>
      </div>

      {unreadCount > 0 && (
        <span className={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
      )}
    </Link>
  )
}
