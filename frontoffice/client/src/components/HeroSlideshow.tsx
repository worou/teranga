import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './HeroSlideshow.module.css'

/**
 * Diaporama de la bannière d'accueil.
 *
 * ⚠️ CE QUE CES IMAGES NE DOIVENT PAS DIRE
 *
 * Ce sont des photographies d'illustration, pas des membres de Téranga. Elles
 * évoquent ce que l'application permet d'espérer — un mariage, une famille —
 * sans jamais prétendre montrer QUI que ce soit.
 *
 * Aucune diapositive ne porte donc de nom, de ville, de date ni de citation :
 * le moment où une légende désigne une personne, l'illustration devient un
 * témoignage, et un témoignage inventé sur un site de rencontres sérieuses
 * est un mensonge — d'autant plus grave sur un marché où l'arnaque
 * sentimentale est une inquiétude réelle. Le texte affiché parle du service,
 * jamais des gens photographiés.
 *
 * Pour remplacer par vos propres photographies : les déposer dans
 * `client/public/images/` puis modifier `DIAPOSITIVES` ci-dessous — le chemin
 * devient alors `/images/mon-fichier.jpg`, servi depuis le même domaine, sans
 * dépendre d'un hébergeur tiers. Voir `client/IMAGES.md` pour les
 * licences et les formats. Chaque entrée a besoin d'une URL, d'un texte
 * alternatif décrivant la scène (pas les personnes) et d'une légende parlant
 * du service.
 *
 * Il n'y a que DEUX diapositives, et c'est délibéré : ce sont les seules
 * images du site dont le contenu a été vérifié à l'œil. Les autres montraient
 * une foule dans une salle et deux portraits de femme seule — rien qui
 * évoque un mariage ou une famille. Mieux vaut deux images justes que cinq
 * dont trois démentent la phrase qui les accompagne. En ajouter demande
 * simplement d'en regarder une avant de l'inscrire ici.
 */
type Diapositive = {
  src: string
  alt: string
  legende: string
  /**
   * Mention exigée par certaines licences — « Image : Freepik » pour l'offre
   * gratuite de Freepik, par exemple. L'omettre quand la licence la réclame
   * place le site en infraction. Voir client/IMAGES.md.
   */
  credit?: string
}

const DIAPOSITIVES: Diapositive[] = [
  {
    src: 'https://images.unsplash.com/photo-1591604466107-ec97de577aff?w=1000&q=80&auto=format&fit=crop',
    alt: 'Des mariés au bord d’un lac, le jour de leur union',
    legende: 'Des rencontres qui mènent au mariage',
    credit: 'Image d’illustration · Unsplash',
  },
  {
    src: 'https://images.unsplash.com/photo-1529636798458-92182e662485?w=1000&q=80&auto=format&fit=crop',
    alt: 'Une arche de cérémonie ornée de fleurs',
    legende: 'Du premier message au grand jour',
    credit: 'Image d’illustration · Unsplash',
  },
]

const DELAI_MS = 6000

export function HeroSlideshow() {
  const [index, setIndex] = useState(0)
  const [enPause, setEnPause] = useState(false)
  const total = DIAPOSITIVES.length

  // Un diaporama qui avance seul est une gêne pour qui souffre de troubles
  // vestibulaires ou de déficit d'attention. Le système le signale ; on obéit.
  const mouvementReduit = useRef(false)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    mouvementReduit.current = mq.matches
    const onChange = () => { mouvementReduit.current = mq.matches }
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  const aller = useCallback((n: number) => setIndex((n + total) % total), [total])
  const suivant = useCallback(() => aller(index + 1), [aller, index])
  const precedent = useCallback(() => aller(index - 1), [aller, index])

  useEffect(() => {
    if (enPause || mouvementReduit.current) return
    const id = setTimeout(suivant, DELAI_MS)
    return () => clearTimeout(id)
  }, [index, enPause, suivant])

  return (
    <div
      className={styles.cadre}
      role="region"
      aria-roledescription="carrousel"
      aria-label="Téranga en images"
      onMouseEnter={() => setEnPause(true)}
      onMouseLeave={() => setEnPause(false)}
      onFocusCapture={() => setEnPause(true)}
      onBlurCapture={() => setEnPause(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); suivant() }
        if (e.key === 'ArrowLeft') { e.preventDefault(); precedent() }
      }}
    >
      <div className={styles.scene}>
        {DIAPOSITIVES.map((d, i) => (
          <figure
            key={d.src}
            className={`${styles.diapo} ${i === index ? styles.active : ''}`}
            aria-hidden={i !== index}
          >
            <img
              src={d.src}
              alt={d.alt}
              // La première est visible d'emblée : la charger paresseusement
              // laisserait un trou au premier rendu, sur la zone la plus vue
              // de la page.
              loading={i === 0 ? 'eager' : 'lazy'}
              draggable={false}
            />
          </figure>
        ))}

        <div className={styles.voile} aria-hidden="true" />

        <p className={styles.legende} key={index}>
          {DIAPOSITIVES[index].legende}
        </p>
        {DIAPOSITIVES[index].credit && (
          <span className={styles.credit}>{DIAPOSITIVES[index].credit}</span>
        )}

        <button
          type="button"
          className={`${styles.fleche} ${styles.gauche}`}
          onClick={precedent}
          aria-label="Image précédente"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          className={`${styles.fleche} ${styles.droite}`}
          onClick={suivant}
          aria-label="Image suivante"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <div className={styles.pastilles} role="tablist" aria-label="Choisir une image">
        {DIAPOSITIVES.map((d, i) => (
          <button
            key={d.src}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Image ${i + 1} sur ${total}`}
            className={`${styles.pastille} ${i === index ? styles.pastilleActive : ''}`}
            onClick={() => aller(i)}
          />
        ))}
      </div>
    </div>
  )
}
