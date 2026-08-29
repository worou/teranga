import { useEffect, useState } from 'react'
import styles from './InstallerApp.module.css'

/**
 * Invitation à installer l'application.
 *
 * Chrome sait proposer l'installation tout seul, mais le fait discrètement —
 * une icône dans la barre d'adresse que personne ne regarde, et sur Android
 * une bannière qui n'apparaît pas toujours. Ce bouton rend l'offre visible au
 * moment où le navigateur la juge recevable.
 *
 * Il n'apparaît QUE si `beforeinstallprompt` se déclenche, c'est-à-dire quand
 * l'installation est réellement possible : proposer d'installer ce qui l'est
 * déjà, ou ce qui ne peut pas l'être, ne ferait qu'une promesse en l'air.
 * Refuser une fois suffit à ne plus le revoir.
 */

type PromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const REFUS = 'teranga_install_refuse'

export function InstallerApp() {
  const [invite, setInvite] = useState<PromptEvent | null>(null)

  useEffect(() => {
    try {
      if (localStorage.getItem(REFUS)) return
    } catch {
      // Navigation privée, stockage bloqué : on propose quand même.
    }

    const onPrompt = (e: Event) => {
      // Sans cela, Chrome affiche sa propre bannière EN PLUS de ce bouton.
      e.preventDefault()
      setInvite(e as PromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    // Une fois installée, l'offre n'a plus lieu d'être.
    const onInstalled = () => setInvite(null)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!invite) return null

  function refuser() {
    try { localStorage.setItem(REFUS, '1') } catch { /* sans conséquence */ }
    setInvite(null)
  }

  async function installer() {
    const e = invite
    setInvite(null)
    await e?.prompt()
    // Le choix de l'utilisateur ne nous regarde pas : accepté, l'app
    // s'installe ; refusé, le navigateur ne représentera pas l'invite.
    await e?.userChoice.catch(() => undefined)
  }

  return (
    <div className={styles.barre} role="region" aria-label="Installer l’application">
      <div className={styles.texte}>
        <strong>Installer Téranga</strong>
        <span>Accès direct depuis votre écran d’accueil, en plein écran.</span>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.plusTard} onClick={refuser}>Plus tard</button>
        <button type="button" className={styles.installer} onClick={installer}>Installer</button>
      </div>
    </div>
  )
}
