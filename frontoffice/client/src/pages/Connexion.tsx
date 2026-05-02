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
    if (code.length === 6 && !code.includes('')) onComplete(code)
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

// ——— Dial code + phone row ———
const DIAL_CODES: [string, string][] = [
  ['+221', '+221'], ['+225', '+225'], ['+223', '+223'],
  ['+226', '+226'], ['+224', '+224'], ['+228', '+228'],
  ['+229', '+229'], ['+227', '+227'], ['+237', '+237'],
  ['+241', '+241'], ['+243', '+243'], ['+242', '+242'],
  ['+222', '+222'], ['+33', '+33'], ['+32', '+32'], ['+1', '+1'],
]

function PhoneRow({
  dial, setDial, local, setLocal, error,
}: {
  dial: string; setDial: (v: string) => void
  local: string; setLocal: (v: string) => void
  error?: string
}) {
  return (
    <div className={styles.formGroup}>
      <label>
        Numéro de téléphone
        {error && <span className={styles.fieldErr}> — {error}</span>}
      </label>
      <div className={styles.phoneRow}>
        <select className={styles.dialSelect} value={dial} onChange={e => setDial(e.target.value)}>
          {DIAL_CODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input
          type="tel" inputMode="numeric" placeholder="77 123 45 67"
          autoComplete="tel" value={local}
          className={error ? styles.inputError : ''}
          onChange={e => setLocal(e.target.value)}
        />
      </div>
    </div>
  )
}

// ================================================================
// MAIN COMPONENT
// ================================================================
type Tab = 'password' | 'sms'
type OtpPhase = 'form' | 'verify'

export default function Connexion() {
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('password')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  // Password tab state
  const [pwDial, setPwDial] = useState('+221')
  const [pwLocal, setPwLocal] = useState('')
  const [pwPassword, setPwPassword] = useState('')
  const [pwErrors, setPwErrors] = useState<{ phone?: string; password?: string }>({})

  // SMS tab state
  const [smsDial, setSmsDial] = useState('+221')
  const [smsLocal, setSmsLocal] = useState('')
  const [smsErrors, setSmsErrors] = useState<{ phone?: string }>({})
  const [otpPhase, setOtpPhase] = useState<OtpPhase>('form')
  const [otpCode, setOtpCode] = useState('')
  const [otpReset, setOtpReset] = useState(false)
  const { seconds, start: startCountdown, canResend } = useCountdown(60)

  const smsPhone = smsDial + smsLocal.replace(/\s/g, '')

  function clearMessages() { setError(''); setInfo('') }

  // ——— Tab switch ———
  function switchTab(t: Tab) {
    setTab(t)
    clearMessages()
    setOtpPhase('form')
  }

  // ——— Save & redirect ———
  function handleSuccess(data: { accessToken: string; refreshToken?: string; redirectUrl?: string }) {
    saveTokens(data)
    navigate(data.redirectUrl || '/')
  }

  // ——— Login with password ———
  async function loginPassword() {
    clearMessages()
    const e: typeof pwErrors = {}
    if (!pwLocal || !/^\d{7,12}$/.test(pwLocal.replace(/\s/g, ''))) e.phone = 'Numéro invalide'
    if (!pwPassword) e.password = 'Requis'
    setPwErrors(e)
    if (Object.keys(e).length) return

    setLoading(true)
    try {
      const data = await authApi.login({
        phone: pwDial + pwLocal.replace(/\s/g, ''),
        password: pwPassword,
      })
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
    if (!smsLocal || !/^\d{7,12}$/.test(smsLocal.replace(/\s/g, ''))) {
      setSmsErrors({ phone: 'Numéro invalide' }); return
    }
    setSmsErrors({})
    setLoading(true)
    try {
      await authApi.otpRequest(smsPhone)
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
      await authApi.otpRequest(smsPhone)
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
    if (otpCode.length < 6) return
    clearMessages()
    setLoading(true)
    try {
      const data = await authApi.otpVerify({ phone: smsPhone, code: otpCode })
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

  // ——— Forgot password: switch to SMS ———
  function forgotPassword(e: React.MouseEvent) {
    e.preventDefault()
    switchTab('sms')
    setInfo('Connectez-vous avec un code SMS pour réinitialiser votre mot de passe.')
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
              className={`${styles.tabBtn} ${tab === 'sms' ? styles.tabActive : ''}`}
              onClick={() => switchTab('sms')}
            >
              📱 Code SMS
            </button>
          </div>

          {/* ——— PASSWORD TAB ——— */}
          {tab === 'password' && (
            <div className={styles.formStep}>
              {error && <div className={styles.alertError}><span>⚠</span> {error}</div>}
              {info && <div className={styles.alertSuccess}><span>✓</span> {info}</div>}

              <PhoneRow
                dial={pwDial} setDial={setPwDial}
                local={pwLocal} setLocal={setPwLocal}
                error={pwErrors.phone}
              />

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

          {/* ——— SMS TAB ——— */}
          {tab === 'sms' && (
            <div className={styles.formStep}>
              {error && <div className={styles.alertError}><span>⚠</span> {error}</div>}
              {info && <div className={styles.alertSuccess}><span>✓</span> {info}</div>}

              {/* Phase 1 : saisie du numéro */}
              {otpPhase === 'form' && (
                <>
                  <PhoneRow
                    dial={smsDial} setDial={setSmsDial}
                    local={smsLocal} setLocal={setSmsLocal}
                    error={smsErrors.phone}
                  />
                  <div className={styles.actions}>
                    <button
                      className={`btn btn-primary ${styles.btnFull} ${loading ? 'btn-loading' : ''}`}
                      disabled={loading}
                      onClick={sendOtp}
                    >
                      {!loading && (
                        <>
                          Envoyer le code SMS
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 010 2.14 2 2 0 012 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.1V16.92z" />
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
                    Modifier le numéro
                  </button>

                  <div className={styles.otpHero}>
                    <div className={styles.otpIcon}>📱</div>
                    <div className={styles.otpPhone}>{smsPhone}</div>
                    <div className={styles.otpSub}>Code envoyé par SMS</div>
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
        </div>
      </div>
    </div>
  )
}
