import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { TerangaSymbol } from './Logo'
import { isAuthenticated, seDeconnecter } from '../api/auth'
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
 *
 * L'avatar ouvre un menu plutôt que de mener droit au profil. La déconnexion y
 * tient sa place : une sixième icône ne rentrerait pas dans la barre sur un
 * téléphone, et un glyphe de déconnexion collé au bouton le plus utilisé de
 * l'application se toucherait par erreur — or revenir demande un code par
 * e-mail. Un intitulé écrit, dans un menu qu'il faut ouvrir, ne se touche pas
 * par mégarde.
 */
export default function AppHeader({ initial }: { initial?: string }) {
  const { pathname } = useLocation()
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [unread, setUnread] = useState(0)
  const [menuOuvert, setMenuOuvert] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
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

  // Le menu se referme au changement de page : sans cela, il resterait ouvert
  // par-dessus l'écran suivant.
  useEffect(() => { setMenuOuvert(false) }, [pathname])

  useEffect(() => {
    if (!menuOuvert) return
    const auClic = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOuvert(false)
    }
    const auClavier = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOuvert(false) }
    document.addEventListener('pointerdown', auClic)
    document.addEventListener('keydown', auClavier)
    return () => {
      document.removeEventListener('pointerdown', auClic)
      document.removeEventListener('keydown', auClavier)
    }
  }, [menuOuvert])

  async function deconnecter() {
    setMenuOuvert(false)
    await seDeconnecter()
    navigate('/', { replace: true })
  }

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

            {/* Marque-page et non cœur : le cœur sert déjà aux conversations
                dans cette barre, deux glyphes identiques s'y confondraient. */}
            <Link
              to="/favoris"
              className={`${styles.counter} ${pathname === '/favoris' ? styles.active : ''}`}
              aria-label="Mes favoris"
              title="Mes favoris"
            >
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M19 21l-7-4.5L5 21V5a2 2 0 012-2h10a2 2 0 012 2z" strokeLinejoin="round" />
              </svg>
            </Link>

            <Link to="/accueil" className={styles.counter} aria-label="Mes notifications" title="Notifications">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8" strokeLinejoin="round" />
                <path d="M13.7 21a2 2 0 01-3.4 0" strokeLinecap="round" />
              </svg>
              {unread > 0 && <span className={styles.badge}>{unread > 99 ? '99+' : unread}</span>}
            </Link>

            <div className={styles.compte} ref={menuRef}>
              <button
                type="button"
                className={styles.avatar}
                onClick={() => setMenuOuvert(o => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOuvert}
                aria-label="Mon compte"
                title="Mon compte"
              >
                {(initial || '?').slice(0, 1).toUpperCase()}
              </button>

              {menuOuvert && (
                <div className={styles.menu} role="menu">
                  <Link to="/mon-profil" className={styles.menuItem} role="menuitem">
                    Mon profil
                  </Link>
                  <Link to="/accueil" className={styles.menuItem} role="menuitem">
                    Mon espace
                  </Link>
                  <div className={styles.menuSep} />
                  <button
                    type="button"
                    className={`${styles.menuItem} ${styles.menuQuitter}`}
                    role="menuitem"
                    onClick={deconnecter}
                  >
                    Se déconnecter
                  </button>
                </div>
              )}
            </div>
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
