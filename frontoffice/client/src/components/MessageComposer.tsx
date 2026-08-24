import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearTokens } from '../api/auth'
import { ApiError } from '../api/discovery'
import { MAX_MESSAGE_LENGTH, type Message } from '../api/messages'
import styles from './MessageComposer.module.css'

/**
 * Saisie et envoi d'un message.
 *
 * Partagée entre le fil de conversation et la boîte posée sous une fiche de
 * membre. Le regroupement n'est pas qu'une économie de lignes : le 403
 * recouvre plusieurs refus distincts — blocage, abonnement requis, message
 * arrêté par l'IA anti-brouteur — et le texte du serveur porte la consigne de
 * sécurité. Deux copies de ce traitement, c'est la garantie qu'une correction
 * n'en touche qu'une, dans le seul chemin où se tromper fait passer un message
 * frauduleux pour un message envoyé.
 *
 * L'appel part en revanche par deux routes différentes selon l'écran — dans une
 * conversation connue, ou vers un membre dont la conversation reste à ouvrir —
 * d'où `send` fourni par l'appelant plutôt qu'un identifiant.
 */
export default function MessageComposer({
  send: sendMessage,
  placeholder,
  onSent,
  autoFocus = false,
}: {
  /** Route d'envoi, choisie par l'écran appelant. */
  send: (content: string) => Promise<Message>
  placeholder: string
  /** Appelé avec le message tel que le serveur l'a enregistré. */
  onSent: (message: Message) => void
  autoFocus?: boolean
}) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [refusal, setRefusal] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)

  async function send() {
    const content = draft.trim()
    if (!content || sending) return

    setSending(true)
    setRefusal('')
    try {
      const message = await sendMessage(content)
      // Aucune bulle optimiste : un message refusé par l'IA anti-brouteur est
      // enregistré côté serveur mais jamais rendu, y compris à son auteur.
      // L'afficher avant la réponse ferait croire à un envoi qui n'a pas eu lieu.
      onSent(message)
      setDraft('')
      if (input.current) input.current.style.height = 'auto'
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens()
        navigate('/connexion', { replace: true })
        return
      }
      // Le message du serveur, mot pour mot — et la saisie conservée : son
      // auteur doit pouvoir la corriger.
      setRefusal(err instanceof Error ? err.message : "L'envoi a échoué.")
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function onInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(e.target.value)
    grow(e.target)
  }

  const remaining = MAX_MESSAGE_LENGTH - draft.length

  return (
    <>
      {refusal && (
        <div className={styles.blocked}>
          <span className={styles.blockedIcon}>⚠</span>
          <span>{refusal}</span>
        </div>
      )}

      {remaining < 200 && (
        <div className={styles.counter}>{remaining} caractères restants</div>
      )}

      <div className={styles.composer}>
        <textarea
          ref={input}
          className={styles.input}
          rows={1}
          value={draft}
          onChange={onInput}
          onKeyDown={onKeyDown}
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={sending}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-label="Votre message"
        />
        <button
          className={styles.send}
          onClick={send}
          disabled={sending || draft.trim().length === 0}
          aria-label="Envoyer"
          title="Envoyer (Entrée)"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </>
  )
}

/**
 * Ajuste la hauteur du champ à son contenu, jusqu'au plafond posé en CSS.
 *
 * `scrollHeight` mesure le contenu et les marges intérieures, mais la boîte
 * est en `border-box` : lui affecter cette valeur telle quelle rogne les
 * bordures et fait apparaître une barre de défilement sur une seule ligne de
 * texte. D'où le rattrapage par `offsetHeight - clientHeight`.
 */
function grow(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`
}
