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
 * Les dix images sont servies depuis `/images/`, donc depuis notre propre
 * domaine : elles sont déposées dans `client/public/images/` et recopiées par
 * le build. Aucune dépendance à un hébergeur tiers qui pourrait changer une
 * URL ou couper le service. Voir `client/IMAGES.md` pour les licences, les
 * formats et la marche à suivre pour en ajouter — la règle n'a pas bougé :
 * regarder l'image avant de l'inscrire ici, et vérifier que la légende ne la
 * dément pas.
 */
type Diapositive = {
  src: string
  alt: string
  legende: string
  /**
   * Point de mire de l'image (`object-position`). Le cadre affiche en 4/5 sur
   * ordinateur et en 3/2 sur mobile : une même photo est donc rognée deux
   * fois, différemment. Quand le sujet n'est pas au centre — des mains en bas
   * du cadre, des visages en haut — le rognage automatique le coupe, et sur
   * mobile plus sévèrement encore. Ce champ déplace la fenêtre. À renseigner
   * seulement quand le centrage par défaut abîme la photo.
   */
  cadrage?: string
  /**
   * Mention exigée par certaines licences — « Image : Freepik » pour l'offre
   * gratuite de Freepik, par exemple. L'omettre quand la licence la réclame
   * place le site en infraction. Voir client/IMAGES.md.
   *
   * Unsplash ne l'exige pas ; on l'affiche quand même, parce qu'elle dit au
   * visiteur ce qu'il regarde : une illustration, pas un membre.
   */
  credit?: string
}

const CREDIT_UNSPLASH = 'Image d’illustration · Unsplash'

const DIAPOSITIVES: Diapositive[] = [
  {
    src: '/images/couple-rire-portrait.webp',
    alt: 'Un homme enlace une femme qui rit, devant un mur clair',
    legende: 'Des rencontres qui mènent au mariage',
    cadrage: 'center 35%',
    credit: CREDIT_UNSPLASH,
  },
  {
    src: '/images/maries-voile-coucher-soleil.webp',
    alt: 'Des mariés front contre front, un voile flottant dans la lumière du soir',
    legende: 'Du premier message au grand jour',
    cadrage: 'center 28%',
    credit: CREDIT_UNSPLASH,
  },
  {
    src: '/images/mains-jointes-alliances.webp',
    alt: 'Deux mains jointes sur une table, alliances au doigt, près d’un verre',
    legende: 'Des intentions dites dès le premier échange',
    cadrage: '20% center',
    credit: CREDIT_UNSPLASH,
  },
  {
    src: '/images/couple-complice-foret.webp',
    alt: 'Une femme sur le dos d’un homme, tous deux riant dans un sous-bois',
    legende: 'La complicité avant tout le reste',
    credit: CREDIT_UNSPLASH,
  },
  {
    src: '/images/couple-canape-salon.webp',
    alt: 'Un couple partage un plat, assis dans un canapé',
    legende: 'Bâtir une vie à deux, jour après jour',
    credit: CREDIT_UNSPLASH,
  },
  {
    src: '/images/maries-etreinte-coucher-soleil.webp',
    alt: 'Des mariés enlacés au soleil couchant, un bouquet à la main',
    legende: 'S’engager, pour de bon',
    cadrage: 'center 30%',
    credit: CREDIT_UNSPLASH,
  },
  {
    src: '/images/mains-tenues-arbre.webp',
    alt: 'Deux mains qui se tiennent devant un arbre isolé',
    legende: 'Avancer au même rythme',
    cadrage: 'center 72%',
    credit: CREDIT_UNSPLASH,
  },
  {
    src: '/images/couple-tendresse-soiree.webp',
    alt: 'Un couple s’embrasse dans la pénombre d’une soirée',
    legende: 'Chercher une union, pas une aventure',
    credit: CREDIT_UNSPLASH,
  },
  {
    src: '/images/maries-promenade-palmier.webp',
    alt: 'Des mariés marchent main dans la main devant un palmier',
    legende: 'Fonder un foyer, ici ou ailleurs',
    cadrage: 'center 55%',
    credit: CREDIT_UNSPLASH,
  },
  {
    src: '/images/alliances-dorees.webp',
    alt: 'Deux alliances dorées posées sur une nappe claire',
    legende: 'Une promesse, pas un passe-temps',
    cadrage: '60% center',
    credit: CREDIT_UNSPLASH,
  },
]

const DELAI_MS = 6000

export function HeroSlideshow() {
  const [index, setIndex] = useState(0)
  const [enPause, setEnPause] = useState(false)
  const total = DIAPOSITIVES.length

  // Toutes les diapositives occupent le même emplacement, en haut de page :
  // même invisibles, elles sont DANS la fenêtre du navigateur, et
  // `loading="lazy"` ne diffère alors plus rien. Sans cette fenêtre de
  // montage, l'accueil téléchargerait les dix images d'un coup — plus de
  // 700 Ko sur une connexion mobile, pour neuf images que le visiteur n'a pas
  // encore demandées. On ne monte que celle affichée et ses deux voisines ;
  // les autres arrivent au fil du défilement, et ce qui est monté le reste —
  // revenir en arrière ne doit pas retélécharger.
  const [chargees, setChargees] = useState<Set<number>>(() => new Set([0]))
  useEffect(() => {
    setChargees(prev => {
      const suivant = new Set(prev)
      for (const n of [index - 1, index, index + 1]) suivant.add((n + total) % total)
      return suivant.size === prev.size ? prev : suivant
    })
  }, [index, total])

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
            {chargees.has(i) && (
              <img
                src={d.src}
                alt={d.alt}
                // La première est visible d'emblée : la charger paresseusement
                // laisserait un trou au premier rendu, sur la zone la plus vue
                // de la page.
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
                draggable={false}
                style={d.cadrage ? { objectPosition: d.cadrage } : undefined}
              />
            )}
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
