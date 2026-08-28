import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import MessageComposer from '../components/MessageComposer'
import { ModerationActions } from '../components/ModerationActions'
import { Lightbox } from '../components/Lightbox'
import { SUBSCRIPTIONS_ENABLED } from '../config'
import { fetchMe, isAuthenticated, type MeResponse } from '../api/auth'
import {
  discoveryApi, sharedLabels, ApiError,
  COUNTRY_LABELS, INTENT_LABELS, RELIGION_LABELS,
  type Profile,
} from '../api/discovery'
import {
  messagesApi, isMessagingLocked, formatListTime,
  type ConversationRef, type Message,
} from '../api/messages'
import styles from './Profil.module.css'

/**
 * Fiche d'un membre : photos, présentation, actions et boîte de discussion.
 *
 * Depuis la suppression du système de match, la boîte n'a plus qu'un état : un
 * champ de saisie, toujours. Écrire ne suppose aucun accord préalable — la
 * conversation naît du premier message. Le like reste offert comme signal
 * d'intérêt, il ne débloque plus rien.
 */
export default function Profil() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [photoIdx, setPhotoIdx] = useState(0)
  const [agrandi, setAgrandi] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Initialisé par la réponse du serveur : sans cela, un profil déjà aimé
  // revenait avec un cœur vide à chaque visite, et le geste semblait perdu.
  const [liked, setLiked] = useState(false)
  const [reciprocal, setReciprocal] = useState(false)
  const [notice, setNotice] = useState('')
  const [acting, setActing] = useState(false)

  /** Conversation déjà entamée avec ce membre, s'il y en a une. */
  const [conversation, setConversation] = useState<ConversationRef | null>(null)
  /** Identifiant obtenu à la volée quand le premier message ouvre la conversation. */
  const [openedId, setOpenedId] = useState<string | null>(null)
  /** Messages envoyés depuis cette boîte, affichés en confirmation. */
  const [justSent, setJustSent] = useState<Message[]>([])

  const signedIn = isAuthenticated()

  useEffect(() => {
    if (!signedIn) return
    fetchMe().then(setMe).catch(() => { /* l'en-tête sait faire sans */ })
  }, [signedIn])

  // Historique éventuel avec ce membre. `findWith` ne crée rien : consulter une
  // fiche ne doit pas faire surgir une conversation vide chez l'autre.
  //
  // Volontairement pas `messagesApi.thread` : cette route marque les messages
  // reçus comme lus, si bien qu'ouvrir une fiche viderait la pastille de
  // non-lus sans que personne n'ait rien lu.
  useEffect(() => {
    if (!signedIn || !id) return
    let alive = true
    setConversation(null)
    setOpenedId(null)
    setJustSent([])
    messagesApi
      .findWith(id)
      .then(c => { if (alive) setConversation(c) })
      .catch(() => { /* page publique : profil incomplet ou session expirée, la fiche reste lisible */ })
    return () => { alive = false }
  }, [signedIn, id])

  useEffect(() => {
    let alive = true
    setLoading(true); setError(''); setPhotoIdx(0)
    discoveryApi.profile(id)
      .then(p => { if (alive) { setProfile(p); setLiked(!!p.liked); setLoading(false) } })
      .catch(err => {
        if (!alive) return
        if (err instanceof ApiError && err.code === 'PHOTOS_REQUIRED') {
          navigate('/inscription', { replace: true }); return
        }
        // Page publique : un 401 vient d'un jeton périmé, pas d'un droit
        // manquant. On affiche l'erreur sans éjecter le visiteur.

        setError(err instanceof Error ? err.message : 'Profil introuvable.')
        setLoading(false)
      })
    return () => { alive = false }
  }, [id, navigate])

  /**
   * Bascule, et non ajout définitif. Le bouton était désactivé une fois aimé :
   * on pouvait mettre en favori, jamais retirer — et la liste des favoris ne
   * pouvait que grossir.
   */
  async function like() {
    if (!profile || acting) return
    setActing(true); setNotice('')

    if (liked) {
      try {
        await discoveryApi.unlike(profile.id)
        setLiked(false); setReciprocal(false)
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'Le retrait a échoué.')
      } finally { setActing(false) }
      return
    }

    try {
      const res = await discoveryApi.like(profile.id)
      setLiked(true)
      // La réciprocité n'ouvre plus rien — la messagerie est déjà ouverte.
      // Elle reste une information agréable à afficher.
      setReciprocal(!!res.reciprocal)
    } catch (err) {
      // Limite quotidienne du palier gratuit : le message de l'API porte déjà
      // le quota, on y ajoute le chemin vers l'abonnement.
      setNotice(err instanceof Error ? err.message : "Action impossible pour le moment.")
    } finally {
      setActing(false)
    }
  }

  async function pass() {
    if (!profile || acting) return
    setActing(true)
    try { await discoveryApi.pass(profile.id) } catch { /* sans conséquence */ }
    finally { setActing(false); navigate('/decouverte') }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <AppHeader initial={me?.firstName} />
        <div className={styles.wrap}><div className={styles.state}><p>Chargement du profil…</p></div></div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className={styles.page}>
        <AppHeader initial={me?.firstName} />
        <div className={styles.wrap}>
          <div className={styles.state}>
            <h2>Profil indisponible</h2>
            <p>{error}</p>
            <Link to="/decouverte" className="btn btn-primary">Retour à la découverte</Link>
          </div>
        </div>
      </div>
    )
  }

  const photos = profile.photos ?? []
  const shared = sharedLabels(profile.sharedTraits)
  const place = [profile.city, profile.country && COUNTRY_LABELS[profile.country]]
    .filter(Boolean).join(' · ')
  // `/profil/:id` est une route publique sans garde : rien n'empêche d'y
  // ouvrir sa propre fiche. Ni s'aimer soi-même ni s'écrire n'a de sens.
  const isSelf = !!me && me.id === profile.id
  const locked = isMessagingLocked(me, SUBSCRIPTIONS_ENABLED)

  return (
    <div className={styles.page}>
      <AppHeader initial={me?.firstName} />

      <div className={styles.wrap}>
        <Link to="/decouverte" className={styles.back}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Retour à la liste de profils
        </Link>

        <div className={styles.layout}>
          <div className={styles.identity}>
            <div className={styles.nameRow}>
              <h1 className={styles.name}>{profile.firstName}</h1>
              {profile.isVerified && (
                <span className={styles.verified}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Profil vérifié
                </span>
              )}
            </div>
            <p className={styles.meta}>
              <strong>{profile.age} ans</strong>{place ? ` · ${place}` : ''}
              {profile.profession ? ` · ${profile.profession}` : ''}
            </p>

            {reciprocal && (
              <div className={styles.notice}>
                <span>💛</span>
                <div>
                  <strong>C'est réciproque !</strong> {profile.firstName} vous a aimé aussi.
                </div>
              </div>
            )}

            {notice && (
              <div className={styles.notice}>
                <span>⚠</span>
                {/* Le quota de likes n'existe plus en version 1 : plus de
                    renvoi vers un tunnel d'abonnement masqué. */}
                <div>{notice}</div>
              </div>
            )}

            {!signedIn ? (
              <div className={styles.notice}>
                <span>♥</span>
                <div>
                  <strong>Créez un compte pour aller plus loin.</strong> La consultation
                  des profils est libre ; aimer {profile.firstName} et lui écrire
                  demande d'être membre.
                  {' '}<Link to="/inscription">Créer mon compte</Link>
                  {' '}· <Link to="/connexion">Se connecter</Link>
                </div>
              </div>
            ) : isSelf ? (
              <div className={styles.notice}>
                <span>👤</span>
                <div>
                  <strong>C'est votre profil,</strong> tel que les autres membres le voient.
                  {' '}<Link to="/mon-profil">Le modifier</Link>
                </div>
              </div>
            ) : (
            <div className={styles.actions}>
              <button
                className={`${styles.iconBtn} ${liked ? styles.liked : ''}`}
                onClick={like} disabled={acting}
                aria-label={liked ? 'Retirer de mes favoris' : 'Ajouter à mes favoris'}
                title={liked ? 'Retirer de mes favoris' : 'Ajouter à mes favoris'}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
                  <path d="M20.8 5.6a5 5 0 00-7.1 0L12 7.3l-1.7-1.7a5 5 0 10-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 000-7.1z" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                className={styles.iconBtn} onClick={pass} disabled={acting}
                aria-label="Passer ce profil" title="Passer"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            )}

            {shared.length > 0 && (
              <div className={styles.tags}>
                {shared.map(t => <span key={t} className={styles.tag}>{t}</span>)}
              </div>
            )}

            {profile.bio
              ? <p className={styles.bio}>{profile.bio}</p>
              : <p className={`${styles.bio} ${styles.bioEmpty}`}>Aucune description renseignée pour le moment.</p>}

            <div className={styles.facts}>
              {profile.intent && (
                <div className={styles.fact}>
                  <span>Recherche</span><strong>{INTENT_LABELS[profile.intent] ?? profile.intent}</strong>
                </div>
              )}
              {profile.religion && profile.religion !== 'UNDISCLOSED' && (
                <div className={styles.fact}>
                  <span>Religion</span><strong>{RELIGION_LABELS[profile.religion] ?? profile.religion}</strong>
                </div>
              )}
              {profile.city && (
                <div className={styles.fact}><span>Ville</span><strong>{profile.city}</strong></div>
              )}
              {profile.country && (
                <div className={styles.fact}>
                  <span>Pays</span><strong>{COUNTRY_LABELS[profile.country] ?? profile.country}</strong>
                </div>
              )}
              {profile.profession && (
                <div className={styles.fact}><span>Profession</span><strong>{profile.profession}</strong></div>
              )}
            </div>

            {/* Recours, sous la fiche : c'est là qu'on se rend compte qu'on
                veut y mettre fin. Discrets par construction — les mettre en
                avant ferait planer un soupçon sur chaque profil. */}
            {signedIn && !isSelf && (
              <ModerationActions
                userId={profile.id}
                firstName={profile.firstName}
                // Le membre vient de disparaître de la découverte : rester sur
                // sa fiche afficherait un profil devenu inatteignable.
                onBlocked={() => setTimeout(() => navigate('/decouverte'), 1800)}
              />
            )}

            {signedIn && !isSelf && (
              <ChatBox
                recipientId={profile.id}
                firstName={profile.firstName}
                conversationId={openedId ?? conversation?.id ?? null}
                lastMessage={conversation?.lastMessage ?? null}
                justSent={justSent}
                locked={locked}
                onSent={m => {
                  setJustSent(prev => [...prev, m])
                  // Premier message : le serveur vient d'ouvrir la conversation,
                  // sa réponse en porte l'identifiant.
                  setOpenedId(m.conversationId)
                }}
              />
            )}
          </div>

          <div className={styles.gallery}>
            <div className={styles.hero}>
              {/* Cliquable, parce que le cadrage coupe : la carte affiche en
                  4/5, la fiche en portrait fixe, et l'on ne voit jamais la
                  photo entière sans l'ouvrir. Un bouton et non une image nue —
                  au clavier, une image ne se déclenche pas. */}
              {photos.length > 0
                ? (
                  <button
                    type="button"
                    className={styles.heroBtn}
                    onClick={() => setAgrandi(true)}
                    aria-label="Agrandir la photo"
                    title="Agrandir"
                  >
                    <img src={photos[photoIdx].url} alt={`${profile.firstName} — photo ${photoIdx + 1}`} />
                    <span className={styles.loupe} aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
                        <path d="M11 8v6M8 11h6" />
                      </svg>
                    </span>
                  </button>
                )
                : <div className={styles.heroEmpty}>{profile.firstName.slice(0, 1)}</div>}
            </div>

            {photos.length > 1 && (
              <div className={styles.thumbs}>
                {photos.map((p, i) => (
                  <button
                    key={p.id}
                    className={`${styles.thumb} ${i === photoIdx ? styles.on : ''}`}
                    onClick={() => setPhotoIdx(i)}
                    aria-label={`Voir la photo ${i + 1}`}
                  >
                    <img src={p.url} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            )}

            {agrandi && (
              <Lightbox
                photos={photos}
                index={photoIdx}
                onIndex={setPhotoIdx}
                onClose={() => setAgrandi(false)}
                legende={`${profile.firstName} — photo ${photoIdx + 1} sur ${photos.length}`}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


/**
 * Boîte de discussion posée sous la fiche.
 *
 * Un seul état : le champ de saisie. Écrire à quelqu'un ne suppose plus
 * d'accord préalable, il n'y a donc plus rien à débloquer ni à expliquer —
 * sauf le cas de l'abonnement, seule restriction restante côté produit.
 *
 * La conversation est ouverte par le serveur au premier message accepté. Tant
 * qu'aucun n'est parti, rien n'est créé : consulter une fiche ne laisse aucune
 * trace chez la personne consultée.
 */
function ChatBox({
  recipientId, firstName, conversationId, lastMessage, justSent, locked, onSent,
}: {
  recipientId: string
  firstName: string
  /** Conversation existante ou tout juste ouverte — sinon `null`. */
  conversationId: string | null
  lastMessage: Message | null
  justSent: Message[]
  locked: boolean
  onSent: (message: Message) => void
}) {
  if (locked) {
    return (
      <div className={styles.chatBox}>
        <h2 className={styles.chatTitle}>Écrire à {firstName}</h2>
        <p className={styles.chatMuted}>
          L'accès à la messagerie est réservé aux membres abonnés. Les femmes
          échangent gratuitement et sans limite.
        </p>
        <Link to="/abonnement" className="btn btn-primary">S'abonner — dès 1 000 F CFA</Link>
      </div>
    )
  }

  const started = !!conversationId

  return (
    <div className={styles.chatBox}>
      <div className={styles.chatHead}>
        <h2 className={styles.chatTitle}>
          {started ? `Votre conversation avec ${firstName}` : `Écrire à ${firstName}`}
        </h2>
        {started && (
          <Link to={`/messages/${conversationId}`} className={styles.chatOpen}>Tout afficher</Link>
        )}
      </div>

      {/* Le dernier message vient de `findWith`, jamais du fil : lire le fil
          marquerait les messages reçus comme lus. */}
      {lastMessage && justSent.length === 0 && (
        <p className={styles.chatLast}>
          <span>{formatListTime(lastMessage.createdAt)}</span> {lastMessage.content}
        </p>
      )}

      {justSent.map(m => (
        <p key={m.id} className={styles.chatSent}>
          <span>Envoyé</span> {m.content}
        </p>
      ))}

      {!started && justSent.length === 0 && (
        <p className={styles.chatMuted}>
          Une question sur son profil ouvre mieux la conversation qu'un simple « salut ».
        </p>
      )}

      {/* `sendTo` plutôt que `send` : la conversation peut ne pas exister
          encore, c'est au serveur de l'ouvrir. */}
      <MessageComposer
        send={content => messagesApi.sendTo(recipientId, content)}
        placeholder={`Écrire à ${firstName}…`}
        onSent={onSent}
      />
    </div>
  )
}
