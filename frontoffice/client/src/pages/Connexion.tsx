import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TerangaSymbol } from '../components/Logo'
import { authApi, saveTokens } from '../api/auth'
import styles from './AuthForms.module.css'

// ——— OTP Input block ———
function OtpBlock({
  onComplete,
  resetTrigger,
}: {
  onComplete: (code: string) => void
  resetTrigger: boolean
}) {
  const [values, setValues] = useState(['', '', '', '', '', ''])
  const refs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (resetTrigger) {
      setValues(['', '', '', '', '', ''])
      refs.current[0]?.focus()
    }
  }, [resetTrigger])

  const handleChange = (idx: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1)
    const next = [...values]
    next[idx] = digit
    setValues(next)
    if (digit && idx < 5) refs.current[idx + 1]?.focus()
    const code = next.join('')
    // `code` est une CHAÎNE, et `'495806'.includes('')` vaut toujours true —
    // toute chaîne contient la chaîne vide. La garde `!code.includes('')`
    // était donc toujours fausse : `onComplete` n'était jamais appelé, le
    // parent gardait un code vide, et le bouton « Se connecter » ne
    // déclenchait rien. Aucune requête, aucun message : de l'extérieur, le
    // bouton semblait mort.
    //
    // Le test visait sans doute le TABLEAU (`next.includes('')`, une case
    // encore vide). Il est de toute façon superflu : chaque case contient au
    // plus un chiffre, donc une jointure de longueur 6 prouve déjà qu'aucune
    // n'est vide. C'est exactement ce que fait l'inscription, dont l'écran de
    // code a toujours fonctionné.
    if (code.length === 6) onComplete(code)
  }

  const handleKey = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !values[idx] && idx > 0) {
      refs.current[idx - 1]?.focus()
      const next = [...values]
      next[idx - 1] = ''
      setValues(next)
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    const next = digits.padEnd(6, '').split('').slice(0, 6)
    setValues(next)
    const lastFilled = Math.min(digits.length, 5)
    refs.current[lastFilled]?.focus()
    if (digits.length === 6) onComplete(next.join(''))
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
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
        />
      ))}
    </div>
  )
}

// ——— Countdown hook ———
function useCountdown(duration: number) {
  const [seconds, setSeconds] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const start = useCallback(() => {
    setSeconds(duration)
    if (timer.current) clearInterval(timer.current)
    timer.current = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) { clearInterval(timer.current!); return 0 }
        return s - 1
      })
    }, 1000)
  }, [duration])

  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])
  return { seconds, start, canResend: seconds === 0 }
}

// ——— Password input with toggle ———
function PasswordInput({
  value, onChange, placeholder = 'Mot de passe', autoComplete = 'current-password',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className={styles.pwWrap}>
      <input
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        style={{ paddingRight: 46 }}
        onChange={e => onChange(e.target.value)}
      />
      <button type="button" className={styles.togglePw} onClick={() => setShow(s => !s)}>
        {show
          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        }
      </button>
    </div>
  )
}

// ================================================================
// MAIN COMPONENT
// ================================================================
/**
 * `reset` n'est pas un onglet : il n'apparaît pas dans la barre, on y entre
 * par le lien « Mot de passe oublié ». C'est un parcours à part — recevoir un
 * code, puis choisir un nouveau mot de passe — et non une troisième façon de
 * se connecter.
 */
type Tab = 'password' | 'email' | 'reset'
type OtpPhase = 'form' | 'verify'

export default function Connexion() {
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('password')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  // État de l'onglet « mot de passe ».
  // Identifié par l'adresse, comme l'onglet code : demander un numéro ici et
  // une adresse à côté obligeait à se souvenir de deux identifiants pour un
  // même compte.
  const [pwEmail, setPwEmail] = useState('')
  const [pwPassword, setPwPassword] = useState('')
  const [pwErrors, setPwErrors] = useState<{ email?: string; password?: string }>({})

  // État de l'onglet « code par e-mail ».
  //
  // La vérification passe par l'adresse et non par le numéro : l'acheminement
  // des SMS n'a jamais été fiable, et le serveur envoyait déjà le code par
  // e-mail en priorité. La page demandait pourtant un téléphone, ce qui
  // obligeait à connaître un numéro pour recevoir un message électronique.
  const [otpEmail, setOtpEmail] = useState('')
  const [otpErrors, setOtpErrors] = useState<{ email?: string }>({})
  const [otpPhase, setOtpPhase] = useState<OtpPhase>('form')
  const [otpCode, setOtpCode] = useState('')
  const [otpReset, setOtpReset] = useState(false)
  const { seconds, start: startCountdown, canResend } = useCountdown(60)

  // État du parcours « mot de passe oublié ».
  const [rsEmail, setRsEmail] = useState('')
  const [rsCode, setRsCode] = useState('')
  const [rsPassword, setRsPassword] = useState('')
  const [rsPhase, setRsPhase] = useState<OtpPhase>('form')
  const [rsErrors, setRsErrors] = useState<{ email?: string; password?: string }>({})
  const [rsReset, setRsReset] = useState(false)

  const adresse = otpEmail.trim().toLowerCase()
  const rsAdresse = rsEmail.trim().toLowerCase()
  const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

  function clearMessages() { setError(''); setInfo('') }

  // ——— Tab switch ———
  function switchTab(t: Tab) {
    setTab(t)
    clearMessages()
    setOtpPhase('form')
    if (t !== 'reset') setRsPhase('form')
  }

  // ——— Save & redirect ———
  function handleSuccess(data: { accessToken: string; refreshToken?: string; redirectUrl?: string }) {
    saveTokens(data)
    navigate(data.redirectUrl || '/accueil')
  }

  // ——— Login with password ———
  async function loginPassword() {
    clearMessages()
    const e: typeof pwErrors = {}
    const adressePw = pwEmail.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adressePw)) e.email = 'Adresse e-mail invalide'
    if (!pwPassword) e.password = 'Requis'
    setPwErrors(e)
    if (Object.keys(e).length) return

    setLoading(true)
    try {
      const data = await authApi.login({ email: adressePw, password: pwPassword })
      handleSuccess(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Identifiants incorrects. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  // ——— Send OTP ———
  async function sendOtp() {
    clearMessages()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adresse)) {
      setOtpErrors({ email: 'Adresse e-mail invalide' }); return
    }
    setOtpErrors({})
    setLoading(true)
    try {
      await authApi.otpRequest({ email: adresse })
      setOtpPhase('verify')
      startCountdown()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Impossible d\'envoyer le code.')
    } finally {
      setLoading(false)
    }
  }

  // ——— Resend OTP ———
  async function resendOtp() {
    clearMessages()
    try {
      await authApi.otpRequest({ email: adresse })
      setInfo('Nouveau code envoyé !')
      startCountdown()
      setOtpReset(true)
      setTimeout(() => setOtpReset(false), 100)
      setOtpCode('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Impossible de renvoyer le code.')
    }
  }

  // ——— Verify OTP ———
  async function verifyOtp() {
    // Un retour muet ici est ce qui a rendu le défaut ci-dessus invisible
    // pendant des jours : le bouton ne faisait rien, sans rien dire.
    if (otpCode.length < 6) {
      setError('Saisissez les 6 chiffres du code reçu par e-mail.')
      return
    }
    clearMessages()
    setLoading(true)
    try {
      const data = await authApi.otpVerify({ email: adresse, code: otpCode })
      handleSuccess(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Code incorrect. Réessayez.')
      setOtpReset(true)
      setTimeout(() => setOtpReset(false), 100)
      setOtpCode('')
    } finally {
      setLoading(false)
    }
  }

  // ——— Mot de passe oublié ———
  //
  // Menait auparavant vers l'onglet « code e-mail », ce qui ouvrait une
  // session sans jamais remplacer le mot de passe : la personne revenait au
  // même problème à la connexion suivante. Le parcours va maintenant au bout.
  function forgotPassword(e: React.MouseEvent) {
    e.preventDefault()
    setRsEmail(pwEmail)   // reprend l'adresse déjà saisie, sans la redemander
    setRsCode('')
    setRsPassword('')
    setRsPhase('form')
    switchTab('reset')
  }

  /** Demande un code DÉDIÉ : le serveur refuse un code de connexion ici. */
  async function sendResetCode() {
    clearMessages()
    if (!EMAIL_OK.test(rsAdresse)) { setRsErrors({ email: 'Adresse e-mail invalide' }); return }
    setRsErrors({})
    setLoading(true)
    try {
      await authApi.otpRequest({ email: rsAdresse }, 'password_reset')
      setRsPhase('verify')
      startCountdown()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Impossible d'envoyer le code.")
    } finally {
      setLoading(false)
    }
  }

  async function resendResetCode() {
    clearMessages()
    try {
      await authApi.otpRequest({ email: rsAdresse }, 'password_reset')
      setInfo('Nouveau code envoyé !')
      startCountdown()
      setRsReset(true)
      setTimeout(() => setRsReset(false), 100)
      setRsCode('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Impossible de renvoyer le code.')
    }
  }

  async function submitReset() {
    clearMessages()
    if (rsCode.length < 6) { setError('Saisissez les 6 chiffres du code reçu par e-mail.'); return }
    if (rsPassword.length < 8) { setRsErrors({ password: '8 caractères minimum' }); return }
    setRsErrors({})
    setLoading(true)
    try {
      await authApi.passwordReset({ email: rsAdresse, code: rsCode, password: rsPassword })
      // Le serveur n'ouvre pas de session et révoque les anciennes : on
      // renvoie donc vers la connexion, adresse pré-remplie.
      setPwEmail(rsAdresse)
      setPwPassword('')
      switchTab('password')
      setInfo('Mot de passe modifié. Connectez-vous avec le nouveau.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Code incorrect. Réessayez.')
      setRsReset(true)
      setTimeout(() => setRsReset(false), 100)
      setRsCode('')
    } finally {
      setLoading(false)
    }
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
          Pas encore membre ? <Link to="/inscription">Créer un compte</Link>
        </div>
      </nav>

      <div className={styles.wrap}>
        {/* LEFT PANEL */}
        <div className={`${styles.panelLeft} ${styles.panelLeftAlt}`}>
          <div className={styles.panelContent}>
            <div className={styles.panelLogoLarge}>
              <TerangaSymbol size={80} light />
            </div>
            <h2>Bon retour sur <em>Téranga</em></h2>
            <p>Des milliers de personnes attendent de vous connaître. Votre prochaine rencontre est peut-être déjà là.</p>
            <div className={styles.statsRow}>
              <div className={styles.stat}>
                <span className={styles.num}>12k+</span>
                <span className={styles.lbl}>Membres</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.num}>860+</span>
                <span className={styles.lbl}>Unions</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.num}>4.9★</span>
                <span className={styles.lbl}>Satisfaction</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className={styles.panelRight}>
          <div className={styles.formHeader}>
            <div className={styles.stepLabel}>Connexion</div>
            <h1>Retrouvez votre <em>communauté</em></h1>
            <p>Connectez-vous pour accéder à votre espace Téranga.</p>
          </div>

          {/* Tabs */}
          <div className={styles.tabs}>
            <button
              className={`${styles.tabBtn} ${tab === 'password' ? styles.tabActive : ''}`}
              onClick={() => switchTab('password')}
            >
              🔐 Mot de passe
            </button>
            <button
              className={`${styles.tabBtn} ${tab === 'email' ? styles.tabActive : ''}`}
              onClick={() => switchTab('email')}
            >
              ✉️ Code e-mail
            </button>
          </div>

          {/* ——— PASSWORD TAB ——— */}
          {tab === 'password' && (
            <div className={styles.formStep}>
              {error && <div className={styles.alertError}><span>⚠</span> {error}</div>}
              {info && <div className={styles.alertSuccess}><span>✓</span> {info}</div>}

              <div className={styles.formGroup}>
                <label>
                  Adresse e-mail
                  {pwErrors.email && <span className={styles.fieldErr}> — {pwErrors.email}</span>}
                </label>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="vous@exemple.com"
                  value={pwEmail}
                  onChange={(ev) => setPwEmail(ev.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label>
                  Mot de passe
                  {pwErrors.password && <span className={styles.fieldErr}> — {pwErrors.password}</span>}
                </label>
                <PasswordInput
                  value={pwPassword}
                  onChange={setPwPassword}
                  placeholder="Votre mot de passe"
                  autoComplete="current-password"
                />
              </div>

              <div className={styles.forgotLink}>
                <a href="#" onClick={forgotPassword}>Mot de passe oublié ?</a>
              </div>

              <div className={styles.actions}>
                <button
                  className={`btn btn-primary ${styles.btnFull} ${loading ? 'btn-loading' : ''}`}
                  disabled={loading}
                  onClick={loginPassword}
                >
                  {!loading && 'Se connecter'}
                </button>
              </div>

              <p className={styles.formFooter}>
                Pas encore de compte ? <Link to="/inscription">Créer mon profil</Link>
              </p>
            </div>
          )}

          {/* ——— ONGLET CODE PAR E-MAIL ——— */}
          {tab === 'email' && (
            <div className={styles.formStep}>
              {error && <div className={styles.alertError}><span>⚠</span> {error}</div>}
              {info && <div className={styles.alertSuccess}><span>✓</span> {info}</div>}

              {/* Phase 1 : saisie de l'adresse */}
              {otpPhase === 'form' && (
                <>
                  <div className={styles.formGroup}>
                    <label>
                      Adresse e-mail
                      {otpErrors.email && <span className={styles.fieldErr}> — {otpErrors.email}</span>}
                    </label>
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoFocus
                      placeholder="vous@exemple.com"
                      value={otpEmail}
                      onChange={(e) => setOtpEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') sendOtp() }}
                    />
                  </div>
                  <div className={styles.actions}>
                    <button
                      className={`btn btn-primary ${styles.btnFull} ${loading ? 'btn-loading' : ''}`}
                      disabled={loading}
                      onClick={sendOtp}
                    >
                      {!loading && (
                        <>
                          Recevoir mon code par e-mail
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="2" y="4" width="20" height="16" rx="2" />
                            <path d="M22 6l-10 7L2 6" />
                          </svg>
                        </>
                      )}
                    </button>
                  </div>
                  <p className={styles.formFooter}>
                    Pas encore de compte ? <Link to="/inscription">Créer mon profil</Link>
                  </p>
                </>
              )}

              {/* Phase 2 : vérification OTP */}
              {otpPhase === 'verify' && (
                <>
                  <button className={styles.backBtn} onClick={() => { setOtpPhase('form'); clearMessages() }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 12H5M12 5l-7 7 7 7" />
                    </svg>
                    Modifier l’adresse
                  </button>

                  <div className={styles.otpHero}>
                    <div className={styles.otpIcon}>✉️</div>
                    <div className={styles.otpPhone}>{adresse}</div>
                    <div className={styles.otpSub}>
                      Code envoyé par e-mail · pensez à regarder les indésirables
                    </div>
                  </div>

                  <OtpBlock onComplete={setOtpCode} resetTrigger={otpReset} />

                  <div className={styles.resendWrap}>
                    <button className={styles.resendBtn} disabled={!canResend} onClick={resendOtp}>
                      Renvoyer le code
                    </button>
                    {seconds > 0 && <span className={styles.countdown}>({seconds}s)</span>}
                  </div>

                  <div className={styles.actions}>
                    <button
                      className={`btn btn-primary ${styles.btnFull} ${loading ? 'btn-loading' : ''}`}
                      disabled={loading || otpCode.length < 6}
                      onClick={verifyOtp}
                    >
                      {!loading && 'Se connecter'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ——— MOT DE PASSE OUBLIÉ ———
              Deux temps : recevoir un code, puis choisir le nouveau mot de
              passe. Le code est demandé avec son propre motif — le serveur
              refuse ici un code de connexion, dont la conséquence ne serait
              plus d'ouvrir une session mais de changer la serrure. */}
          {tab === 'reset' && (
            <div className={styles.formStep}>
              {error && <div className={styles.alertError}><span>⚠</span> {error}</div>}
              {info && <div className={styles.alertSuccess}><span>✓</span> {info}</div>}

              {rsPhase === 'form' && (
                <>
                  <button className={styles.backBtn} onClick={() => switchTab('password')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 12H5M12 5l-7 7 7 7" />
                    </svg>
                    Retour à la connexion
                  </button>

                  <div className={styles.formGroup}>
                    <label>
                      Adresse e-mail
                      {rsErrors.email && <span className={styles.fieldErr}> — {rsErrors.email}</span>}
                    </label>
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoFocus
                      placeholder="vous@exemple.com"
                      value={rsEmail}
                      onChange={(e) => setRsEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') sendResetCode() }}
                    />
                  </div>

                  <div className={styles.actions}>
                    <button
                      className={`btn btn-primary ${styles.btnFull} ${loading ? 'btn-loading' : ''}`}
                      disabled={loading}
                      onClick={sendResetCode}
                    >
                      {!loading && (
                        <>
                          Recevoir un code
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="2" y="4" width="20" height="16" rx="2" />
                            <path d="M22 6l-10 7L2 6" />
                          </svg>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}

              {rsPhase === 'verify' && (
                <>
                  <button className={styles.backBtn} onClick={() => { setRsPhase('form'); clearMessages() }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 12H5M12 5l-7 7 7 7" />
                    </svg>
                    Modifier l’adresse
                  </button>

                  <div className={styles.otpHero}>
                    <div className={styles.otpIcon}>🔑</div>
                    <div className={styles.otpPhone}>{rsAdresse}</div>
                    <div className={styles.otpSub}>
                      Code envoyé par e-mail · pensez à regarder les indésirables
                    </div>
                  </div>

                  <OtpBlock onComplete={setRsCode} resetTrigger={rsReset} />

                  <div className={styles.resendWrap}>
                    <button className={styles.resendBtn} disabled={!canResend} onClick={resendResetCode}>
                      Renvoyer le code
                    </button>
                    {seconds > 0 && <span className={styles.countdown}>({seconds}s)</span>}
                  </div>

                  <div className={styles.formGroup}>
                    <label>
                      Nouveau mot de passe
                      {rsErrors.password && <span className={styles.fieldErr}> — {rsErrors.password}</span>}
                    </label>
                    {/* `new-password` et non `current-password` : sans cela le
                        navigateur propose l'ancien, celui qu'on remplace. */}
                    <PasswordInput
                      value={rsPassword}
                      onChange={setRsPassword}
                      placeholder="8 caractères minimum"
                      autoComplete="new-password"
                    />
                  </div>

                  <div className={styles.actions}>
                    <button
                      className={`btn btn-primary ${styles.btnFull} ${loading ? 'btn-loading' : ''}`}
                      disabled={loading || rsCode.length < 6 || rsPassword.length < 8}
                      onClick={submitReset}
                    >
                      {!loading && 'Changer mon mot de passe'}
                    </button>
                  </div>

                  <p className={styles.formFooter}>
                    Vos autres sessions seront fermées : il faudra vous reconnecter partout.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
