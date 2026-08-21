import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { fetchMe, isAuthenticated, type MeResponse } from '../api/auth'
import {
  discoveryApi, sharedLabels, ApiError,
  COUNTRY_LABELS, INTENT_LABELS, RELIGION_LABELS,
  type Profile,
} from '../api/discovery'
import styles from './Profil.module.css'

/**
 * Fiche d'un membre : photos, présentation et actions.
 *
 * Les actions se limitent à ce que l'API sait faire depuis cet écran — aimer et
 * passer. La messagerie n'existe qu'une fois le match établi (`/matches/:id/
 * messages`) : on annonce le match plutôt que d'exposer un bouton qui échouerait.
 */
export default function Profil() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [photoIdx, setPhotoIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [liked, setLiked] = useState(false)
  const [matched, setMatched] = useState(false)
  const [notice, setNotice] = useState('')
  const [acting, setActing] = useState(false)

  const signedIn = isAuthenticated()

  useEffect(() => {
    if (!signedIn) return
    fetchMe().then(setMe).catch(() => { /* l'en-tête sait faire sans */ })
  }, [signedIn])

  useEffect(() => {
    let alive = true
    setLoading(true); setError(''); setPhotoIdx(0)
    discoveryApi.profile(id)
      .then(p => { if (alive) { setProfile(p); setLoading(false) } })
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

  async function like() {
    if (!profile || acting) return
    setActing(true); setNotice('')
    try {
      const res = await discoveryApi.like(profile.id)
      setLiked(true)
      if (res.isMatch) { setMatched(true); setNotice('') }
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

            {matched && (
              <div className={styles.notice}>
                <span>🎉</span>
                <div>
                  <strong>C'est un match !</strong> {profile.firstName} vous a aimé aussi.
                  {' '}<Link to="/accueil">Ouvrir la conversation</Link>
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
            ) : (
            <div className={styles.actions}>
              <button
                className={`${styles.iconBtn} ${liked ? styles.liked : ''}`}
                onClick={like} disabled={acting || liked}
                aria-label="J'aime ce profil"
                title={liked ? 'Profil déjà aimé' : "J'aime"}
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
          </div>

          <div className={styles.gallery}>
            <div className={styles.hero}>
              {photos.length > 0
                ? <img src={photos[photoIdx].url} alt={`${profile.firstName} — photo ${photoIdx + 1}`} />
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
          </div>
        </div>
      </div>
    </div>
  )
}
