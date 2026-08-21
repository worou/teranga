import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TerangaSymbol } from '../components/Logo'
import {
  authApi, saveTokens, clearTokens, uploadPhotos, fetchMe, getToken,
  type RegisterPayload,
} from '../api/auth'
import styles from './AuthForms.module.css'

// ——— Types ———
type Gender = 'FEMALE' | 'MALE'
type Intent = 'SERIOUS_RELATIONSHIP' | 'MARRIAGE' | 'FAMILY'

interface Step1Data {
  firstName: string
  lastName: string
  gender: Gender | ''
  birthDate: string
  intent: Intent | ''
  city: string
  country: string
  religion: string
  profession: string
}

interface Step2Data {
  dialCode: string
  phoneLocal: string
  email: string
  password: string
}

// Erreurs de l'étape 1 : un message (string) par champ.
type Step1Errors = Partial<Record<keyof Step1Data, string>>

// ——— OTP Input ———
function OtpInput({ onComplete, onReset }: { onComplete: (code: string) => void; onReset: boolean }) {
  const [values, setValues] = useState(['', '', '', '', '', ''])
  const refs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (onReset) setValues(['', '', '', '', '', ''])
  }, [onReset])

  const handleChange = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1)
    const next = [...values]
    next[idx] = digit
    setValues(next)
    if (digit && idx < 5) refs.current[idx + 1]?.focus()
    const code = next.join('')
    if (code.length === 6) onComplete(code)
  }

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !values[idx] && idx > 0) {
      refs.current[idx - 1]?.focus()
      const next = [...values]; next[idx - 1] = ''; setValues(next)
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    const next = [...values]
    digits.split('').forEach((d, i) => { next[i] = d })
    setValues(next)
    if (digits.length >= 6) { refs.current[5]?.focus(); onComplete(next.join('')) }
    else refs.current[digits.length]?.focus()
  }

  return (
    <div className={styles.otpGroup}>
      {values.map((v, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el }}
          className={`${styles.otpInput} ${v ? styles.otpFilled : ''}`}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={v}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
        />
      ))}
    </div>
  )
}

// ——— Countdown Hook ———
function useCountdown(initial: number) {
  const [seconds, setSeconds] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const start = useCallback(() => {
    setSeconds(initial)
    if (timer.current) clearInterval(timer.current)
    timer.current = setInterval(() => {
      setSeconds(s => { if (s <= 1) { clearInterval(timer.current!); return 0 } return s - 1 })
    }, 1000)
  }, [initial])

  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])
  return { seconds, start, canResend: seconds === 0 }
}

// ——— Password strength ———
function getStrength(pw: string): { width: string; color: string; label: string } {
  if (!pw) return { width: '0', color: '', label: '' }
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  const levels = [
    { width: '20%', color: '#C0392B', label: 'Trop faible' },
    { width: '45%', color: '#E67E22', label: 'Faible' },
    { width: '70%', color: '#F39C12', label: 'Moyen' },
    { width: '100%', color: '#27AE60', label: 'Fort' },
  ]
  return levels[Math.min(score - 1, 3)] || levels[0]
}

// ——— Âge calculé à partir d'une date ISO (null si invalide/hors bornes) ———
function calcAge(iso: string): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const age = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000))
  return age >= 0 && age < 130 ? age : null
}

// ——— Main ———
export default function Inscription() {
  const navigate = useNavigate()
  const topRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [otpReset, setOtpReset] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [token, setToken] = useState('')
  // Code renvoyé par l'API en développement sans fournisseur SMS (jamais en
  // production) : évite d'aller le chercher dans la console du serveur.
  const [devCode, setDevCode] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  // Seuils annoncés par l'API (config.profile) ; ces valeurs ne sont qu'un repli.
  const [minPhotos, setMinPhotos] = useState(3)
  const [maxPhotos, setMaxPhotos] = useState(6)
  // Photos déjà présentes sur le profil (cas d'une reprise d'inscription) :
  // elles comptent dans le minimum, seules les nouvelles sont à envoyer.
  const [serverPhotos, setServerPhotos] = useState(0)
  const { seconds, start: startCountdown, canResend } = useCountdown(60)

  // Reprise : un compte créé dont l'étape photos a été abandonnée reste bloqué
  // côté API (403 PHOTOS_REQUIRED). On le ramène directement à cette étape
  // plutôt que de lui faire recommencer une inscription qui échouerait en 409.
  useEffect(() => {
    const saved = getToken()
    if (!saved) return
    let alive = true
    fetchMe()
      .then(me => {
        if (!alive) return
        if (me.minPhotos) setMinPhotos(me.minPhotos)
        if (me.maxPhotos) setMaxPhotos(me.maxPhotos)
        if (me.profileComplete) { navigate('/accueil', { replace: true }); return }
        setServerPhotos(me.photosCount ?? 0)
        setToken(saved)
        setStep(4)
      })
      .catch(() => {
        // Token expiré ou API injoignable : on repart sur une inscription
        // normale plutôt que de laisser un token mort bloquer l'écran.
        clearTokens()
      })
    return () => { alive = false }
  }, [navigate])

  const [s1, setS1] = useState<Step1Data>({
    firstName: '', lastName: '', gender: '', birthDate: '',
    intent: '', city: '', country: '', religion: '', profession: '',
  })
  const [s2, setS2] = useState<Step2Data>({
    dialCode: '+221', phoneLocal: '', email: '', password: '',
  })
  const [errors1, setErrors1] = useState<Step1Errors>({})
  const [errors2, setErrors2] = useState<Partial<Step2Data & { phone: string }>>({})
  const strength = getStrength(s2.password)
  const birthAge = calcAge(s1.birthDate)

  // Normalisation du numéro : on ne garde que les chiffres, on retire un
  // éventuel indicatif ressaisi dans le champ local, puis les zéros de tête.
  const dialDigits = s2.dialCode.replace(/\D/g, '')
  let phoneLocalDigits = s2.phoneLocal.replace(/\D/g, '')
  if (dialDigits && phoneLocalDigits.startsWith(dialDigits) && phoneLocalDigits.length - dialDigits.length >= 7) {
    phoneLocalDigits = phoneLocalDigits.slice(dialDigits.length)
  }
  phoneLocalDigits = phoneLocalDigits.replace(/^0+/, '')
  const phone = s2.dialCode + phoneLocalDigits

  // ——— Validate Step 1 ———
  function validateStep1(): Step1Errors {
    const e: Step1Errors = {}
    if (!s1.firstName.trim()) e.firstName = 'Requis'
    if (!s1.gender) e.gender = 'Requis'
    if (!s1.birthDate) { e.birthDate = 'Requis' }
    else {
      const age = (Date.now() - new Date(s1.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000)
      if (age < 18) e.birthDate = 'Vous devez avoir au moins 18 ans.'
    }
    if (!s1.intent) e.intent = 'Requis'
    if (!s1.city.trim()) e.city = 'Requis'
    if (!s1.country) e.country = 'Requis'
    setErrors1(e)
    return e
  }

  // ——— Validate Step 2 ———
  function validateStep2() {
    const e: Partial<Record<string, string>> = {}
    if (!/^\d{7,12}$/.test(phoneLocalDigits)) e.phone = 'Numéro invalide'
    // Zone F CFA : l'indicatif doit correspondre au pays (miroir du serveur).
    else if (XOF_COUNTRIES.has(s1.country) && s2.dialCode !== COUNTRY_DIAL[s1.country]) {
      e.phone = `Indicatif ${COUNTRY_DIAL[s1.country]} attendu pour ce pays`
    }
    if (s2.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s2.email)) e.email = 'Email invalide'
    setErrors2(e)
    return Object.keys(e).length === 0
  }

  // ——— Step 1 → 2 ———
  const STEP1_LABELS: Record<keyof Step1Data, string> = {
    firstName: 'Prénom', lastName: 'Nom', gender: 'Je suis', birthDate: 'Date de naissance',
    intent: 'Je recherche', city: 'Ville', country: 'Pays', religion: 'Religion', profession: 'Profession',
  }
  function nextStep1() {
    const e = validateStep1()
    const keys = Object.keys(e) as (keyof Step1Data)[]
    if (keys.length === 0) {
      setError('')
      // Aligne l'indicatif sur le pays choisi (évite un numéro incohérent).
      const dc = COUNTRY_DIAL[s1.country]
      if (dc) setS2(p => ({ ...p, dialCode: dc }))
      setStep(2)
      return
    }
    // Retour visible : bannière en haut + défilement (l'erreur peut être hors écran, ex. le Prénom).
    const missing = keys.map(k => STEP1_LABELS[k]).join(', ')
    setError(`Veuillez corriger : ${missing}.`)
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ——— Step 2 → Register → OTP ———
  async function nextStep2() {
    if (!validateStep2()) return
    setError(''); setLoading(true)
    const payload: RegisterPayload = {
      phone,
      firstName: s1.firstName.trim(),
      gender: s1.gender as Gender,
      birthDate: s1.birthDate,
      intent: s1.intent as Intent,
      city: s1.city.trim(),
      country: s1.country === 'OTHER' ? 'XX' : s1.country,
    }
    if (s1.lastName.trim()) payload.lastName = s1.lastName.trim()
    if (s2.email.trim()) payload.email = s2.email.trim()
    if (s2.password) payload.password = s2.password
    if (s1.religion) payload.religion = s1.religion
    if (s1.profession.trim()) payload.profession = s1.profession.trim()

    try {
      const res = await authApi.register(payload)
      setDevCode(res.devCode ?? '')
      // Inscription déjà entamée pour ce numéro : l'API a renvoyé un code au
      // lieu d'un 409, on le signale sans bloquer.
      setSuccess(res.resumed ? (res.message ?? '') : '')
      setStep(3)
      startCountdown()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  // ——— OTP Verify ———
  async function verifyOtp() {
    if (otpCode.length < 6) return
    setError(''); setLoading(true)
    try {
      const data = await authApi.otpVerify({ phone, code: otpCode })
      saveTokens(data)
      setToken(data.accessToken)
      if (data.user?.minPhotos) setMinPhotos(data.user.minPhotos)
      if (data.user?.maxPhotos) setMaxPhotos(data.user.maxPhotos)
      setStep(4) // téléphone vérifié → étape photos (obligatoire, exigée par l'API)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Code incorrect')
      setOtpReset(true)
      setTimeout(() => setOtpReset(false), 100)
      setOtpCode('')
    } finally {
      setLoading(false)
    }
  }

  // ——— Photos (étape 4) ———
  // Total du profil = photos déjà en ligne (reprise) + fichiers en attente
  // d'envoi. C'est ce total que l'API compare à son minimum.
  const totalPhotos = serverPhotos + photos.length
  const photosMissing = Math.max(minPhotos - totalPhotos, 0)
  const slotsLeft = Math.max(maxPhotos - totalPhotos, 0)

  function addPhotoFiles(fileList: FileList | null) {
    if (!fileList) return
    setError('')
    const incoming = Array.from(fileList).filter(f => f.type.startsWith('image/'))
    // On tronque au nombre de places restantes : au-delà, l'API rejetterait les
    // fichiers en trop et l'envoi ne serait que partiellement appliqué.
    setPhotos(prev => [...prev, ...incoming.slice(0, Math.max(maxPhotos - serverPhotos - prev.length, 0))])
  }

  function removePhoto(idx: number) {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
  }

  async function finishWithPhotos() {
    if (totalPhotos < minPhotos) {
      setError(`Ajoutez au moins ${minPhotos} photos pour finaliser votre profil.`)
      return
    }
    setError(''); setLoading(true)
    try {
      // Reprise déjà complète côté serveur : rien de neuf à envoyer.
      if (photos.length > 0) await uploadPhotos(photos, token)
      navigate('/accueil')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Échec de l'envoi des photos.")
    } finally {
      setLoading(false)
    }
  }

  // ——— Resend OTP ———
  async function resendOtp() {
    setError(''); setSuccess('')
    try {
      const res = await authApi.otpRequest(phone)
      setDevCode(res.devCode ?? '')
      setSuccess('Nouveau code envoyé !')
      startCountdown()
      setOtpReset(true); setTimeout(() => setOtpReset(false), 100)
      setOtpCode('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Impossible de renvoyer le code')
    }
  }

  const progressStep = (n: number) => {
    if (n < step) return styles.progressDone
    if (n === step) return styles.progressActive
    return ''
  }

  return (
    <div className={styles.page}>
      {/* NAV */}
      <nav className={styles.nav}>
        <Link to="/" className={styles.navLogo}>
          <TerangaSymbol size={34} />
          <span className={styles.navLogoText}>Tér<em>anga</em></span>
        </Link>
        <div className={styles.navRight}>
          Déjà membre ? <Link to="/connexion">Se connecter</Link>
        </div>
      </nav>

      <div className={styles.wrap}>
        {/* LEFT PANEL */}
        <div className={styles.panelLeft}>
          <div className={styles.panelQuote}>
            <span className={styles.quoteMark}>"</span>
            <blockquote>L'amour vrai prend le temps de se construire, pas de se décider.</blockquote>
            <cite>Philosophie Téranga</cite>
          </div>
          <div className={styles.panelBadges}>
            {[
              { icon: '🔒', title: 'Confidentialité totale', body: 'Vos données ne sont jamais revendues ni partagées' },
              { icon: '✅', title: 'Profils vérifiés', body: 'Chaque profil est contrôlé par notre équipe' },
              { icon: '💬', title: 'Rencontres sérieuses', body: 'Conçu pour ceux qui veulent s\'engager' },
            ].map((b, i) => (
              <div key={i} className={styles.panelBadge}>
                <div className={styles.badgeIcon}>{b.icon}</div>
                <div className={styles.badgeText}><strong>{b.title}</strong>{b.body}</div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className={styles.panelRight}>
          {/* Progress bar */}
          <div className={styles.progressBar}>
            {[1, 2, 3, 4].map(n => <div key={n} className={`${styles.progressStep} ${progressStep(n)}`} />)}
          </div>

          {/* ——— STEP 1 ——— */}
          {step === 1 && (
            <div className={styles.formStep} ref={topRef}>
              <div className={styles.formHeader}>
                <div className={styles.stepLabel}>Étape 1 sur 4</div>
                <h1>Parlez-nous de <em>vous</em></h1>
                <p>Ces informations nous aident à trouver les personnes les plus compatibles.</p>
              </div>

              {error && <div className={styles.alertError}><span>⚠</span> {error}</div>}

              <div className={styles.formGrid}>
                <Field label="Prénom" error={errors1.firstName}>
                  <input type="text" placeholder="Aminata" autoComplete="given-name" value={s1.firstName}
                    className={errors1.firstName ? styles.inputError : ''}
                    onChange={e => setS1(p => ({ ...p, firstName: e.target.value }))} />
                </Field>

                <Field label="Nom" optional>
                  <input type="text" placeholder="Diallo" autoComplete="family-name" value={s1.lastName}
                    onChange={e => setS1(p => ({ ...p, lastName: e.target.value }))} />
                </Field>

                <div className={`${styles.field} ${styles.fullWidth}`}>
                  <label>Je suis {errors1.gender && <span className={styles.fieldErr}> — {errors1.gender}</span>}</label>
                  <div className={styles.radioGroup}>
                    {([['FEMALE', '♀ Une femme'], ['MALE', '♂ Un homme']] as [Gender, string][]).map(([val, label]) => (
                      <label key={val} className={`${styles.radioOption} ${s1.gender === val ? styles.radioChecked : ''}`}>
                        <input type="radio" name="gender" value={val} checked={s1.gender === val}
                          onChange={() => setS1(p => ({ ...p, gender: val }))} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <Field label="Date de naissance" error={errors1.birthDate}>
                  <input type="date" value={s1.birthDate} autoComplete="bday"
                    className={errors1.birthDate ? styles.inputError : ''}
                    onChange={e => setS1(p => ({ ...p, birthDate: e.target.value }))} />
                  {birthAge !== null && (
                    <span className={styles.ageHint}>
                      {birthAge} ans{birthAge < 18 ? ' — minimum 18 ans requis' : ''}
                    </span>
                  )}
                </Field>

                <Field label="Je recherche" error={errors1.intent}>
                  <select value={s1.intent} className={errors1.intent ? styles.inputError : ''}
                    onChange={e => setS1(p => ({ ...p, intent: e.target.value as Intent }))}>
                    <option value="">Choisir…</option>
                    <option value="SERIOUS_RELATIONSHIP">Une relation sérieuse</option>
                    <option value="MARRIAGE">Le mariage</option>
                    <option value="FAMILY">Fonder une famille</option>
                  </select>
                </Field>

                <Field label="Ville" error={errors1.city}>
                  <input type="text" placeholder="Dakar" autoComplete="address-level2" value={s1.city}
                    className={errors1.city ? styles.inputError : ''}
                    onChange={e => setS1(p => ({ ...p, city: e.target.value }))} />
                </Field>

                <Field label="Pays" error={errors1.country}>
                  <select value={s1.country} className={errors1.country ? styles.inputError : ''}
                    onChange={e => setS1(p => ({ ...p, country: e.target.value }))}>
                    <option value="">Choisir…</option>
                    {COUNTRIES.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                  </select>
                </Field>

                <Field label="Religion" optional>
                  {/* Valeurs alignées sur l'enum attendu par l'API (Religion) */}
                  <select value={s1.religion} onChange={e => setS1(p => ({ ...p, religion: e.target.value }))}>
                    <option value="">Préférer ne pas dire</option>
                    <option value="MUSLIM">Islam</option>
                    <option value="CHRISTIAN">Christianisme</option>
                    <option value="OTHER">Autre</option>
                  </select>
                </Field>

                <Field label="Profession" optional className={styles.fullWidth}>
                  <input type="text" placeholder="Ingénieure, médecin…" value={s1.profession}
                    onChange={e => setS1(p => ({ ...p, profession: e.target.value }))} />
                </Field>
              </div>

              <div className={styles.actions}>
                <button className={`btn btn-primary ${styles.btnFull}`} onClick={nextStep1}>
                  Continuer
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
              </div>
              <p className={styles.formFooter}>
                En créant un compte, vous acceptez nos <a href="#">Conditions d'utilisation</a> et notre <a href="#">Politique de confidentialité</a>.
              </p>
            </div>
          )}

          {/* ——— STEP 2 ——— */}
          {step === 2 && (
            <div className={styles.formStep}>
              <div className={styles.formHeader}>
                <div className={styles.stepLabel}>Étape 2 sur 4</div>
                <h1>Votre <em>numéro</em></h1>
                <p>Nous vous enverrons un code SMS pour confirmer votre identité.</p>
              </div>

              {error && <div className={styles.alertError}><span>⚠</span> {error}</div>}

              <div className={styles.formGrid}>
                <div className={`${styles.field} ${styles.fullWidth}`}>
                  <label>Téléphone {errors2.phone && <span className={styles.fieldErr}> — {errors2.phone}</span>}</label>
                  <div className={styles.phoneRow}>
                    <select className={styles.dialSelect} value={s2.dialCode}
                      onChange={e => setS2(p => ({ ...p, dialCode: e.target.value }))}>
                      {DIAL_CODES.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                    </select>
                    <input type="tel" placeholder="759 856 864" inputMode="numeric" autoComplete="tel"
                      value={s2.phoneLocal} className={errors2.phone ? styles.inputError : ''}
                      onChange={e => setS2(p => ({ ...p, phoneLocal: e.target.value.replace(/[^\d\s]/g, '') }))} />
                  </div>
                </div>

                <Field label="Adresse e-mail" optional error={errors2.email} className={styles.fullWidth}>
                  <input type="email" placeholder="aminata@exemple.com" autoComplete="email"
                    value={s2.email} className={errors2.email ? styles.inputError : ''}
                    onChange={e => setS2(p => ({ ...p, email: e.target.value }))} />
                </Field>

                <Field label="Mot de passe" optional className={styles.fullWidth}>
                  <div className={styles.pwWrap}>
                    <PasswordInput value={s2.password} onChange={v => setS2(p => ({ ...p, password: v }))} />
                  </div>
                  {s2.password && (
                    <>
                      <div className={styles.strengthBar}>
                        <div className={styles.strengthFill} style={{ width: strength.width, background: strength.color }} />
                      </div>
                      <div className={styles.strengthLabel}>{strength.label}</div>
                    </>
                  )}
                </Field>
              </div>

              <div className={styles.actions}>
                <button className={`btn btn-back ${styles.btnBack}`} onClick={() => { setError(''); setStep(1) }}>Retour</button>
                <button className={`btn btn-primary ${styles.btnFull} ${loading ? 'btn-loading' : ''}`}
                  disabled={loading} onClick={nextStep2}>
                  {!loading && <>Envoyer le code SMS <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 010 2.14 2 2 0 012 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.1V14.92z"/></svg></>}
                </button>
              </div>
            </div>
          )}

          {/* ——— STEP 3 — OTP ——— */}
          {step === 3 && (
            <div className={styles.formStep}>
              <div className={styles.formHeader}>
                <div className={styles.stepLabel}>Étape 3 sur 4</div>
                <h1>Vérifiez votre <em>téléphone</em></h1>
                <p>Entrez le code à 6 chiffres reçu par SMS.</p>
              </div>

              {error && <div className={styles.alertError}><span>⚠</span> {error}</div>}
              {success && <div className={styles.alertSuccess}><span>✓</span> {success}</div>}

              <div className={styles.otpHero}>
                <div className={styles.otpIcon}>📱</div>
                <div className={styles.otpPhone}>{phone}</div>
                <div className={styles.otpSub}>Code envoyé par SMS</div>
              </div>

              {devCode && (
                <div className={styles.alertSuccess}>
                  <span>🛠</span>
                  <span>
                    Mode développement — aucun fournisseur SMS configuré.
                    Votre code : <strong style={{ letterSpacing: '0.18em' }}>{devCode}</strong>
                  </span>
                </div>
              )}

              <OtpInput onComplete={setOtpCode} onReset={otpReset} />

              <div className={styles.resendWrap}>
                <button className={styles.resendBtn} disabled={!canResend} onClick={resendOtp}>
                  Renvoyer le code
                </button>
                {seconds > 0 && <span className={styles.countdown}>({seconds}s)</span>}
              </div>

              <div className={styles.actions}>
                <button className={`btn btn-back ${styles.btnBack}`} onClick={() => { setError(''); setStep(2) }}>Retour</button>
                <button
                  className={`btn btn-primary ${styles.btnFull} ${loading ? 'btn-loading' : ''}`}
                  disabled={loading || otpCode.length < 6}
                  onClick={verifyOtp}>
                  {!loading && 'Vérifier mon numéro'}
                </button>
              </div>
            </div>
          )}

          {/* ——— STEP 4 — PHOTOS ——— */}
          {step === 4 && (
            <div className={styles.formStep}>
              <div className={styles.formHeader}>
                <div className={styles.stepLabel}>Étape 4 sur 4</div>
                <h1>Vos <em>photos</em></h1>
                <p>Ajoutez au moins {minPhotos} photos pour créer votre profil. Elles seront vérifiées avant publication.</p>
              </div>

              {error && <div className={styles.alertError}><span>⚠</span> {error}</div>}

              {serverPhotos > 0 && (
                <div className={styles.alertSuccess}>
                  <span>✓</span> {serverPhotos} photo{serverPhotos > 1 ? 's' : ''} déjà
                  enregistrée{serverPhotos > 1 ? 's' : ''} sur votre profil.
                </div>
              )}

              <div className={styles.photoGrid}>
                {photos.map((f, i) => (
                  <div key={i} className={styles.photoThumb}>
                    <img src={URL.createObjectURL(f)} alt={`Photo ${i + 1}`} />
                    <button type="button" className={styles.photoRemove} onClick={() => removePhoto(i)} aria-label="Retirer la photo">×</button>
                    {i === 0 && <span className={styles.photoMain}>Principale</span>}
                  </div>
                ))}
                {slotsLeft > 0 && (
                  <label className={styles.photoAdd}>
                    <input type="file" accept="image/*" multiple hidden
                      onChange={e => { addPhotoFiles(e.target.files); e.target.value = '' }} />
                    <span className={styles.photoAddPlus}>+</span>
                    <span className={styles.photoAddText}>Ajouter</span>
                  </label>
                )}
              </div>

              <div className={styles.photoHint}>
                {totalPhotos} / {minPhotos} minimum · {maxPhotos} max · JPEG, PNG ou WebP (5 Mo max)
              </div>

              <div className={styles.actions}>
                <button
                  className={`btn btn-primary ${styles.btnFull} ${loading ? 'btn-loading' : ''}`}
                  disabled={loading || photosMissing > 0}
                  onClick={finishWithPhotos}>
                  {!loading && (photosMissing === 0
                    ? 'Créer mon compte'
                    : `Ajoutez ${photosMissing} photo${photosMissing > 1 ? 's' : ''} de plus`)}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ——— Helpers ———
function Field({ label, optional, error, children, className }: {
  label: string; optional?: boolean; error?: string
  children: React.ReactNode; className?: string
}) {
  return (
    <div className={`${styles.field} ${className || ''}`}>
      <label>
        {label}
        {optional && <span className={styles.optLabel}> (optionnel)</span>}
        {error && <span className={styles.fieldErr}> — {error}</span>}
      </label>
      {children}
    </div>
  )
}

function PasswordInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false)
  return (
    <div className={styles.pwWrap}>
      <input
        type={show ? 'text' : 'password'}
        placeholder="Mot de passe sécurisé"
        autoComplete="new-password"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ paddingRight: 46 }}
      />
      <button type="button" className={styles.togglePw} onClick={() => setShow(s => !s)} aria-label="Afficher/masquer">
        {show
          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        }
      </button>
    </div>
  )
}

const COUNTRIES: [string, string][] = [
  ['SN', '🇸🇳 Sénégal'], ['CI', '🇨🇮 Côte d\'Ivoire'], ['ML', '🇲🇱 Mali'],
  ['BF', '🇧🇫 Burkina Faso'], ['GN', '🇬🇳 Guinée'], ['TG', '🇹🇬 Togo'],
  ['BJ', '🇧🇯 Bénin'], ['NE', '🇳🇪 Niger'], ['CM', '🇨🇲 Cameroun'],
  ['GA', '🇬🇦 Gabon'], ['CD', '🇨🇩 RD Congo'], ['CG', '🇨🇬 Congo'],
  ['MR', '🇲🇷 Mauritanie'], ['FR', '🇫🇷 France'], ['BE', '🇧🇪 Belgique'],
  ['CA', '🇨🇦 Canada'], ['OTHER', '🌍 Autre'],
]

const DIAL_CODES: [string, string][] = [
  ['+221', '+221'], ['+225', '+225'], ['+223', '+223'],
  ['+226', '+226'], ['+224', '+224'], ['+228', '+228'],
  ['+229', '+229'], ['+227', '+227'], ['+237', '+237'],
  ['+241', '+241'], ['+243', '+243'], ['+242', '+242'],
  ['+222', '+222'], ['+33', '+33'], ['+32', '+32'], ['+1', '+1'],
]

// Indicatif par pays (aligne le champ téléphone sur le pays choisi).
const COUNTRY_DIAL: Record<string, string> = {
  SN: '+221', CI: '+225', ML: '+223', BF: '+226', GN: '+224', TG: '+228',
  BJ: '+229', NE: '+227', CM: '+237', GA: '+241', CD: '+243', CG: '+242',
  MR: '+222', FR: '+33', BE: '+32', CA: '+1',
}

// Pays de la zone F CFA où l'indicatif est imposé (paiement + OTP par SMS).
// Miroir du garde-fou serveur (registerSchema).
const XOF_COUNTRIES = new Set(['SN', 'CI', 'ML', 'BF', 'BJ', 'TG', 'NE'])
