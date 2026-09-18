import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { fetchMe, isAuthenticated, type MeResponse } from '../api/auth'
import styles from './Conseils.module.css'

/**
 * Conseils généraux — page publique.
 *
 * Accessible sans compte, et c'est le point : quelqu'un qui hésite encore à
 * s'inscrire doit pouvoir lire ce que nous avons à dire. C'est aussi la porte
 * d'entrée de l'accompagnement payant, qui n'était jusqu'ici atteignable que
 * par un menu qu'il fallait deviner.
 *
 * Le contenu vient de la documentation, catégorie `conseils`. Il s'écrit depuis
 * le backoffice, comme le reste.
 *
 * ⚠️ Ces textes ne sont PAS donnés au chatbot. Ils sont écrits pour être lus
 * par des humains : sur un site matrimonial, une question de conseil amène tôt
 * ou tard un conjoint violent, une pression familiale, une histoire d'argent.
 * Un automate qui répondrait à cela depuis une fiche serait au mieux inutile.
 * Le chatbot continue de renvoyer ces situations vers un assistant.
 */

interface Article {
  id: string
  titre: string
  contenu: string
}

/** Le gras de la documentation (`**mot**`) devient du gras. Rien de plus. */
function enRichesse(texte: string) {
  return texte.split('\n').map((ligne, i) => (
    <p key={i} className={ligne.trim() ? styles.para : styles.espace}>
      {ligne.split(/(\*\*[^*]+\*\*)/g).map((bout, j) =>
        bout.startsWith('**') && bout.endsWith('**')
          ? <strong key={j}>{bout.slice(2, -2)}</strong>
          : bout,
      )}
    </p>
  ))
}

export default function Conseils() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    // Le profil n'est lu que pour l'initiale de l'en-tête : la page vaut aussi
    // pour un visiteur, qui n'en a pas.
    if (isAuthenticated()) {
      fetchMe().then(setMe).catch(() => { /* sans conséquence ici */ })
    }

    fetch('/api/v1/aide/documentation?categorie=conseils')
      .then(r => r.json())
      .then(d => setArticles(d.data || []))
      .catch(() => setErreur('Les conseils sont momentanément indisponibles.'))
      .finally(() => setLoading(false))
  }, [])

  const connecte = isAuthenticated()

  return (
    <div className={styles.page}>
      <AppHeader initial={me?.firstName} />

      <div className={styles.wrap}>
        <div className={styles.head}>
          <span className={styles.eyebrow}>CONSEILS</span>
          <h1 className={styles.title}>Bien <em>commencer</em></h1>
          <p className={styles.lead}>
            Ce que nous avons appris en accompagnant des centaines de rencontres.
            Libre d’accès, pour tout le monde.
          </p>
        </div>

        {erreur && <div className={styles.alertError}><span>⚠</span> {erreur}</div>}
        {loading && <p className={styles.muted}>Chargement…</p>}

        {!loading && !erreur && articles.length === 0 && (
          <div className={styles.vide}>
            <h2>Les premiers conseils arrivent</h2>
            <p>Cette page se remplit peu à peu. Revenez bientôt.</p>
          </div>
        )}

        <div className={styles.articles}>
          {articles.map(a => (
            <article key={a.id} className={styles.article} id={a.id}>
              <h2 className={styles.articleTitre}>{a.titre}</h2>
              <div className={styles.articleCorps}>{enRichesse(a.contenu)}</div>
            </article>
          ))}
        </div>

        {/* L'accompagnement payant, en bas : on donne d'abord, on propose ensuite. */}
        <aside className={styles.offre}>
          <strong>Besoin d’un accompagnement personnalisé ?</strong>
          <p>
            Ces conseils valent pour tout le monde. Votre situation, elle, n’appartient
            qu’à vous. Nos assistantes et assistants vous accompagnent par téléphone ou
            WhatsApp, à la semaine ou au mois.
          </p>
          {connecte ? (
            <Link to="/assistants" className="btn btn-primary">Voir les assistants</Link>
          ) : (
            <>
              <Link to="/inscription" className="btn btn-primary">Créer mon compte</Link>
              <span className={styles.note}>
                L’accompagnement personnalisé demande un compte.
              </span>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
