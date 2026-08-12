import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { fetchMe, type MeResponse } from '../api/auth'
import {
  discoveryApi, sharedLabels, ApiError,
  COUNTRY_LABELS, INTENT_LABELS, RELIGION_LABELS,
  type DiscoveryFilters, type Profile,
} from '../api/discovery'
import styles from './Decouverte.module.css'

/** Filtres vides — sert aussi de référence pour compter ceux qui sont actifs. */
const EMPTY: DiscoveryFilters = {}

function countActive(f: DiscoveryFilters): number {
  return Object.values(f).filter(v => v !== undefined && v !== '' && v !== false).length
}

/**
 * Découverte : grille de profils recommandés par l'API (score de compatibilité),
 * avec un tiroir de filtres.
 *
 * Les filtres proposés sont exactement ceux que `discoveryFiltersSchema` sait
 * traiter. Ce que l'API ne sait pas filtrer n'est pas affiché : un contrôle
 * décoratif qui ne change rien au résultat est pire que son absence.
 */
export default function Decouverte() {
  const navigate = useNavigate()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<DiscoveryFilters>(EMPTY)
  const [draft, setDraft] = useState<DiscoveryFilters>(EMPTY)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const activeCount = countActive(filters)

  const load = useCallback(async (f: DiscoveryFilters) => {
    setLoading(true); setError('')
    try {
      setProfiles(await discoveryApi.feed(f))
    } catch (err) {
      // Inscription non finalisée : on renvoie à l'étape photos plutôt que
      // d'afficher un échec que l'utilisateur ne saurait pas corriger.
      if (err instanceof ApiError && err.code === 'PHOTOS_REQUIRED') {
        navigate('/inscription', { replace: true })
        return
      }
      if (err instanceof ApiError && err.status === 401) {
        navigate('/connexion', { replace: true })
        return
      }
      setError(err instanceof Error ? err.message : 'Chargement impossible.')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    fetchMe().then(setMe).catch(() => { /* l'en-tête sait faire sans */ })
  }, [])

  useEffect(() => { load(filters) }, [filters, load])

  function openDrawer() { setDraft(filters); setDrawerOpen(true) }
  function applyFilters() { setFilters(draft); setDrawerOpen(false) }
  function clearFilters() { setFilters(EMPTY); setDraft(EMPTY); setDrawerOpen(false) }

  return (
    <div className={styles.page}>
      <AppHeader initial={me?.firstName} />

      <div className={styles.wrap}>
        <div className={styles.head}>
          <div>
            <h1 className={styles.greeting}>
              Bonjour <em>{me?.firstName ?? ''}</em>
            </h1>
            <p className={styles.subtitle}>
              {loading
                ? 'Recherche des profils les plus compatibles…'
                : `${profiles.length} profil${profiles.length > 1 ? 's' : ''} recommandé${profiles.length > 1 ? 's' : ''} pour vous`}
            </p>
          </div>

          <div className={styles.headActions}>
            {activeCount > 0 && (
              <button className={styles.clearBtn} onClick={clearFilters}>Tout effacer</button>
            )}
            <button
              className={`${styles.filterBtn} ${activeCount > 0 ? styles.on : ''}`}
              onClick={openDrawer}
            >
              {activeCount > 0 ? `${activeCount} filtre${activeCount > 1 ? 's' : ''} actif${activeCount > 1 ? 's' : ''}` : 'Filtrer'}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 6h16M7 12h10M10 18h4" />
              </svg>
            </button>
          </div>
        </div>

        {error && (
          <div className={styles.state}>
            <h2>Oups</h2>
            <p>{error}</p>
            <button className="btn btn-primary" onClick={() => load(filters)}>Réessayer</button>
          </div>
        )}

        {!error && loading && (
          <div className={styles.grid}>
            {Array.from({ length: 8 }, (_, i) => <div key={i} className={styles.skeleton} />)}
          </div>
        )}

        {!error && !loading && profiles.length === 0 && (
          <div className={styles.state}>
            <h2>Aucun profil ne correspond</h2>
            <p>
              {activeCount > 0
                ? 'Vos filtres sont peut-être trop restrictifs. Élargissez-les pour voir plus de monde.'
                : 'Revenez bientôt : de nouveaux membres rejoignent Téranga chaque jour.'}
            </p>
            {activeCount > 0 && (
              <button className="btn btn-primary" onClick={clearFilters}>Effacer les filtres</button>
            )}
          </div>
        )}

        {!error && !loading && profiles.length > 0 && (
          <div className={styles.grid}>
            {profiles.map(p => <ProfileCard key={p.id} profile={p} />)}
          </div>
        )}
      </div>

      {drawerOpen && (
        <>
          <div className={styles.overlay} onClick={() => setDrawerOpen(false)} />
          <aside className={styles.drawer} role="dialog" aria-label="Filtres">
            <div className={styles.drawerHead}>
              <h2>Filtres</h2>
              <button className={styles.close} onClick={() => setDrawerOpen(false)} aria-label="Fermer">×</button>
            </div>

            <div className={styles.drawerBody}>
              <div className={styles.group}>
                <label htmlFor="f-q">Recherche</label>
                <input
                  id="f-q" type="text" placeholder="Prénom, profession, ville…"
                  value={draft.q ?? ''}
                  onChange={e => setDraft(d => ({ ...d, q: e.target.value || undefined }))}
                />
              </div>

              <div className={styles.group}>
                <label>Âge</label>
                <div className={styles.ageRow}>
                  <input
                    type="number" min={18} max={99} placeholder="18"
                    value={draft.minAge ?? ''}
                    onChange={e => setDraft(d => ({ ...d, minAge: e.target.value ? Number(e.target.value) : undefined }))}
                  />
                  <span className={styles.ageSep}>à</span>
                  <input
                    type="number" min={18} max={99} placeholder="99"
                    value={draft.maxAge ?? ''}
                    onChange={e => setDraft(d => ({ ...d, maxAge: e.target.value ? Number(e.target.value) : undefined }))}
                  />
                </div>
              </div>

              <div className={styles.group}>
                <label htmlFor="f-country">Pays</label>
                <select
                  id="f-country" value={draft.country ?? ''}
                  onChange={e => setDraft(d => ({ ...d, country: e.target.value || undefined }))}
                >
                  <option value="">Tous les pays</option>
                  {Object.entries(COUNTRY_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </div>

              <div className={styles.group}>
                <label htmlFor="f-city">Ville</label>
                <input
                  id="f-city" type="text" placeholder="Dakar, Abidjan…"
                  value={draft.city ?? ''}
                  onChange={e => setDraft(d => ({ ...d, city: e.target.value || undefined }))}
                />
              </div>

              <div className={styles.group}>
                <label htmlFor="f-intent">Intention</label>
                <select
                  id="f-intent" value={draft.intent ?? ''}
                  onChange={e => setDraft(d => ({ ...d, intent: e.target.value || undefined }))}
                >
                  <option value="">Peu importe</option>
                  {Object.entries(INTENT_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </div>

              <div className={styles.group}>
                <label htmlFor="f-religion">Religion</label>
                <select
                  id="f-religion" value={draft.religion ?? ''}
                  onChange={e => setDraft(d => ({ ...d, religion: e.target.value || undefined }))}
                >
                  <option value="">Peu importe</option>
                  {Object.entries(RELIGION_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </div>

              <div className={styles.group}>
                <label htmlFor="f-profession">Profession</label>
                <input
                  id="f-profession" type="text" placeholder="Enseignante, ingénieur…"
                  value={draft.profession ?? ''}
                  onChange={e => setDraft(d => ({ ...d, profession: e.target.value || undefined }))}
                />
              </div>

              <div className={styles.group}>
                <label className={styles.checkRow} htmlFor="f-children">
                  <input
                    id="f-children" type="checkbox"
                    checked={draft.hasChildren ?? false}
                    onChange={e => setDraft(d => ({ ...d, hasChildren: e.target.checked || undefined }))}
                  />
                  A déjà des enfants
                </label>
              </div>
            </div>

            <div className={styles.drawerFoot}>
              <button className="btn btn-ghost" onClick={clearFilters}>Tout effacer</button>
              <button className="btn btn-primary" onClick={applyFilters}>Appliquer</button>
            </div>
          </aside>
        </>
      )}
    </div>
  )
}

/** Carte de profil, avec carrousel si le membre a plusieurs photos. */
function ProfileCard({ profile }: { profile: Profile }) {
  const [idx, setIdx] = useState(0)
  const photos = profile.photos ?? []
  const shared = sharedLabels(profile.sharedTraits)

  function step(e: React.MouseEvent, delta: number) {
    e.preventDefault(); e.stopPropagation()
    setIdx(i => (i + delta + photos.length) % photos.length)
  }

  const place = [profile.city, profile.country && COUNTRY_LABELS[profile.country]]
    .filter(Boolean).join(' · ')

  return (
    <Link to={`/profil/${profile.id}`} className={styles.card}>
      <div className={styles.photoWrap}>
        {photos.length > 0 ? (
          <img className={styles.photo} src={photos[idx].url} alt={profile.firstName} loading="lazy" />
        ) : (
          <div className={styles.photoEmpty}>{profile.firstName.slice(0, 1)}</div>
        )}

        {profile.isVerified && (
          <span className={styles.verified}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Vérifié
          </span>
        )}

        {photos.length > 1 && (
          <>
            <button className={`${styles.arrow} ${styles.arrowLeft}`} onClick={e => step(e, -1)} aria-label="Photo précédente">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <button className={`${styles.arrow} ${styles.arrowRight}`} onClick={e => step(e, 1)} aria-label="Photo suivante">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
            </button>
            <div className={styles.dots}>
              {photos.map((_, i) => (
                <span key={i} className={`${styles.dot} ${i === idx ? styles.dotOn : ''}`} />
              ))}
            </div>
          </>
        )}

        <div className={styles.info}>
          <div className={styles.nameRow}>
            <span className={styles.name}>{profile.firstName}</span>
            <span className={styles.meta}>{profile.age} ans{place ? ` · ${place}` : ''}</span>
          </div>

          {shared.length > 0 && (
            <div className={styles.tags}>
              {shared.map(t => <span key={t} className={styles.tag}>{t}</span>)}
            </div>
          )}

          {profile.bio && <p className={styles.bio}>{profile.bio}</p>}
        </div>
      </div>
    </Link>
  )
}
