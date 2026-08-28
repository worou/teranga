import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { fetchMe, isAuthenticated, type MeResponse } from '../api/auth'
import {
  discoveryApi, sharedLabels, ApiError,
  COUNTRY_LABELS, INTENT_LABELS, RELIGION_LABELS, GENDER_LABELS,
  BODY_TYPE_LABELS, ETHNICITY_LABELS, LANGUAGE_LABELS, LAST_ACTIVE_LABELS,
  type DiscoveryFilters, type Profile,
} from '../api/discovery'
import styles from './Decouverte.module.css'

/** Filtres vides. `lastActive: 'all'` et `includeUnspecified: true` sont les
 *  défauts de l'API : les poser ici évite de les compter comme « actifs ». */
const EMPTY: DiscoveryFilters = { lastActive: 'all', includeUnspecified: true }

/** Nombre de critères réellement restrictifs (les défauts ne comptent pas). */
function countActive(f: DiscoveryFilters): number {
  let n = 0
  for (const [key, value] of Object.entries(f)) {
    if (value === undefined || value === '' || value === null) continue
    if (key === 'lastActive' && value === 'all') continue
    if (key === 'includeUnspecified' && value === true) continue
    if (value === false) continue
    n++
  }
  return n
}

/**
 * Découverte : recherche et grille de profils recommandés par l'API.
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
  const [search, setSearch] = useState('')
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
      // Un 401 ne peut venir que d'un jeton périmé : la page est publique.
      // On n'éjecte pas le visiteur, l'API répondra en anonyme au rechargement.
      if (err instanceof ApiError && err.status === 401) {
        setProfiles([])
        setError('Votre session a expiré. Reconnectez-vous pour interagir.')
        return
      }
      setError(err instanceof Error ? err.message : 'Chargement impossible.')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  const signedIn = isAuthenticated()

  useEffect(() => {
    if (!signedIn) return
    fetchMe().then(setMe).catch(() => { /* l'en-tête sait faire sans */ })
  }, [signedIn])

  useEffect(() => { load(filters) }, [filters, load])

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    setFilters(f => ({ ...f, q: search.trim() || undefined }))
  }

  function openDrawer() { setDraft(filters); setDrawerOpen(true) }
  function applyFilters() { setFilters(draft); setDrawerOpen(false) }
  function clearFilters() {
    setFilters(EMPTY); setDraft(EMPTY); setSearch(''); setDrawerOpen(false)
  }

  /** Raccourci de mise à jour d'un champ du brouillon. */
  const set = <K extends keyof DiscoveryFilters>(key: K, value: DiscoveryFilters[K]) =>
    setDraft(d => ({ ...d, [key]: value }))

  /** Champ numérique : chaîne vide ⇒ critère retiré. */
  const num = (v: string) => (v === '' ? undefined : Number(v))

  return (
    <div className={styles.page}>
      <AppHeader initial={me?.firstName} />

      <div className={styles.wrap}>
        <div className={styles.head}>
          <div>
            <h1 className={styles.greeting}>
              {signedIn && me
                ? <>Bonjour <em>{me.firstName}</em></>
                : <>Rencontrez des <em>personnes sérieuses</em></>}
            </h1>
            <p className={styles.subtitle}>
              {loading
                ? 'Recherche des profils les plus compatibles…'
                : `${profiles.length} profil${profiles.length > 1 ? 's' : ''} trouvé${profiles.length > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        {!signedIn && (
          <div className={styles.guestBanner}>
            <div>
              <strong>Vous parcourez Téranga en visiteur.</strong> Créez un compte
              pour aimer un profil et échanger avec vos correspondances.
            </div>
            <Link to="/inscription" className="btn btn-primary">Créer mon compte</Link>
          </div>
        )}

        {/* Formulaire de recherche : le pseudo est le critère le plus courant,
            il reste accessible sans ouvrir le tiroir. */}
        <form className={styles.searchBar} onSubmit={submitSearch}>
          <div className={styles.searchField}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              type="search" placeholder="Pseudo, profession, ville…"
              value={search} onChange={e => setSearch(e.target.value)}
              aria-label="Rechercher un profil"
            />
          </div>
          <button type="submit" className={styles.searchBtn}>Rechercher</button>
          <button
            type="button"
            className={`${styles.filterBtn} ${activeCount > 0 ? styles.on : ''}`}
            onClick={openDrawer}
          >
            {activeCount > 0 ? `${activeCount} filtre${activeCount > 1 ? 's' : ''}` : 'Filtres'}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
          </button>
          {activeCount > 0 && (
            <button type="button" className={styles.clearBtn} onClick={clearFilters}>
              Tout effacer
            </button>
          )}
        </form>

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
                ? 'Vos critères sont peut-être trop restrictifs. Élargissez-les, ou activez « Afficher les profils non renseignés » pour inclure les membres qui n’ont pas rempli ces informations.'
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
          <aside className={styles.drawer} role="dialog" aria-label="Filtres de recherche">
            <div className={styles.drawerHead}>
              <h2>Filtres</h2>
              <button className={styles.close} onClick={() => setDrawerOpen(false)} aria-label="Fermer">×</button>
            </div>

            <div className={styles.drawerBody}>
              <Group label="Pseudo">
                <input
                  type="text" placeholder="Prénom, profession, ville…"
                  value={draft.q ?? ''}
                  onChange={e => set('q', e.target.value || undefined)}
                />
              </Group>

              <Group label="Genre">
                <select value={draft.gender ?? ''} onChange={e => set('gender', e.target.value || undefined)}>
                  <option value="">Peu importe</option>
                  {Object.entries(GENDER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Group>

              <Group label="Âge">
                <Range
                  min={draft.minAge} max={draft.maxAge}
                  minPlaceholder="18" maxPlaceholder="99" unit="ans"
                  onMin={v => set('minAge', num(v))} onMax={v => set('maxAge', num(v))}
                />
              </Group>

              <Group label="Pays">
                <select value={draft.country ?? ''} onChange={e => set('country', e.target.value || undefined)}>
                  <option value="">Tous les pays</option>
                  {Object.entries(COUNTRY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Group>

              <Group label="Ville">
                <input
                  type="text" placeholder="Dakar, Abidjan…"
                  value={draft.city ?? ''}
                  onChange={e => set('city', e.target.value || undefined)}
                />
              </Group>

              <Group label="Langue parlée">
                <select value={draft.language ?? ''} onChange={e => set('language', e.target.value || undefined)}>
                  <option value="">Peu importe</option>
                  {Object.entries(LANGUAGE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Group>

              <Group label="Taille">
                <Range
                  min={draft.minHeightCm} max={draft.maxHeightCm}
                  minPlaceholder="150" maxPlaceholder="200" unit="cm"
                  onMin={v => set('minHeightCm', num(v))} onMax={v => set('maxHeightCm', num(v))}
                />
              </Group>

              <Group label="Poids">
                <Range
                  min={draft.minWeightKg} max={draft.maxWeightKg}
                  minPlaceholder="45" maxPlaceholder="100" unit="kg"
                  onMin={v => set('minWeightKg', num(v))} onMax={v => set('maxWeightKg', num(v))}
                />
              </Group>

              <Group label="Silhouette">
                <select value={draft.bodyType ?? ''} onChange={e => set('bodyType', e.target.value || undefined)}>
                  <option value="">Peu importe</option>
                  {Object.entries(BODY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Group>

              <Group label="Religion">
                <select value={draft.religion ?? ''} onChange={e => set('religion', e.target.value || undefined)}>
                  <option value="">Peu importe</option>
                  {Object.entries(RELIGION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Group>

              <Group label="Origine ethnique" hint="Information déclarative et facultative.">
                <select value={draft.ethnicity ?? ''} onChange={e => set('ethnicity', e.target.value || undefined)}>
                  <option value="">Peu importe</option>
                  {Object.entries(ETHNICITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Group>

              <Group label="Intention">
                <select value={draft.intent ?? ''} onChange={e => set('intent', e.target.value || undefined)}>
                  <option value="">Peu importe</option>
                  {Object.entries(INTENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Group>

              <Group label="A des enfants ?">
                <Tri
                  value={draft.hasChildren}
                  onChange={v => set('hasChildren', v)}
                  yes="Oui" no="Non"
                />
              </Group>

              <Group label="Veut des enfants ?">
                <Tri
                  value={draft.wantsChildren}
                  onChange={v => set('wantsChildren', v)}
                  yes="Oui" no="Non"
                />
              </Group>

              <Group label="Statut de connexion" hint="Estimé d’après la dernière activité.">
                <select
                  value={draft.lastActive ?? 'all'}
                  onChange={e => set('lastActive', e.target.value as DiscoveryFilters['lastActive'])}
                >
                  {Object.entries(LAST_ACTIVE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Group>

              <div className={styles.group}>
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={draft.hasPhoto ?? false}
                    onChange={e => set('hasPhoto', e.target.checked || undefined)}
                  />
                  A une photo
                </label>
              </div>

              <div className={styles.group}>
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={draft.includeUnspecified !== false}
                    onChange={e => set('includeUnspecified', e.target.checked)}
                  />
                  Afficher les profils non renseignés
                </label>
                <p className={styles.hint}>
                  Décochez pour n’afficher que les membres ayant rempli les critères
                  ci-dessus. Beaucoup de profils sont encore incomplets.
                </p>
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

// ——— Éléments de formulaire ———

function Group({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div className={styles.group}>
      <label>{label}</label>
      {children}
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  )
}

/** Bornes min / max d'un intervalle numérique. */
function Range({ min, max, minPlaceholder, maxPlaceholder, unit, onMin, onMax }: {
  min?: number; max?: number
  minPlaceholder: string; maxPlaceholder: string; unit: string
  onMin: (v: string) => void; onMax: (v: string) => void
}) {
  return (
    <div className={styles.rangeRow}>
      <input
        type="number" placeholder={minPlaceholder} value={min ?? ''}
        onChange={e => onMin(e.target.value)} aria-label={`Minimum en ${unit}`}
      />
      <span className={styles.rangeSep}>à</span>
      <input
        type="number" placeholder={maxPlaceholder} value={max ?? ''}
        onChange={e => onMax(e.target.value)} aria-label={`Maximum en ${unit}`}
      />
      <span className={styles.rangeUnit}>{unit}</span>
    </div>
  )
}

/**
 * Choix à trois états : indifférent / oui / non. Une case à cocher ne saurait
 * pas exprimer « non », qu'un simple décochage confondrait avec « peu importe ».
 */
function Tri({ value, onChange, yes, no }: {
  value?: boolean; onChange: (v: boolean | undefined) => void
  yes: string; no: string
}) {
  const options: [string, boolean | undefined][] = [
    ['Peu importe', undefined], [yes, true], [no, false],
  ]
  return (
    <div className={styles.triGroup}>
      {options.map(([label, v]) => (
        <button
          key={label} type="button"
          className={`${styles.triBtn} ${value === v ? styles.triOn : ''}`}
          onClick={() => onChange(v)}
        >
          {label}
        </button>
      ))}
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

        {/* Marque du geste : le fil ne masque plus les profils aimés, il faut
            donc qu'on les reconnaisse. Sans elle, le ♥ n'aurait plus aucun
            effet perceptible. */}
        {profile.liked && (
          <span className={styles.dejaAime} title="Vous avez aimé ce profil">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.8 5.6a5 5 0 00-7.1 0L12 7.3l-1.7-1.7a5 5 0 10-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 000-7.1z" />
            </svg>
            Aimé
          </span>
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
