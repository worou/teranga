import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { TerangaSymbol } from './Logo'
import { isAuthenticated } from '../api/auth'
import { discoveryApi } from '../api/discovery'
import { messagesApi } from '../api/messages'
import styles from './AppHeader.module.css'

/**
 * En-tête de l'espace connecté — et des pages publiques de découverte.
 *
 * Deux états : un visiteur non connecté voit une invitation à rejoindre, un
 * membre voit ses compteurs et son profil. Les compteurs ne sont affichés que
 * s'ils sont réellement alimentés par une route de l'API — messages non lus
 * (`/conversations`) et notifications non lues (`/notifications`). Pas de pastille
 * décorative : un chiffre faux vaut moins que pas de chiffre du tout.
 *
 * Les compteurs sont relus à chaque changement de page. C'est ce qui les
 * rattrape après une lecture : ouvrir un fil marque ses messages comme lus
 * côté serveur, la pastille doit suivre au retour.
 *
 * La pastille compte des **messages** non lus, pas des conversations : sur une
 * icône de messagerie, un chiffre annonce du courrier, pas un carnet d'adresses.
 */
export default function AppHeader({ initial }: { initial?: string }) {
  const { pathname } = useLocation()
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [unread, setUnread] = useState(0)
  const signedIn = isAuthenticated()

  useEffect(() => {
    // Inutile d'interroger des routes protégées sans jeton : elles répondraient
    // 401 et le visiteur n'a de toute façon ni conversation ni notification.
    if (!signedIn) { setUnreadMessages(0); setUnread(0); return }
    let alive = true
    messagesApi
      .unreadCount()
      .then(n => { if (alive) setUnreadMessages(n) })
      .catch(() => { /* profil incomplet ou session expirée : pas de compteur */ })
    discoveryApi
      .notifications()
      .then(r => { if (alive) setUnread((r.data || []).filter(n => !n.readAt).length) })
      .catch(() => { /* idem */ })
    return () => { alive = false }
  }, [pathname, signedIn])

  return (
    <header className={styles.header}>
      <Link to={signedIn ? '/decouverte' : '/'} className={styles.logo}>
        <TerangaSymbol size={32} />
        <span className={styles.logoText}>Tér<em>anga</em></span>
      </Link>

      <nav className={styles.actions}>
        <Link
          to="/decouverte"
          className={`${styles.counter} ${pathname === '/decouverte' ? styles.active : ''}`}
          aria-label="Découvrir des profils"
          title="Découvrir"
        >
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
        </Link>

        {signedIn ? (
          <>
            {/* Le cœur menait à l'espace membre faute de messagerie ; il mène
                désormais aux conversations. */}
            <Link
              to="/messages"
              className={`${styles.counter} ${pathname.startsWith('/messages') ? styles.active : ''}`}
              aria-label="Mes conversations"
              title="Mes conversations"
            >
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 11.5a8.4 8.4 0 01-9 8.4 9 9 0 01-3.8-.8L3 20.5l1.4-4.2A8.4 8.4 0 013 11.5a8.4 8.4 0 019-8.4 8.4 8.4 0 019 8.4z" strokeLinejoin="round" />
              </svg>
              {unreadMessages > 0 && (
                <span className={styles.badge}>{unreadMessages > 99 ? '99+' : unreadMessages}</span>
              )}
            </Link>

            <Link to="/accueil" className={styles.counter} aria-label="Mes notifications" title="Notifications">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8" strokeLinejoin="round" />
                <path d="M13.7 21a2 2 0 01-3.4 0" strokeLinecap="round" />
              </svg>
              {unread > 0 && <span className={styles.badge}>{unread > 99 ? '99+' : unread}</span>}
            </Link>

            <Link to="/mon-profil" className={styles.avatar} aria-label="Mon profil" title="Mon profil">
              {(initial || '?').slice(0, 1).toUpperCase()}
            </Link>
          </>
        ) : (
          <div className={styles.guest}>
            <Link to="/connexion" className={styles.guestLink}>Se connecter</Link>
            <Link to="/inscription" className={`btn btn-primary ${styles.guestCta}`}>
              Créer mon compte
            </Link>
          </div>
        )}
      </nav>
    </header>
  )
}
