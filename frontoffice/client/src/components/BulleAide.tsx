import { useEffect, useRef, useState } from 'react'
import styles from './BulleAide.module.css'

/**
 * Assistance automatique — la bulle en bas à droite.
 *
 * Ouverte à tout le monde, visiteurs compris : quelqu'un qui hésite à
 * s'inscrire doit pouvoir demander comment le site marche, et une aide
 * réservée aux membres ne sert pas ceux qui en ont le plus besoin.
 *
 * L'échange n'est PAS conservé. Rechargez la page, il a disparu. C'est
 * délibéré : ce n'est pas une messagerie, et les questions qu'on pose ici
 * (« comment supprimer mon compte », « il me demande de l'argent ») sont
 * parfois les plus embarrassantes du site. Elles n'ont pas à attendre dans un
 * coin d'écran que quelqu'un d'autre prenne le téléphone.
 *
 * Les réponses viennent de la documentation du site — pas d'un conseiller. Le
 * conseil personnel est une prestation payante assurée par des personnes, et
 * l'écran le dit plutôt que de le laisser croire.
 */

interface Echange {
  role: 'moi' | 'aide'
  texte: string
}

const SUGGESTIONS = [
  'Combien de photos faut-il ?',
  'Comment me connecter sans mot de passe ?',
  'Est-ce que c’est payant ?',
  'Quelqu’un me demande de l’argent',
]

export default function BulleAide() {
  const [ouvert, setOuvert] = useState(false)
  const [echanges, setEchanges] = useState<Echange[]>([])
  const [question, setQuestion] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const filRef = useRef<HTMLDivElement>(null)
  const champRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!ouvert) return
    const auClavier = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false) }
    document.addEventListener('keydown', auClavier)
    champRef.current?.focus()
    return () => document.removeEventListener('keydown', auClavier)
  }, [ouvert])

  // Le fil suit toujours le bas : la réponse qu'on attend est la dernière.
  useEffect(() => {
    const el = filRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [echanges, envoi])

  async function demander(texte: string) {
    const propre = texte.trim()
    if (!propre || envoi) return

    setEchanges(e => [...e, { role: 'moi', texte: propre }])
    setQuestion('')
    setEnvoi(true)

    try {
      const res = await fetch('/api/v1/aide/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: propre }),
      })
      const data = await res.json().catch(() => ({}))

      // 429 compris : le serveur met sa raison dans `message`, et la lire vaut
      // mieux qu'afficher « une erreur est survenue ».
      const reponse = res.ok
        ? String(data.reponse || '').trim()
        : String(data.message || 'Réessayez dans un instant.')

      setEchanges(e => [...e, { role: 'aide', texte: reponse || 'Je n’ai pas de réponse à cela.' }])
    } catch {
      setEchanges(e => [
        ...e,
        { role: 'aide', texte: 'Connexion interrompue. Vérifiez votre réseau et réessayez.' },
      ])
    } finally {
      setEnvoi(false)
      champRef.current?.focus()
    }
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        className={styles.bulle}
        onClick={() => setOuvert(true)}
        aria-label="Poser une question"
        title="Besoin d’aide ?"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M21 11.5a8.4 8.4 0 01-9 8.4 9 9 0 01-3.8-.8L3 20.5l1.4-4.2A8.4 8.4 0 013 11.5a8.4 8.4 0 019-8.4 8.4 8.4 0 019 8.4z" strokeLinejoin="round" />
          <path d="M9.6 9.4a2.5 2.5 0 014.7 1.1c0 1.7-2.4 2-2.4 3.5" strokeLinecap="round" />
          <circle cx="12" cy="16.6" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      </button>
    )
  }

  return (
    <div className={styles.panneau} role="dialog" aria-label="Assistance">
      <header className={styles.entete}>
        <div>
          <strong>Une question ?</strong>
          <span>Réponses tirées de l’aide du site</span>
        </div>
        <button
          type="button"
          className={styles.fermer}
          onClick={() => setOuvert(false)}
          aria-label="Fermer l’assistance"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className={styles.fil} ref={filRef}>
        {echanges.length === 0 && (
          <>
            <div className={`${styles.bullebulle} ${styles.deLAide}`}>
              Bonjour. Je réponds aux questions sur le fonctionnement de Téranga —
              inscription, photos, messagerie, sécurité, compte.
              <br /><br />
              Pour un conseil personnel sur une relation, nos assistants vous
              accompagnent : menu de votre avatar, « Se faire conseiller ».
            </div>
            <div className={styles.suggestions}>
              {SUGGESTIONS.map(s => (
                <button key={s} type="button" className={styles.suggestion} onClick={() => demander(s)}>
                  {s}
                </button>
              ))}
            </div>
          </>
        )}

        {echanges.map((e, i) => (
          <div
            key={i}
            className={`${styles.bullebulle} ${e.role === 'moi' ? styles.deMoi : styles.deLAide}`}
          >
            {e.texte}
          </div>
        ))}

        {envoi && <div className={`${styles.bullebulle} ${styles.deLAide} ${styles.attente}`}>…</div>}
      </div>

      <form
        className={styles.saisie}
        onSubmit={e => { e.preventDefault(); demander(question) }}
      >
        <input
          ref={champRef}
          type="text"
          value={question}
          maxLength={500}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Votre question…"
          aria-label="Votre question"
        />
        <button type="submit" disabled={envoi || !question.trim()} aria-label="Envoyer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M4 12l16-8-6 16-2.5-6.5L4 12z" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </div>
  )
}
