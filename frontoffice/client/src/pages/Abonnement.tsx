import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TerangaSymbol } from '../components/Logo'
import { fetchMe, type MeResponse } from '../api/auth'
import {
  paymentsApi,
  type PricingCatalog,
  type PlanKey,
  type PaymentMethod,
  type PaymentStatus,
  type BankTransferDetails,
} from '../api/payments'
import styles from './AuthForms.module.css'

const PLAN_ORDER: PlanKey[] = ['DISCOVERY', 'STANDARD', 'ENGAGEMENT']
const PLAN_META: Record<PlanKey, { name: string; tagline: string }> = {
  DISCOVERY: { name: 'Découverte', tagline: 'Pour tester' },
  STANDARD: { name: 'Standard', tagline: 'Le plus choisi' },
  ENGAGEMENT: { name: 'Engagement', tagline: 'Le meilleur prix' },
}

const fcfa = (n: number) => `${n.toLocaleString('fr-FR')} F CFA`
// Parité fixe franc CFA ↔ euro (PayPal facture en EUR).
const XOF_PER_EUR = 655.957
const toEur = (xof: number) => (xof / XOF_PER_EUR).toFixed(2)

type Phase = 'choose' | 'pay' | 'awaiting' | 'done' | 'failed'

/**
 * Tunnel d'abonnement : sélection du plan → moyen de paiement mobile + numéro →
 * initiation du paiement (CinetPay) → attente de confirmation par sondage.
 *
 * L'abonnement est activé côté serveur à la confirmation ; on sonde
 * GET /payments/:id/status jusqu'à COMPLETED / FAILED (ou expiration).
 */
export default function Abonnement() {
  const navigate = useNavigate()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [catalog, setCatalog] = useState<PricingCatalog | null>(null)
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [supported, setSupported] = useState(true)
  const [dialingCode, setDialingCode] = useState<string | null>(null)

  const [plan, setPlan] = useState<PlanKey>('STANDARD')
  const [method, setMethod] = useState<string>('')
  const [phone, setPhone] = useState('')
  const [autoRenew, setAutoRenew] = useState(true)

  const [phase, setPhase] = useState<Phase>('choose')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ussd, setUssd] = useState<string | undefined>()
  const [payUrl, setPayUrl] = useState<string | null>(null)
  const [bank, setBank] = useState<BankTransferDetails | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Chargement initial : profil + catalogue + moyens de paiement.
  useEffect(() => {
    let alive = true
    Promise.all([fetchMe(), paymentsApi.pricing(), paymentsApi.methods()])
      .then(([meData, cat, m]) => {
        if (!alive) return
        setMe(meData)
        setCatalog(cat)
        setMethods(m.methods)
        setSupported(m.supported)
        setDialingCode(m.dialingCode)
        if (m.methods[0]) setMethod(m.methods[0].method)
        // Pré-remplissage du numéro : on garde celui du profil s'il correspond
        // à l'indicatif du pays ; sinon on amorce avec l'indicatif attendu pour
        // éviter de soumettre un numéro voué au refus (ex. numéro étranger).
        if (meData.phone && m.dialingCode && meData.phone.startsWith(m.dialingCode)) {
          setPhone(meData.phone)
        } else if (m.dialingCode) {
          setPhone(m.dialingCode)
        } else if (meData.phone) {
          setPhone(meData.phone)
        }
      })
      .catch(err => alive && setError(err instanceof Error ? err.message : 'Chargement impossible.'))
    return () => { alive = false }
  }, [])

  // Nettoyage du sondage.
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const selectedMethod = methods.find(m => m.method === method)
  const needsPhone = selectedMethod?.isMobileMoney ?? true
  const isPaypal = method === 'PAYPAL'
  const isCard = method === 'CARD'
  const isBankTransfer = method === 'BANK_TRANSFER'

  // Un numéro mobile money doit porter l'indicatif du pays (règle serveur).
  const phoneMatchesCountry =
    !needsPhone || !dialingCode || phone.startsWith(dialingCode)
  const phoneWellFormed = /^\+\d{8,15}$/.test(phone)
  const phoneValid = !needsPhone || (phoneWellFormed && phoneMatchesCountry)

  function onStatus(p: PaymentStatus) {
    if (p.status === 'COMPLETED') {
      stopPolling()
      setPhase('done')
    } else if (p.status === 'FAILED') {
      stopPolling()
      setError(p.failureReason || "Le paiement a échoué.")
      setPhase('failed')
    }
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  async function startSubscription() {
    setError('')
    if (needsPhone && !phoneWellFormed) {
      setError('Numéro invalide (format international, ex. +221771234567).')
      return
    }
    if (needsPhone && !phoneMatchesCountry) {
      setError(
        `Ce moyen exige un numéro ${me?.country ?? ''} commençant par ${dialingCode}. ` +
        `Depuis l'étranger, choisissez « Carte bancaire ».`,
      )
      return
    }
    setLoading(true)
    try {
      const res = await paymentsApi.subscribe({
        plan,
        method,
        phoneNumber: needsPhone ? phone : undefined,
        autoRenew,
      })
      setUssd(res.ussdInstruction)
      setPayUrl(res.paymentUrl)
      setBank(res.bankTransfer ?? null)
      setPhase('awaiting')
      // Sondage du statut toutes les 3 s (le webhook confirme en arrière-plan).
      pollRef.current = setInterval(async () => {
        try { onStatus(await paymentsApi.status(res.paymentId)) } catch { /* transitoire */ }
      }, 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'initier le paiement.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link to="/accueil" className={styles.navLogo}>
          <TerangaSymbol size={34} />
          <span className={styles.navLogoText}>Tér<em>anga</em></span>
        </Link>
        <div className={styles.navRight}>
          <Link to="/accueil">Retour à mon espace</Link>
        </div>
      </nav>

      <div className={styles.wrap}>
        <div className={styles.panelRight} style={{ maxWidth: 620, margin: '0 auto' }}>
          <div className={styles.formHeader}>
            <div className={styles.stepLabel}>Abonnement</div>
            <h1>Débloquez toute l'<em>expérience</em></h1>
            <p>Messagerie illimitée, likes et profils sans limite. Paiement mobile money sécurisé.</p>
          </div>

          {error && phase !== 'failed' && <div className={styles.alertError}><span>⚠</span> {error}</div>}

          {!supported && (
            <div className={styles.alertError}>
              <span>⚠</span> Le paiement n'est pas encore disponible dans votre pays (zone F CFA / UEMOA uniquement).
            </div>
          )}

          {/* ——— ÉTAPE 1 : choix du plan ——— */}
          {phase === 'choose' && catalog && (
            <>
              <div className={styles.planGrid}>
                {PLAN_ORDER.map(key => {
                  const info = catalog[key]
                  const meta = PLAN_META[key]
                  const perMonth = info.monthlyDisplay ?? Math.round(info.amount / info.months)
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`${styles.planCard} ${plan === key ? styles.planActive : ''}`}
                      onClick={() => setPlan(key)}
                    >
                      {key === 'STANDARD' && <span className={styles.planBadge}>Populaire</span>}
                      <span className={styles.planName}>{meta.name}</span>
                      <span className={styles.planPrice}>{fcfa(info.amount)}</span>
                      <span className={styles.planSub}>
                        {info.months} mois · {fcfa(perMonth)}/mois
                      </span>
                      <span className={styles.planTag}>{meta.tagline}</span>
                    </button>
                  )
                })}
              </div>
              <div className={styles.actions}>
                <button
                  className={`btn btn-primary ${styles.btnFull}`}
                  disabled={!supported}
                  onClick={() => setPhase('pay')}
                >
                  Continuer
                </button>
              </div>
            </>
          )}

          {/* ——— ÉTAPE 2 : moyen de paiement ——— */}
          {phase === 'pay' && catalog && (
            <>
              <div className={styles.summaryCard}>
                <div className={styles.summaryRow}>
                  <span>Formule</span>
                  <strong>{PLAN_META[plan].name} · {catalog[plan].months} mois</strong>
                </div>
                <div className={styles.summaryRow}>
                  <span>Total</span><strong>{fcfa(catalog[plan].amount)}</strong>
                </div>
              </div>

              <div className={styles.formGroup} style={{ marginTop: 20 }}>
                <label>Moyen de paiement</label>
                <select value={method} onChange={e => setMethod(e.target.value)}>
                  {methods.map(m => (
                    <option key={m.method} value={m.method}>{m.label}</option>
                  ))}
                </select>
              </div>

              {needsPhone && (
                <div className={styles.formGroup}>
                  <label>
                    Numéro {selectedMethod?.label}
                    {dialingCode && <span className={styles.optLabel}> (indicatif {dialingCode})</span>}
                  </label>
                  <input
                    type="tel"
                    placeholder={dialingCode ? `${dialingCode}771234567` : '+221771234567'}
                    value={phone}
                    className={phone && !phoneValid ? styles.inputError : ''}
                    onChange={e => setPhone(e.target.value.replace(/[^\d+]/g, ''))}
                  />
                  {phone && !phoneMatchesCountry && (
                    <span className={styles.fieldHint}>
                      ⚠ Numéro à l'indicatif {dialingCode} attendu. Depuis l'étranger, choisissez « Carte bancaire ».
                    </span>
                  )}
                </div>
              )}

              {!needsPhone && !isPaypal && (
                <p className={styles.cardNote}>
                  💳 Aucun numéro requis : payez par carte bancaire — pratique depuis l'étranger.
                </p>
              )}

              {isPaypal && (
                <p className={styles.cardNote}>
                  🅿️ Paiement en euros (parité fixe) : <strong>{toEur(catalog[plan].amount)} €</strong>{' '}
                  pour {fcfa(catalog[plan].amount)}. Vous serez redirigé vers PayPal ; aucun numéro requis.
                </p>
              )}

              {isBankTransfer && (
                <p className={styles.cardNote}>
                  🏦 Virement bancaire (SEPA, en euros — parité fixe) :{' '}
                  <strong>{toEur(catalog[plan].amount)} €</strong> pour {fcfa(catalog[plan].amount)}.
                  Vous recevrez notre IBAN et une référence à reporter. L'abonnement est activé
                  après réception des fonds (validation manuelle, sous quelques jours ouvrés).
                </p>
              )}

              <label className={styles.checkRow}>
                <input type="checkbox" checked={autoRenew} onChange={e => setAutoRenew(e.target.checked)} />
                Me le rappeler pour renouveler à l'expiration
              </label>

              <div className={styles.actions}>
                <button className={`btn btn-ghost ${styles.btnBack}`} onClick={() => { setError(''); setPhase('choose') }}>
                  Retour
                </button>
                <button
                  className={`btn btn-primary ${styles.btnFull} ${loading ? 'btn-loading' : ''}`}
                  disabled={loading || !phoneValid}
                  onClick={startSubscription}
                >
                  {!loading && (isBankTransfer
                    ? 'Obtenir les coordonnées de virement'
                    : `Payer ${fcfa(catalog[plan].amount)}`)}
                </button>
              </div>
            </>
          )}

          {/* ——— ÉTAPE 3 : attente de confirmation ——— */}
          {phase === 'awaiting' && (
            <div className={styles.awaiting}>
              <div className={styles.spinner} />
              <h2>{isBankTransfer ? 'Effectuez votre virement' : 'En attente de votre confirmation…'}</h2>

              {bank && (
                <>
                  <div className={styles.summaryCard} style={{ textAlign: 'left', marginTop: 8, width: '100%' }}>
                    <div className={styles.summaryRow}><span>Bénéficiaire</span><strong>{bank.beneficiary}</strong></div>
                    <div className={styles.summaryRow}><span>IBAN</span><strong style={{ fontFamily: 'monospace' }}>{bank.iban}</strong></div>
                    <div className={styles.summaryRow}><span>BIC</span><strong style={{ fontFamily: 'monospace' }}>{bank.bic}</strong></div>
                    <div className={styles.summaryRow}><span>Banque</span><strong>{bank.bankName}</strong></div>
                    <div className={styles.summaryRow}>
                      <span>Montant</span>
                      <strong>{bank.amountEur} € <span style={{ opacity: 0.6 }}>({fcfa(bank.amountFcfa)})</span></strong>
                    </div>
                    <div className={styles.summaryRow}>
                      <span>Référence (motif)</span>
                      <strong style={{ fontFamily: 'monospace' }}>{bank.reference}</strong>
                    </div>
                  </div>
                  <p className={styles.fieldHint} style={{ marginTop: 8 }}>
                    ⚠ Indiquez impérativement la référence <strong>{bank.reference}</strong> en motif du virement,
                    sinon nous ne pourrons pas rattacher votre paiement.
                  </p>
                </>
              )}

              {ussd && <p className={styles.ussd}>{ussd}</p>}
              {payUrl && (
                <p>
                  <a href={payUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
                    {isPaypal ? 'Payer avec PayPal' : isCard ? 'Payer par carte bancaire' : 'Ouvrir la page de paiement'}
                  </a>
                </p>
              )}
              <p className={styles.awaitHint}>
                {isBankTransfer
                  ? 'Nous activons votre abonnement dès réception des fonds (validation manuelle, sous quelques jours ouvrés). Vous pouvez fermer cette page ; l’abonnement s’activera automatiquement.'
                  : isPaypal
                    ? 'Terminez le paiement dans l’onglet PayPal. Cette page se met à jour automatiquement.'
                    : isCard
                      ? 'Réglez sur la page de paiement sécurisée. Cette page se met à jour automatiquement.'
                      : 'Validez la demande sur votre téléphone. Cette page se met à jour automatiquement.'}
              </p>
            </div>
          )}

          {/* ——— SUCCÈS ——— */}
          {phase === 'done' && (
            <div className={styles.awaiting}>
              <div className={styles.successMark}>✓</div>
              <h2>Abonnement activé 🎉</h2>
              <p>Votre formule {PLAN_META[plan].name} est active. La messagerie est débloquée.</p>
              <div className={styles.actions}>
                <button className={`btn btn-primary ${styles.btnFull}`} onClick={() => navigate('/accueil')}>
                  Retour à mon espace
                </button>
              </div>
            </div>
          )}

          {/* ——— ÉCHEC ——— */}
          {phase === 'failed' && (
            <div className={styles.awaiting}>
              <div className={styles.failMark}>✕</div>
              <h2>Paiement non abouti</h2>
              <p>{error || "Le paiement n'a pas pu être confirmé."}</p>
              <div className={styles.actions}>
                <button className={`btn btn-primary ${styles.btnFull}`} onClick={() => { setError(''); setPhase('pay') }}>
                  Réessayer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
