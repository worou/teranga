import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import MessageComposer from './MessageComposer'
import { useFilConversation } from '../hooks/useFilConversation'
import { SUBSCRIPTIONS_ENABLED } from '../config'
import { fetchMe, type MeResponse } from '../api/auth'
import {
  messagesApi,
  formatBubbleTime,
  formatDaySeparator,
  isNewDay,
  isMessagingLocked,
  type Conversation,
  type Message,
} from '../api/messages'
import styles from './TiroirMessages.module.css'

/**
 * Tiroir de messagerie, ouvert depuis l'icône de l'en-tête.
 *
 * Sur le bord, la pile des vignettes : tous les membres avec qui l'on a déjà
 * échangé, du plus récent au plus ancien. On passe de l'un à l'autre sans
 * quitter la page qu'on lisait — c'est tout l'intérêt d'un tiroir plutôt que
 * d'un écran.
 *
 * AUCUNE conversation n'est ouverte automatiquement, et ce n'est pas un oubli :
 * lire un fil le marque comme lu côté serveur. Ouvrir la plus récente à
 * l'ouverture du tiroir ferait disparaître la pastille de non-lus sans que rien
 * n'ait été lu — le geste même de vérifier ses messages les effacerait.
 *
 * La pastille des vignettes compte les messages non lus. Les captures qui ont
 * inspiré cet écran affichaient une présence en ligne : Téranga n'en a pas, et
 * un point vert qui ne prouve rien vaut moins que pas de point du tout.
 */
export default function TiroirMessages({
  ouvert,
  onFermer,
  onLu,
}: {
  ouvert: boolean
  onFermer: () => void
  /** Des non-lus viennent d'être consommés : l'en-tête doit recompter. */
  onLu: () => void
}) {
  const navigate = useNavigate()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [choisie, setChoisie] = useState<string>('')
  const [chargementListe, setChargementListe] = useState(false)
  const [erreurListe, setErreurListe] = useState('')

  const { messages, loading, error, appendMessages } = useFilConversation(choisie)

  const scroller = useRef<HTMLDivElement>(null)
  /** Vrai tant que l'utilisateur n'a pas remonté le fil : on suit alors le bas. */
  const colleEnBas = useRef(true)

  // --- Chargement de la pile ----------------------------------------------
  // Rechargée à chaque ouverture : entre deux consultations, l'ordre et les
  // non-lus ont pu changer. Fermé, le tiroir n'interroge rien.
  useEffect(() => {
    if (!ouvert) return
    let vivant = true
    setChargementListe(true)

    fetchMe()
      .then(d => { if (vivant) setMe(d) })
      .catch(() => { /* les bulles se placent quand /users/me a répondu */ })

    messagesApi
      .conversations()
      .then(res => {
        if (!vivant) return
        // L'API trie par date d'ouverture ; on trie par dernière activité, seul
        // ordre utile dans une messagerie.
        setConversations(
          [...res.data].sort(
            (a, b) =>
              new Date(b.lastMessage?.createdAt ?? b.startedAt).getTime() -
              new Date(a.lastMessage?.createdAt ?? a.startedAt).getTime(),
          ),
        )
        setErreurListe('')
      })
      .catch(err => {
        if (!vivant) return
        setErreurListe(err instanceof Error ? err.message : 'Chargement impossible.')
      })
      .finally(() => { if (vivant) setChargementListe(false) })

    return () => { vivant = false }
  }, [ouvert])

  // --- Fermeture -----------------------------------------------------------
  useEffect(() => {
    if (!ouvert) return
    const auClavier = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer() }
    document.addEventListener('keydown', auClavier)
    // La page derrière ne doit pas défiler sous le tiroir.
    const avant = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', auClavier)
      document.body.style.overflow = avant
    }
  }, [ouvert, onFermer])

  // --- Défilement ----------------------------------------------------------
  useEffect(() => {
    const el = scroller.current
    if (el && colleEnBas.current) el.scrollTop = el.scrollHeight
  }, [messages, loading, choisie])

  function auDefilement() {
    const el = scroller.current
    if (!el) return
    colleEnBas.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  function ouvrir(id: string) {
    colleEnBas.current = true
    setChoisie(id)
    // Le fil qu'on ouvre sera marqué lu par le serveur : la pastille de
    // l'en-tête doit suivre, et celle de la vignette disparaître.
    setConversations(cs => cs.map(c => (c.id === id ? { ...c, unreadCount: 0 } : c)))
    onLu()
  }

  function auEnvoi(message: Message) {
    appendMessages([message])
    colleEnBas.current = true
  }

  function versLeProfil(id: string) {
    onFermer()
    navigate(`/profil/${id}`)
  }

  if (!ouvert) return null

  const active = conversations.find(c => c.id === choisie) ?? null
  const autre = active?.otherUser
  const verrouille = isMessagingLocked(me, SUBSCRIPTIONS_ENABLED)

  return (
    <div
      className={styles.fond}
      onPointerDown={e => { if (e.target === e.currentTarget) onFermer() }}
    >
      <aside className={styles.tiroir} role="dialog" aria-modal="true" aria-label="Mes conversations">
        <div className={styles.panneau}>
          <header className={styles.entete}>
            {active && autre ? (
              <>
                <Vignette conversation={active} taille={40} />
                <div className={styles.qui}>
                  <button
                    type="button"
                    className={styles.nom}
                    onClick={() => versLeProfil(autre.id)}
                  >
                    {autre.firstName}
                    {autre.isVerified && <span className={styles.verifie} title="Profil vérifié">✓</span>}
                  </button>
                  <span className={styles.meta}>
                    {[autre.age ? `${autre.age} ans` : null, autre.city]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
              </>
            ) : (
              <div className={styles.qui}>
                <span className={styles.nom}>Mes conversations</span>
                <span className={styles.meta}>
                  {conversations.length > 0
                    ? `${conversations.length} ${conversations.length > 1 ? 'échanges' : 'échange'}`
                    : 'Aucun échange'}
                </span>
              </div>
            )}

            <button
              type="button"
              className={styles.fermer}
              onClick={onFermer}
              aria-label="Fermer la messagerie"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          <div className={styles.corps} ref={scroller} onScroll={auDefilement}>
            {/* Cale le fil sur le bas tant qu'il ne remplit pas la hauteur. */}
            <div className={styles.cale} />

            {erreurListe && <p className={styles.vide}>{erreurListe}</p>}

            {!erreurListe && chargementListe && !choisie && (
              <p className={styles.vide}>Chargement de vos conversations…</p>
            )}

            {/* Pile vide : rien à choisir, on renvoie là où l'on rencontre. */}
            {!erreurListe && !chargementListe && conversations.length === 0 && (
              <div className={styles.accueil}>
                <strong>Aucune conversation</strong>
                <p>
                  Écrivez au premier profil qui vous plaît : la conversation
                  s'ouvre dès votre premier message.
                </p>
                <Link to="/decouverte" className="btn btn-primary" onClick={onFermer}>
                  Découvrir des profils
                </Link>
              </div>
            )}

            {/* Pile pleine mais rien de choisi : l'invitation à piocher. */}
            {!erreurListe && !choisie && conversations.length > 0 && (
              <div className={styles.accueil}>
                <strong>Choisissez une conversation</strong>
                <p>Les personnes avec qui vous avez échangé sont sur le côté.</p>
              </div>
            )}

            {choisie && loading && <p className={styles.vide}>Chargement…</p>}

            {choisie && !loading && error && <p className={styles.vide}>{error}</p>}

            {choisie && !loading && !error && messages.length === 0 && (
              <div className={styles.accueil}>
                <strong>{autre ? `Écrivez à ${autre.firstName}` : 'Nouvelle conversation'}</strong>
                <p>Une question sur son profil vaut mieux qu'un simple « salut ».</p>
              </div>
            )}

            {choisie && !error &&
              messages.map((m, i) => {
                const precedent = messages[i - 1]
                const mien = m.senderId === me?.id
                const separateur = !precedent || isNewDay(precedent.createdAt, m.createdAt)
                return (
                  <div key={m.id} style={{ display: 'contents' }}>
                    {separateur && (
                      <div className={styles.jour}>{formatDaySeparator(m.createdAt)}</div>
                    )}
                    <div className={`${styles.bulle} ${mien ? styles.mienne : styles.sienne}`}>
                      {m.content}
                      <span className={styles.heure}>{formatBubbleTime(m.createdAt)}</span>
                    </div>
                  </div>
                )
              })}
          </div>

          <div className={styles.pied}>
            {choisie && !error && (
              verrouille ? (
                <div className={styles.relance}>
                  <strong>Débloquez la messagerie 💬</strong>
                  <Link to="/abonnement" className="btn btn-primary" onClick={onFermer}>
                    S'abonner — dès 1 000 F CFA
                  </Link>
                </div>
              ) : (
                <MessageComposer
                  send={content => messagesApi.send(choisie, content)}
                  placeholder={autre ? `Écrire à ${autre.firstName}…` : 'Écrire votre message ici…'}
                  onSent={auEnvoi}
                />
              )
            )}

            <Link to="/messages" className={styles.toutVoir} onClick={onFermer}>
              Voir toutes mes conversations
            </Link>
          </div>
        </div>

        {/* La pile des vignettes. Sur le bord, comme un carnet d'adresses posé
            à côté du fil : on change d'interlocuteur d'un seul geste. */}
        <nav className={styles.pile} aria-label="Profils avec qui vous avez échangé">
          {conversations.map(c => (
            <button
              key={c.id}
              type="button"
              className={`${styles.pileItem} ${c.id === choisie ? styles.pileActif : ''}`}
              onClick={() => ouvrir(c.id)}
              title={c.otherUser.firstName}
              aria-label={`Conversation avec ${c.otherUser.firstName}`}
            >
              <Vignette conversation={c} taille={40} />
            </button>
          ))}
        </nav>
      </aside>
    </div>
  )
}

/**
 * Vignette d'un interlocuteur.
 *
 * Le repli en initiale n'est pas un cas rare : un membre peut n'avoir aucune
 * photo, ou les avoir passées en privé. La pile doit rester lisible dans ce
 * cas, pas afficher des cadres vides.
 */
function Vignette({ conversation, taille }: { conversation: Conversation; taille: number }) {
  const { otherUser: autre, unreadCount } = conversation
  const photo = autre.photos?.[0]?.url

  return (
    <span className={styles.vignette} style={{ width: taille, height: taille }}>
      {photo ? (
        <img src={photo} alt={autre.firstName} loading="lazy" />
      ) : (
        <span className={styles.initiale}>{autre.firstName.slice(0, 1).toUpperCase()}</span>
      )}
      {unreadCount > 0 && (
        <span className={styles.pastille}>{unreadCount > 9 ? '9+' : unreadCount}</span>
      )}
    </span>
  )
}
