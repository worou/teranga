import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { TerangaSymbol } from './Logo'
import { discoveryApi } from '../api/discovery'
import styles from './AppHeader.module.css'

/**
 * En-tête de l'espace connecté : marque, compteurs et accès au profil.
 *
 * Les compteurs ne sont affichés que s'ils sont réellement alimentés par une
 * route de l'API — matchs (`/matches`) et notifications non lues
 * (`/notifications`). Pas de pastille décorative : un chiffre faux vaut moins
 * que pas de chiffre du tout.
 */
export default function AppHeader({ initial }: { initial?: string }) {
  const { pathname } = useLocation()
  const [matches, setMatches] = useState(0)
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let alive = true
    discoveryApi
      .matches()
      .then(r => { if (alive) setMatches(r.pagination?.total ?? 0) })
      .catch(() => { /* profil incomplet ou session expirée : pas de compteur */ })
    discoveryApi
      .notifications()
      .then(r => { if (alive) setUnread((r.data || []).filter(n => !n.readAt).length) })
      .catch(() => { /* idem */ })
    return () => { alive = false }
  }, [pathname])

  return (
    <header className={styles.header}>
      <Link to="/decouverte" className={styles.logo}>
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

        <Link to="/accueil" className={styles.counter} aria-label="Mes matchs" title="Mes matchs">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M20.8 5.6a5 5 0 00-7.1 0L12 7.3l-1.7-1.7a5 5 0 10-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 000-7.1z" strokeLinejoin="round" />
          </svg>
          {matches > 0 && <span className={styles.badge}>{matches > 99 ? '99+' : matches}</span>}
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
      </nav>
    </header>
  )
}
