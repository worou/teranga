import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import AppHeader from './AppHeader'
import { fetchMe, isAuthenticated, type MeResponse } from '../api/auth'
import styles from '../pages/Legal.module.css'

/**
 * Coquille commune aux trois documents légaux — mentions légales, CGU,
 * politique de confidentialité.
 *
 * Publique, sans `RequireAuth`, et ce n'est pas un détail : ces textes doivent
 * être consultables AVANT de créer un compte. Une politique de confidentialité
 * qu'il faut accepter pour pouvoir la lire ne vaut pas consentement éclairé.
 *
 * Le contenu est écrit en dur, pas tiré de la documentation comme les conseils.
 * Un texte opposable ne doit pas pouvoir changer depuis le backoffice sans
 * trace : la version et la date affichées en tête sont ce à quoi un membre —
 * ou un juge — se réfère.
 */

export interface SectionLegale {
  /** Ancre de l'URL et cible du sommaire. Stable : elle peut être citée. */
  id: string
  titre: string
  corps: ReactNode
}

export default function PageLegale({
  eyebrow,
  titre,
  titreAccent,
  chapo,
  version,
  sections,
}: {
  eyebrow: string
  titre: string
  titreAccent: string
  chapo: string
  version: string
  sections: SectionLegale[]
}) {
  const [me, setMe] = useState<MeResponse | null>(null)
  const { hash } = useLocation()

  /**
   * Défilement vers l'ancre. Le navigateur ne s'en charge que sur un
   * chargement complet ; en navigation côté client — depuis le pied de page,
   * par exemple — react-router change l'URL sans rien déplacer, et le lien
   * « /confidentialite#droits » atterrissait en haut du document. Sur une page
   * de treize sections, cela revenait à ne pas avoir d'ancre du tout.
   */
  useEffect(() => {
    if (!hash) return
    const cible = document.getElementById(hash.slice(1))
    // `scroll-margin-top` sur .section dégage l'en-tête fixe.
    cible?.scrollIntoView({ behavior: 'smooth' })
  }, [hash])

  useEffect(() => {
    // Lu pour la seule initiale de l'en-tête : la page vaut aussi pour un
    // visiteur, qui n'a pas de profil.
    if (isAuthenticated()) {
      fetchMe().then(setMe).catch(() => { /* sans conséquence ici */ })
    }
  }, [])

  return (
    <div className={styles.page}>
      <AppHeader initial={me?.firstName} />

      <div className={styles.wrap}>
        <div className={styles.head}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h1 className={styles.title}>{titre} <em>{titreAccent}</em></h1>
          <p className={styles.lead}>{chapo}</p>
          <p className={styles.version}>{version}</p>
        </div>

        <nav className={styles.sommaire} aria-label="Sommaire">
          <h2>Sommaire</h2>
          <ol>
            {sections.map(s => (
              <li key={s.id}><a href={`#${s.id}`}>{s.titre}</a></li>
            ))}
          </ol>
        </nav>

        <div className={styles.sections}>
          {sections.map(s => (
            <section key={s.id} id={s.id} className={styles.section}>
              <h2 className={styles.sectionTitre}>{s.titre}</h2>
              <div className={styles.corps}>{s.corps}</div>
            </section>
          ))}
        </div>

        <div className={styles.pied}>
          <Link to="/mentions-legales">Mentions légales</Link>
          <Link to="/conditions-generales">Conditions générales d’utilisation</Link>
          <Link to="/confidentialite">Politique de confidentialité</Link>
        </div>
      </div>
    </div>
  )
}
