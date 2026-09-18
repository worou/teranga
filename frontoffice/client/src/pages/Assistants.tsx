import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { ApiError } from '../api/discovery'
import { clearTokens, fetchMe, type MeResponse } from '../api/auth'
import {
  assistantsApi,
  formatPrix,
  formatDuree,
  formatEcheance,
  GENRE_ASSISTANT,
  type Assistant,
  type Consultation,
} from '../api/assistants'
import styles from './Assistants.module.css'

/**
 * Les assistants : des personnes que l'on paie pour être conseillé.
 *
 * L'échange a lieu par téléphone ou WhatsApp, hors de l'application. Ce que le
 * membre achète est donc, très concrètement, un moyen de joindre quelqu'un —
 * et l'écran doit le dire sans détour, avant la demande. Promettre « un
 * accompagnement » et livrer un numéro décevrait ; annoncer un numéro et une
 * durée, non.
 *
 * Le règlement se fait hors ligne pour l'instant : aucun moyen de paiement
 * n'est encore en service. L'écran ne prétend donc pas encaisser. Il enregistre
 * une demande, et le dit.
 */
export default function Assistants() {
  const navigate = useNavigate()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [genre, setGenre] = useState<'' | 'FEMALE' | 'MALE'>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [demande, setDemande] = useState<Assistant | null>(null)

  useEffect(() => {
    fetchMe()
      .then(setMe)
      .catch(() => { /* l'en-tête se contente de l'initiale */ })
  }, [])

  function recharger() {
    return Promise.all([
      assistantsApi.list(genre || undefined),
      assistantsApi.consultations(),
    ])
      .then(([a, c]) => { setAssistants(a); setConsultations(c); setError('') })
      .catch(err => {
        if (err instanceof ApiError && err.status === 401) {
          clearTokens()
          navigate('/connexion', { replace: true })
          return
        }
        setError(err instanceof Error ? err.message : 'Chargement impossible.')
      })
  }

  useEffect(() => {
    setLoading(true)
    recharger().finally(() => setLoading(false))
    // `recharger` se reconstruit à chaque rendu ; c'est `genre` qui commande.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genre])

  // Les consultations qui donnent accès à un contact, en tête d'écran : c'est
  // ce que le membre vient chercher quand il revient.
  const actives = consultations.filter(c => c.active)
  const enAttente = consultations.filter(c => c.status === 'PENDING')

  return (
    <div className={styles.page}>
      <AppHeader initial={me?.firstName} />

      <div className={styles.wrap}>
        <div className={styles.head}>
          <span className={styles.eyebrow}>ACCOMPAGNEMENT</span>
          <h1 className={styles.title}>Se faire <em>conseiller</em></h1>
          <p className={styles.lead}>
            Une hésitation, un échange qui s'enlise, une rencontre de familles à
            préparer ? Nos assistantes et assistants vous accompagnent, par
            téléphone ou WhatsApp.
          </p>
        </div>

        {error && <div className={styles.alertError}><span>⚠</span> {error}</div>}

        {/* Consultations en cours — les coordonnées ne viennent que d'ici. */}
        {actives.length > 0 && (
          <section className={styles.enCours}>
            <h2 className={styles.sectionTitle}>Vos consultations en cours</h2>
            {actives.map(c => (
              <div key={c.id} className={styles.carteActive}>
                <div className={styles.activeHaut}>
                  <Avatar assistant={c.assistant} taille={48} />
                  <div>
                    <strong>{c.assistant.name}</strong>
                    {c.expiresAt && (
                      <span className={styles.echeance}>
                        Jusqu'au {formatEcheance(c.expiresAt)}
                      </span>
                    )}
                  </div>
                </div>
                <div className={styles.contacts}>
                  {c.contact?.whatsapp && (
                    <a
                      className={styles.contactBtn}
                      href={`https://wa.me/${c.contact.whatsapp.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp · {c.contact.whatsapp}
                    </a>
                  )}
                  {c.contact?.phone && (
                    <a className={styles.contactBtn} href={`tel:${c.contact.phone.replace(/\s/g, '')}`}>
                      Appeler · {c.contact.phone}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Demandes en attente : dire où en est le dossier évite de le redéposer. */}
        {enAttente.length > 0 && (
          <section className={styles.attente}>
            <h2 className={styles.sectionTitle}>En attente de validation</h2>
            {enAttente.map(c => (
              <div key={c.id} className={styles.ligneAttente}>
                <Avatar assistant={c.assistant} taille={36} />
                <div className={styles.ligneTexte}>
                  <strong>{c.assistant.name}</strong>
                  <span>
                    {formatPrix(c.priceFcfa)} · {formatDuree(c.durationDays)} — nous vous
                    contactons pour le règlement.
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.annuler}
                  onClick={() => {
                    assistantsApi.annuler(c.id).then(recharger).catch(() => { /* affiché au rechargement */ })
                  }}
                >
                  Annuler
                </button>
              </div>
            ))}
          </section>
        )}

        <div className={styles.filtres}>
          <span className={styles.filtreLabel}>Je préfère parler à</span>
          <div className={styles.filtreGroupe}>
            {([['', 'Peu importe'], ['FEMALE', 'Une femme'], ['MALE', 'Un homme']] as const).map(
              ([v, l]) => (
                <button
                  key={v}
                  type="button"
                  className={`${styles.filtreBtn} ${genre === v ? styles.filtreOn : ''}`}
                  onClick={() => setGenre(v as '' | 'FEMALE' | 'MALE')}
                >
                  {l}
                </button>
              ),
            )}
          </div>
        </div>

        {loading && <p className={styles.muted}>Chargement…</p>}

        {!loading && !error && assistants.length === 0 && (
          <div className={styles.vide}>
            <h2>Aucun assistant disponible pour l'instant</h2>
            <p>
              Le service ouvre progressivement. En attendant, la découverte et la
              messagerie restent à votre disposition.
            </p>
            <Link to="/decouverte" className="btn btn-primary">Découvrir des profils</Link>
          </div>
        )}

        <div className={styles.grille}>
          {assistants.map(a => (
            <article key={a.id} className={styles.carte}>
              <Avatar assistant={a} taille={64} />
              <h3 className={styles.nom}>{a.name}</h3>
              {a.gender && <span className={styles.genre}>{GENRE_ASSISTANT[a.gender]}</span>}

              {a.specialities.length > 0 && (
                <div className={styles.specialites}>
                  {a.specialities.map(s => <span key={s} className={styles.puce}>{s}</span>)}
                </div>
              )}

              {a.bio && <p className={styles.bio}>{a.bio}</p>}

              <div className={styles.forfait}>
                <strong>{formatPrix(a.priceFcfa)}</strong>
                <span>pour {formatDuree(a.durationDays)}</span>
              </div>

              <button
                type="button"
                className={`btn btn-primary ${styles.demanderBtn}`}
                disabled={!a.isAvailable}
                onClick={() => setDemande(a)}
              >
                {a.isAvailable ? 'Demander une consultation' : 'Indisponible'}
              </button>
            </article>
          ))}
        </div>
      </div>

      {demande && (
        <FenetreDemande
          assistant={demande}
          onFermer={() => setDemande(null)}
          onEnvoye={() => { setDemande(null); recharger() }}
        />
      )}
    </div>
  )
}

function Avatar({ assistant, taille }: { assistant: Assistant; taille: number }) {
  const style = { width: taille, height: taille }
  return assistant.photoUrl ? (
    <img className={styles.avatar} style={style} src={assistant.photoUrl} alt={assistant.name} loading="lazy" />
  ) : (
    <span className={`${styles.avatar} ${styles.avatarVide}`} style={style}>
      {assistant.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

/**
 * Demande de consultation.
 *
 * Le texte dit ce qui va réellement se passer : rien n'est prélevé ici, et
 * c'est une personne qui validera. Annoncer un paiement immédiat alors
 * qu'aucun moyen n'est en service serait la pire des promesses.
 */
function FenetreDemande({
  assistant,
  onFermer,
  onEnvoye,
}: {
  assistant: Assistant
  onFermer: () => void
  onEnvoye: () => void
}) {
  const [note, setNote] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer() }
    document.addEventListener('keydown', auClavier)
    return () => document.removeEventListener('keydown', auClavier)
  }, [onFermer])

  async function envoyer() {
    setEnvoi(true)
    setErreur('')
    try {
      await assistantsApi.demander(assistant.id, note)
      onEnvoye()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Envoi impossible.')
      setEnvoi(false)
    }
  }

  return (
    <div className={styles.fond} onPointerDown={e => { if (e.target === e.currentTarget) onFermer() }}>
      <div className={styles.fenetre} role="dialog" aria-modal="true" aria-label="Demander une consultation">
        <h2 className={styles.fenetreTitre}>Consulter {assistant.name}</h2>

        <div className={styles.recap}>
          <strong>{formatPrix(assistant.priceFcfa)}</strong> pour {formatDuree(assistant.durationDays)}
        </div>

        <p className={styles.fenetreTexte}>
          Rien n'est prélevé maintenant. Votre demande est transmise à notre
          équipe, qui vous contacte pour le règlement. Une fois celui-ci reçu,
          les coordonnées de {assistant.name} vous sont communiquées ici même,
          pour {formatDuree(assistant.durationDays)}.
        </p>

        <label className={styles.champLabel} htmlFor="note-consultation">
          Ce sur quoi vous souhaitez être aidé <span>(facultatif)</span>
        </label>
        <textarea
          id="note-consultation"
          className={styles.champ}
          rows={4}
          maxLength={1000}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Je ne sais pas comment relancer une conversation sans paraître insistant…"
        />

        {erreur && <div className={styles.alertError}><span>⚠</span> {erreur}</div>}

        <div className={styles.fenetreActions}>
          <button type="button" className="btn btn-ghost" onClick={onFermer} disabled={envoi}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary" onClick={envoyer} disabled={envoi}>
            {envoi ? 'Envoi…' : 'Envoyer ma demande'}
          </button>
        </div>
      </div>
    </div>
  )
}
