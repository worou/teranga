import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { SUBSCRIPTIONS_ENABLED } from '../config'
import { fetchMe, clearTokens, type MeResponse } from '../api/auth'
import styles from './AuthForms.module.css'

/** Libellés lisibles des formules d'abonnement. */
const PLAN_LABELS: Record<string, string> = {
  FREE: 'Gratuit',
  DISCOVERY: 'Découverte',
  STANDARD: 'Standard',
  ENGAGEMENT: 'Engagement',
}

/**
 * Espace connecté minimal : confirme que l'authentification a abouti, affiche
 * l'utilisateur et son abonnement, et permet de se déconnecter. Sert de point
 * d'atterrissage après connexion / inscription.
 */
export default function Accueil() {
  const navigate = useNavigate()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetchMe()
      .then(data => { if (alive) { setMe(data); setLoading(false) } })
      .catch(err => {
        if (!alive) return
        // Token invalide/expiré : on nettoie et on renvoie vers la connexion.
        clearTokens()
        setError(err instanceof Error ? err.message : 'Session expirée.')
        setLoading(false)
        setTimeout(() => navigate('/connexion', { replace: true }), 1200)
      })
    return () => { alive = false }
  }, [navigate])

  function logout() {
    clearTokens()
    navigate('/connexion', { replace: true })
  }

  const plan = me?.subscription?.plan ?? 'FREE'
  const planLabel = PLAN_LABELS[plan] ?? plan

  // Accès payant actif = abonnement ACTIVE, non-FREE et non expiré
  // (miroir de requireSubscriptionForMessaging côté API).
  const sub = me?.subscription
  const hasPaidAccess = !!(
    sub &&
    sub.plan !== 'FREE' &&
    sub.status === 'ACTIVE' &&
    sub.expiresAt &&
    new Date(sub.expiresAt) > new Date()
  )
  // Chez Téranga, seuls les hommes paient : femmes / non-binaires ont l'accès
  // complet gratuitement. Un homme sans abonnement payant est en accès limité.
  const isMan = me?.gender === 'MALE'
  // Le serveur est seul juge du modèle économique ; SUBSCRIPTIONS_ENABLED n'est
  // qu'un repli tant que /users/me n'a pas répondu.
  const subsOn = me?.subscriptionsEnabled ?? SUBSCRIPTIONS_ENABLED
  const manNeedsSubscription = subsOn && isMan && !hasPaidAccess

  // Inscription non finalisée : sans le minimum de photos, l'API refuse la
  // découverte et la messagerie (403 PHOTOS_REQUIRED).
  const minPhotos = me?.minPhotos ?? 3
  const photosCount = me?.photosCount ?? 0
  const profileIncomplete = !!me && me.profileComplete === false
  const photosMissing = Math.max(minPhotos - photosCount, 0)

  // Libellé de la ligne « Abonnement » selon le cas.
  let planDisplay: string
  if (hasPaidAccess) {
    planDisplay = planLabel
  } else if (isMan) {
    planDisplay = 'Gratuit · accès limité'
  } else {
    planDisplay = 'Accès complet · offert'
  }

  return (
    <div className={styles.page}>
      <AppHeader initial={me?.firstName} />

      <div className={styles.wrap}>
        <div className={styles.panelRight} style={{ maxWidth: 560, margin: '0 auto' }}>
          {loading && <p>Chargement de votre espace…</p>}

          {error && (
            <div className={styles.alertError}>
              <span>⚠</span> {error} Redirection vers la connexion…
            </div>
          )}

          {me && (
            <>
              <div className={styles.formHeader}>
                <div className={styles.stepLabel}>Espace membre</div>
                <h1>Bonjour <em>{me.firstName}</em> 👋</h1>
                <p>Vous êtes bien connecté à votre compte Téranga.</p>
              </div>

              <div className={styles.summaryCard}>
                <div className={styles.summaryRow}>
                  <span>Téléphone</span><strong>{me.phone}</strong>
                </div>
                {me.city && (
                  <div className={styles.summaryRow}>
                    <span>Ville</span><strong>{me.city}</strong>
                  </div>
                )}
                <div className={styles.summaryRow}>
                  <span>Statut du compte</span><strong>{me.status}</strong>
                </div>
                {subsOn && (
                  <div className={styles.summaryRow}>
                    <span>Abonnement</span>
                    <strong>
                      {planDisplay}
                      {hasPaidAccess && me.subscription?.expiresAt &&
                        ` · jusqu'au ${new Date(me.subscription.expiresAt).toLocaleDateString('fr-FR')}`}
                    </strong>
                  </div>
                )}
              </div>

              {/* Inscription à finaliser : priorité sur l'incitation à s'abonner,
                  puisque rien n'est accessible tant que les photos manquent. */}
              {profileIncomplete && (
                <div className={styles.upsell}>
                  <strong>Finalisez votre inscription 📸</strong>
                  <p>
                    Il vous manque {photosMissing} photo{photosMissing > 1 ? 's' : ''} :
                    votre profil doit en compter au moins {minPhotos} pour accéder aux
                    profils et à la messagerie. Elles seront vérifiées avant publication.
                  </p>
                  <Link to="/inscription" className={`btn btn-primary ${styles.btnFull}`}>
                    Ajouter mes photos
                  </Link>
                </div>
              )}

              {/* Rappel + incitation : un homme non abonné a un accès limité. */}
              {!profileIncomplete && manNeedsSubscription && (
                <div className={styles.upsell}>
                  <strong>Débloquez la messagerie 💬</strong>
                  <p>
                    Votre accès est limité (10 profils et 5 likes par jour, messagerie
                    bloquée). Abonnez-vous pour écrire sans limite aux membres.
                  </p>
                  <Link to="/abonnement" className={`btn btn-primary ${styles.btnFull}`}>
                    S'abonner — dès 1 000 F CFA
                  </Link>
                </div>
              )}

              <div className={styles.actions}>
                <Link to="/mon-profil" className={`btn btn-ghost ${styles.btnFull}`}>
                  Modifier mon profil
                </Link>
              </div>

              {/* Le profil complet donne accès à la découverte : on y mène. */}
              {!profileIncomplete && (
                <div className={styles.actions}>
                  <Link to="/decouverte" className={`btn btn-primary ${styles.btnFull}`}>
                    Découvrir des profils
                  </Link>
                </div>
              )}

              <div className={styles.actions}>
                <button className={`btn btn-ghost ${styles.btnFull}`} onClick={logout}>
                  Se déconnecter
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
