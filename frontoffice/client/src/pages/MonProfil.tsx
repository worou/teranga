import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import {
  fetchMe, updateMe, uploadPhotos, deletePhoto, setMainPhoto, getToken,
  type MeResponse, type ProfileUpdate,
} from '../api/auth'
import {
  COUNTRY_LABELS, INTENT_LABELS, RELIGION_LABELS,
  BODY_TYPE_LABELS, ETHNICITY_LABELS, LANGUAGE_LABELS,
} from '../api/discovery'
import styles from './MonProfil.module.css'

/**
 * Mon profil : édition des informations et gestion des photos.
 *
 * C'est le seul écran qui alimente les critères de recherche de la découverte
 * (taille, poids, silhouette, origine, langues, souhait d'enfants). Sans lui,
 * ces filtres n'auraient rien à filtrer.
 *
 * Le formulaire n'envoie que les champs réellement modifiés : `PATCH` sur un
 * profil partiel, jamais un remplacement complet, pour ne pas écraser un champ
 * qu'un autre appareil viendrait de renseigner.
 */

/** Champs du formulaire, en représentation texte (ce que rendent les inputs). */
interface FormState {
  firstName: string
  lastName: string
  city: string
  profession: string
  educationLevel: string
  bio: string
  religion: string
  intent: string
  heightCm: string
  weightKg: string
  bodyType: string
  ethnicity: string
  hasChildren: boolean
  wantsChildren: boolean | null
  languages: string[]
}

function toForm(me: MeResponse): FormState {
  return {
    firstName: me.firstName ?? '',
    lastName: me.lastName ?? '',
    city: me.city ?? '',
    profession: me.profession ?? '',
    educationLevel: me.educationLevel ?? '',
    bio: me.bio ?? '',
    religion: me.religion ?? '',
    intent: me.intent ?? '',
    heightCm: me.heightCm != null ? String(me.heightCm) : '',
    weightKg: me.weightKg != null ? String(me.weightKg) : '',
    bodyType: me.bodyType ?? '',
    ethnicity: me.ethnicity ?? '',
    hasChildren: me.hasChildren ?? false,
    wantsChildren: me.wantsChildren ?? null,
    languages: me.languages ?? [],
  }
}

/** Nombre entier ou `null` si le champ est vide (l'API efface sur `null`). */
function toNumber(v: string): number | null {
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n) : null
}

/** Texte ou chaîne vide — l'API n'accepte pas `null` sur les champs texte. */
const toText = (v: string) => v.trim()

export default function MonProfil() {
  const navigate = useNavigate()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [initial, setInitial] = useState<FormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!getToken()) { navigate('/connexion', { replace: true }); return }
    fetchMe()
      .then(data => { setMe(data); setForm(toForm(data)); setInitial(toForm(data)) })
      .catch(err => setError(err instanceof Error ? err.message : 'Chargement impossible.'))
      .finally(() => setLoading(false))
  }, [navigate])

  const photos = me?.photos ?? []
  const minPhotos = me?.minPhotos ?? 3
  const maxPhotos = me?.maxPhotos ?? 6
  const belowMinimum = photos.length < minPhotos

  const dirty = useMemo(
    () => !!form && !!initial && JSON.stringify(form) !== JSON.stringify(initial),
    [form, initial],
  )

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => (f ? { ...f, [key]: value } : f))

  function toggleLanguage(code: string) {
    setForm(f => {
      if (!f) return f
      const has = f.languages.includes(code)
      return { ...f, languages: has ? f.languages.filter(c => c !== code) : [...f.languages, code] }
    })
  }

  /** Ne transmet que ce qui a changé — PATCH partiel, pas un remplacement. */
  function buildPatch(): ProfileUpdate {
    if (!form || !initial) return {}
    const patch: ProfileUpdate = {}
    if (form.firstName !== initial.firstName) patch.firstName = toText(form.firstName)
    if (form.lastName !== initial.lastName) patch.lastName = toText(form.lastName)
    if (form.city !== initial.city) patch.city = toText(form.city)
    if (form.profession !== initial.profession) patch.profession = toText(form.profession)
    if (form.educationLevel !== initial.educationLevel) patch.educationLevel = toText(form.educationLevel)
    if (form.bio !== initial.bio) patch.bio = toText(form.bio)
    if (form.religion !== initial.religion && form.religion) patch.religion = form.religion
    if (form.intent !== initial.intent && form.intent) patch.intent = form.intent
    if (form.heightCm !== initial.heightCm) patch.heightCm = toNumber(form.heightCm)
    if (form.weightKg !== initial.weightKg) patch.weightKg = toNumber(form.weightKg)
    if (form.bodyType !== initial.bodyType) patch.bodyType = form.bodyType || null
    if (form.ethnicity !== initial.ethnicity) patch.ethnicity = form.ethnicity || null
    if (form.hasChildren !== initial.hasChildren) patch.hasChildren = form.hasChildren
    if (form.wantsChildren !== initial.wantsChildren) patch.wantsChildren = form.wantsChildren
    if (JSON.stringify(form.languages) !== JSON.stringify(initial.languages)) {
      patch.languages = form.languages.length ? form.languages : null
    }
    return patch
  }

  async function save() {
    if (!form || saving) return
    setSaving(true); setError(''); setSuccess('')
    try {
      const patch = buildPatch()
      if (Object.keys(patch).length === 0) { setSuccess('Aucune modification à enregistrer.'); return }
      const updated = await updateMe(patch)
      setMe(updated); setForm(toForm(updated)); setInitial(toForm(updated))
      setSuccess('Profil enregistré.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.')
    } finally {
      setSaving(false)
    }
  }

  function reset() {
    if (initial) setForm({ ...initial, languages: [...initial.languages] })
    setError(''); setSuccess('')
  }

  async function reloadMe() {
    const data = await fetchMe()
    setMe(data); setForm(toForm(data)); setInitial(toForm(data))
  }

  async function addPhotos(files: FileList | null) {
    if (!files || photoBusy) return
    const token = getToken()
    if (!token) return
    const room = Math.max(maxPhotos - photos.length, 0)
    const chosen = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, room)
    if (chosen.length === 0) return
    setPhotoBusy(true); setError(''); setSuccess('')
    try {
      await uploadPhotos(chosen, token)
      await reloadMe()
      setSuccess(`${chosen.length} photo${chosen.length > 1 ? 's' : ''} ajoutée${chosen.length > 1 ? 's' : ''}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible.")
    } finally {
      setPhotoBusy(false)
    }
  }

  async function removePhoto(id: string) {
    if (photoBusy) return
    // Supprimer sous le minimum suspend l'accès : l'API le recalcule à chaque
    // requête. On prévient plutôt que de laisser découvrir le blocage après coup.
    if (photos.length <= minPhotos) {
      const ok = window.confirm(
        `Votre profil n'aurait plus que ${photos.length - 1} photo${photos.length - 1 > 1 ? 's' : ''} sur les ${minPhotos} exigées.\n\n` +
        'La découverte et la messagerie seront suspendues jusqu\'à ce que vous en ajoutiez une autre. Continuer ?',
      )
      if (!ok) return
    }
    setPhotoBusy(true); setError(''); setSuccess('')
    try {
      await deletePhoto(id)
      await reloadMe()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible.')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function makeMain(id: string) {
    if (photoBusy) return
    setPhotoBusy(true); setError('')
    try {
      await setMainPhoto(id)
      await reloadMe()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mise à jour impossible.')
    } finally {
      setPhotoBusy(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <AppHeader initial={me?.firstName} />
        <div className={styles.wrap}><p className={styles.loading}>Chargement de votre profil…</p></div>
      </div>
    )
  }

  if (!me || !form) {
    return (
      <div className={styles.page}>
        <AppHeader />
        <div className={styles.wrap}>
          <div className={`${styles.alert} ${styles.alertError}`}><span>⚠</span> {error || 'Profil indisponible.'}</div>
          <Link to="/accueil" className="btn btn-primary">Retour à mon espace</Link>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <AppHeader initial={me.firstName} />

      <div className={styles.wrap}>
        <div className={styles.head}>
          <div className={styles.eyebrow}>Mon compte</div>
          <h1 className={styles.title}>Mon <em>profil</em></h1>
          <p className={styles.lead}>
            Ces informations alimentent les recherches des autres membres. Plus votre
            profil est complet, plus vous apparaissez dans leurs résultats — les
            critères que vous laissez vides ne vous excluent que si la personne
            décoche « Afficher les profils non renseignés ».
          </p>
        </div>

        {error && <div className={`${styles.alert} ${styles.alertError}`}><span>⚠</span> <div>{error}</div></div>}
        {success && <div className={`${styles.alert} ${styles.alertOk}`}><span>✓</span> <div>{success}</div></div>}

        {belowMinimum && (
          <div className={`${styles.alert} ${styles.alertWarn}`}>
            <span>📸</span>
            <div>
              Votre profil compte {photos.length} photo{photos.length > 1 ? 's' : ''} sur
              les {minPhotos} exigées. <strong>La découverte et la messagerie sont
              suspendues</strong> tant que le minimum n'est pas atteint.
            </div>
          </div>
        )}

        {/* ——— Photos ——— */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Photos</h2>
          <p className={styles.sectionLead}>
            {photos.length} sur {maxPhotos} · minimum {minPhotos} · la photo principale
            est celle qui apparaît sur votre carte.
          </p>

          <div className={styles.photoGrid}>
            {photos.map(p => (
              <div key={p.id} className={`${styles.photoCard} ${p.isMain ? styles.isMain : ''}`}>
                <img src={p.url} alt="" />
                {p.isMain && <span className={styles.photoBadge}>Principale</span>}
                <div className={styles.photoActions}>
                  {!p.isMain && (
                    <button className={styles.photoAction} disabled={photoBusy} onClick={() => makeMain(p.id)}>
                      Principale
                    </button>
                  )}
                  <button className={styles.photoAction} disabled={photoBusy} onClick={() => removePhoto(p.id)}>
                    Retirer
                  </button>
                </div>
              </div>
            ))}

            {photos.length < maxPhotos && (
              <button
                type="button" className={styles.photoAdd} disabled={photoBusy}
                onClick={() => fileInput.current?.click()}
              >
                <span className={styles.photoAddPlus}>+</span>
                <span className={styles.photoAddText}>{photoBusy ? 'Envoi…' : 'Ajouter'}</span>
              </button>
            )}
          </div>
          <input
            ref={fileInput} type="file" accept="image/*" multiple hidden
            onChange={e => { addPhotos(e.target.files); e.target.value = '' }}
          />
        </section>

        {/* ——— Identité ——— */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Identité</h2>
          <p className={styles.sectionLead}>Votre numéro et votre pays ne sont pas modifiables ici.</p>

          <div className={styles.grid}>
            <Field label="Prénom">
              <input type="text" value={form.firstName} onChange={e => set('firstName', e.target.value)} />
            </Field>
            <Field label="Nom">
              <input type="text" value={form.lastName} onChange={e => set('lastName', e.target.value)} />
            </Field>
            <Field label="Ville">
              <input type="text" value={form.city} onChange={e => set('city', e.target.value)} />
            </Field>
            <Field label="Pays">
              <div className={styles.readonly}>
                {(me.country && COUNTRY_LABELS[me.country]) || me.country || '—'}
              </div>
            </Field>
            <Field label="Téléphone">
              <div className={styles.readonly}>{me.phone}</div>
            </Field>
            <Field label="Profession">
              <input type="text" value={form.profession} onChange={e => set('profession', e.target.value)} />
            </Field>
            <Field label="Niveau d'études" className={styles.full}>
              <input
                type="text" placeholder="Licence, master, autodidacte…"
                value={form.educationLevel} onChange={e => set('educationLevel', e.target.value)}
              />
            </Field>
            <Field label="Présentation" className={styles.full}>
              <textarea
                maxLength={500} value={form.bio}
                placeholder="Quelques lignes sur vous, ce que vous cherchez, ce qui compte pour vous."
                onChange={e => set('bio', e.target.value)}
              />
              <div className={styles.counter}>{form.bio.length} / 500</div>
            </Field>
          </div>
        </section>

        {/* ——— Recherche et valeurs ——— */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Ma démarche</h2>
          <p className={styles.sectionLead}>Ce que vous cherchez, et ce qui vous définit.</p>

          <div className={styles.grid}>
            <Field label="Je recherche">
              <select value={form.intent} onChange={e => set('intent', e.target.value)}>
                <option value="">Non précisé</option>
                {Object.entries(INTENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Religion">
              <select value={form.religion} onChange={e => set('religion', e.target.value)}>
                <option value="">Non précisée</option>
                {Object.entries(RELIGION_LABELS).filter(([v]) => v !== 'UNDISCLOSED')
                  .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                <option value="UNDISCLOSED">Préférer ne pas dire</option>
              </select>
            </Field>

            <Field label="J'ai des enfants">
              <div className={styles.triGroup}>
                {([['Oui', true], ['Non', false]] as [string, boolean][]).map(([label, v]) => (
                  <button
                    key={label} type="button"
                    className={`${styles.triBtn} ${form.hasChildren === v ? styles.triOn : ''}`}
                    onClick={() => set('hasChildren', v)}
                  >{label}</button>
                ))}
              </div>
              <p className={styles.hint}>Cette réponse est toujours renseignée.</p>
            </Field>

            <Field label="Je veux des enfants">
              <div className={styles.triGroup}>
                {([['Oui', true], ['Non', false], ['Sans avis', null]] as [string, boolean | null][]).map(([label, v]) => (
                  <button
                    key={label} type="button"
                    className={`${styles.triBtn} ${form.wantsChildren === v ? styles.triOn : ''}`}
                    onClick={() => set('wantsChildren', v)}
                  >{label}</button>
                ))}
              </div>
            </Field>

            <Field label="Langues parlées" className={styles.full}>
              <div className={styles.chips}>
                {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
                  <label key={code} className={`${styles.chip} ${form.languages.includes(code) ? styles.chipOn : ''}`}>
                    <input
                      type="checkbox" checked={form.languages.includes(code)}
                      onChange={() => toggleLanguage(code)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </Field>
          </div>
        </section>

        {/* ——— Apparence ——— */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Apparence</h2>
          <p className={styles.sectionLead}>
            Tout est facultatif. Laissez vide ce que vous ne souhaitez pas déclarer.
          </p>

          <div className={styles.grid}>
            <Field label="Taille">
              <input
                type="number" min={120} max={230} placeholder="cm"
                value={form.heightCm} onChange={e => set('heightCm', e.target.value)}
              />
            </Field>
            <Field label="Poids">
              <input
                type="number" min={35} max={250} placeholder="kg"
                value={form.weightKg} onChange={e => set('weightKg', e.target.value)}
              />
            </Field>
            <Field label="Silhouette">
              <select value={form.bodyType} onChange={e => set('bodyType', e.target.value)}>
                <option value="">Non précisée</option>
                {Object.entries(BODY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Origine ethnique">
              <select value={form.ethnicity} onChange={e => set('ethnicity', e.target.value)}>
                <option value="">Non précisée</option>
                {Object.entries(ETHNICITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <p className={styles.hint}>
                Information sensible : purement déclarative, jamais déduite, et vous
                pouvez la retirer à tout moment.
              </p>
            </Field>
          </div>
        </section>

        <div className={styles.saveBar}>
          <span className={styles.saveState}>
            {saving ? 'Enregistrement…' : dirty ? 'Modifications non enregistrées' : 'Tout est à jour'}
          </span>
          <div className={styles.saveActions}>
            <button className="btn btn-ghost" onClick={reset} disabled={!dirty || saving}>Annuler</button>
            <button className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, className, children }: {
  label: string; className?: string; children: React.ReactNode
}) {
  return (
    <div className={`${styles.field} ${className || ''}`}>
      <label>{label}</label>
      {children}
    </div>
  )
}
