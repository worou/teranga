import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { fetchMe, type MeResponse } from '../api/auth'
import { discoveryApi, COUNTRY_LABELS, type Profile } from '../api/discovery'
import styles from './Favoris.module.css'

/**
 * Mes favoris — les profils que j'ai aimés.
 *
 * Le ♥ n'avait aucune destination : il enregistrait une ligne que personne ne
 * pouvait relire, et le fil masquait même le profil aimé. C'est cette page qui
 * lui donne un sens — retrouver, et non perdre, la personne qui intéresse.
 *
 * Présentée en lignes plutôt qu'en cartes, comme la liste des personnes
 * bloquées : on vient ici pour retrouver quelqu'un ou faire le ménage, pas
 * pour découvrir. Le retrait est donc à portée de main, et il est immédiat —
 * aucun « Enregistrer » à chercher.
 */
export default function Favoris() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [profils, setProfils] = useState<Profile[] | null>(null)
  const [total, setTotal] = useState(0)
  const [erreur, setErreur] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const charger = useCallback(() => {
    discoveryApi
      .favorites(1, 50)
      .then(r => { setProfils(r.data); setTotal(r.pagination.total) })
      .catch(e => setErreur(e instanceof Error ? e.message : 'Chargement impossible.'))
  }, [])

  useEffect(() => {
    fetchMe().then(setMe).catch(() => { /* l'en-tête sait se passer du prénom */ })
    charger()
  }, [charger])

  async function retirer(id: string) {
    setBusy(id)
    try {
      await discoveryApi.unlike(id)
      setProfils(prev => (prev ?? []).filter(p => p.id !== id))
      setTotal(n => Math.max(0, n - 1))
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Le retrait a échoué.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={styles.page}>
      <AppHeader initial={me?.firstName} />

      <div className={styles.wrap}>
        <header className={styles.head}>
          <h1>Mes <em>favoris</em></h1>
          <p>
            {total > 0
              ? `${total} profil${total > 1 ? 's' : ''} que vous avez aimé${total > 1 ? 's' : ''}.`
              : 'Les profils que vous aimez se retrouvent ici.'}
          </p>
        </header>

        {erreur && <div className={styles.erreur}>⚠ {erreur}</div>}

        {profils === null ? (
          <p className={styles.muted}>Chargement…</p>
        ) : profils.length === 0 ? (
          <div className={styles.vide}>
            <p>Vous n’avez pas encore de favori.</p>
            <p className={styles.videAide}>
              Sur un profil qui vous intéresse, touchez le cœur : vous le retrouverez ici.
            </p>
            <Link to="/decouverte" className="btn btn-primary">Découvrir des profils</Link>
          </div>
        ) : (
          <ul className={styles.liste}>
            {profils.map(p => {
              const lieu = [p.city, p.country && COUNTRY_LABELS[p.country]].filter(Boolean).join(' · ')
              return (
                <li key={p.id} className={styles.ligne}>
                  <Link to={`/profil/${p.id}`} className={styles.vignette}>
                    {p.photos?.length
                      ? <img src={p.photos[0].url} alt="" />
                      : <span className={styles.vignetteVide}>{p.firstName.slice(0, 1)}</span>}
                  </Link>

                  <div className={styles.infos}>
                    <Link to={`/profil/${p.id}`} className={styles.nom}>
                      {p.firstName}
                      {p.age ? <span className={styles.age}>{p.age} ans</span> : null}
                    </Link>
                    {lieu && <div className={styles.lieu}>{lieu}</div>}
                    {p.profession && <div className={styles.metier}>{p.profession}</div>}
                  </div>

                  <button
                    type="button"
                    className={styles.retirer}
                    disabled={busy === p.id}
                    onClick={() => retirer(p.id)}
                    title="Retirer de mes favoris"
                  >
                    {busy === p.id ? 'En cours…' : 'Retirer'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
