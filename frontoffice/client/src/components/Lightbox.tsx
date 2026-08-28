import { useCallback, useEffect, useRef } from 'react'
import styles from './Lightbox.module.css'

/**
 * Visionneuse plein écran.
 *
 * Les photos sont partout affichées rognées — la carte en 4/5, la fiche en
 * portrait fixe — parce qu'une grille a besoin de vignettes régulières. Le
 * rognage coupe donc toujours quelque chose. C'est ce que cette vue rend :
 * l'image entière, en `contain` et non en `cover`, sinon on agrandirait le
 * cadrage au lieu de s'en affranchir.
 *
 * Trois exigences qu'une superposition ne doit pas manquer :
 *
 *   — Échap ferme. C'est le premier réflexe, et sans lui la seule sortie
 *     serait un bouton qu'on cherche du regard.
 *   — Le défilement de la page est bloqué pendant l'ouverture, sinon le fond
 *     glisse derrière l'image dès qu'on tourne la molette.
 *   — Le focus revient à son point de départ à la fermeture : au clavier, le
 *     perdre renvoie en haut du document et fait tout reprendre.
 */
export function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
  legende,
}: {
  photos: { id: string; url: string }[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
  /** Texte alternatif — décrit la scène, jamais l'identité. */
  legende: string
}) {
  const total = photos.length
  const fermer = useRef<HTMLButtonElement>(null)
  const origine = useRef<Element | null>(null)

  const aller = useCallback((delta: number) => {
    if (total > 1) onIndex((index + delta + total) % total)
  }, [index, total, onIndex])

  useEffect(() => {
    origine.current = document.activeElement
    fermer.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      if (e.key === 'ArrowRight') { e.preventDefault(); aller(1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); aller(-1) }
    }
    document.addEventListener('keydown', onKey)

    // Blocage du défilement, en mémorisant la valeur d'origine plutôt qu'en
    // posant 'auto' à la fermeture : on ne sait pas ce que la page avait.
    const avant = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = avant
      // Le focus retourne d'où il venait, si l'élément existe encore.
      const el = origine.current as HTMLElement | null
      if (el && document.contains(el)) el.focus?.()
    }
  }, [aller, onClose])

  if (!photos.length) return null

  return (
    <div
      className={styles.fond}
      role="dialog"
      aria-modal="true"
      aria-label="Photo en grand"
      // Le clic sur le fond ferme ; celui sur l'image ne doit pas. D'où le
      // test de cible plutôt qu'un `stopPropagation` posé sur l'image, qui
      // avalerait aussi les clics des flèches.
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <button ref={fermer} type="button" className={styles.fermer} onClick={onClose} aria-label="Fermer">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {total > 1 && (
        <button type="button" className={`${styles.fleche} ${styles.gauche}`} onClick={() => aller(-1)} aria-label="Photo précédente">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}

      <img className={styles.image} src={photos[index].url} alt={legende} />

      {total > 1 && (
        <button type="button" className={`${styles.fleche} ${styles.droite}`} onClick={() => aller(1)} aria-label="Photo suivante">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      )}

      {total > 1 && <div className={styles.compteur}>{index + 1} / {total}</div>}
    </div>
  )
}
