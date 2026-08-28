import { useState } from 'react'
import { moderationApi, MOTIFS_SIGNALEMENT, type MotifSignalement } from '../api/moderation'
import styles from './ModerationActions.module.css'

/**
 * Bloquer et signaler, depuis la fiche d'un membre ou depuis la conversation.
 *
 * Deux gestes qu'il ne faut pas confondre, et que l'écran doit distinguer :
 *
 *   BLOQUER agit pour soi, tout de suite. C'est symétrique côté serveur —
 *   chacun disparaît du fil de l'autre et l'écriture est refusée dans les deux
 *   sens — donc c'est aussi une décision qu'on peut regretter. D'où la
 *   confirmation, et la mention que le retour est possible depuis « Mon
 *   profil » : sans elle, le bouton ressemble à une porte qui claque.
 *
 *   SIGNALER ne change rien à ce que voit celui qui signale. Le dire est
 *   important : sans cette phrase, on croit que signaler fait disparaître, on
 *   ne bloque pas, et on continue de subir. L'écran propose donc de faire les
 *   deux d'un même geste.
 *
 * Les deux routes existaient depuis le début côté serveur et n'étaient
 * appelées de nulle part.
 */
export function ModerationActions({
  userId,
  firstName,
  onBlocked,
}: {
  userId: string
  firstName: string
  /** Prévient la page : la personne vient de disparaître, il faut quitter la vue. */
  onBlocked?: () => void
}) {
  const [ouvert, setOuvert] = useState<'aucun' | 'bloquer' | 'signaler'>('aucun')
  const [motif, setMotif] = useState<MotifSignalement>('HARASSMENT')
  const [details, setDetails] = useState('')
  const [bloquerAussi, setBloquerAussi] = useState(true)
  const [busy, setBusy] = useState(false)
  const [erreur, setErreur] = useState('')
  const [fait, setFait] = useState('')

  function fermer() {
    setOuvert('aucun')
    setErreur('')
  }

  async function bloquer() {
    setBusy(true); setErreur('')
    try {
      await moderationApi.bloquer(userId)
      setOuvert('aucun')
      setFait(`${firstName} est bloqué·e. Vous ne vous verrez plus.`)
      onBlocked?.()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Le blocage a échoué.')
    } finally {
      setBusy(false)
    }
  }

  async function signaler() {
    setBusy(true); setErreur('')
    try {
      await moderationApi.signaler(userId, motif, details)
      // L'ordre compte : si le blocage échoue, le signalement est déjà parti —
      // c'est lui qui protège les autres membres, il ne doit pas dépendre du
      // second geste.
      if (bloquerAussi) await moderationApi.bloquer(userId, motif)
      setOuvert('aucun')
      setFait(
        bloquerAussi
          ? `Signalement transmis, et ${firstName} est bloqué·e.`
          : 'Signalement transmis à notre équipe de modération.',
      )
      if (bloquerAussi) onBlocked?.()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Le signalement a échoué.')
    } finally {
      setBusy(false)
    }
  }

  if (fait) return <div className={styles.fait}>✓ {fait}</div>

  return (
    <div className={styles.zone}>
      <div className={styles.liens}>
        <button type="button" className={styles.lien} onClick={() => setOuvert('signaler')}>
          Signaler
        </button>
        <span className={styles.sep}>·</span>
        <button type="button" className={styles.lien} onClick={() => setOuvert('bloquer')}>
          Bloquer
        </button>
      </div>

      {ouvert === 'bloquer' && (
        <div className={styles.panneau} role="dialog" aria-label={`Bloquer ${firstName}`}>
          <p className={styles.titre}>Bloquer {firstName} ?</p>
          <p className={styles.aide}>
            Vous ne verrez plus son profil et elle ou il ne verra plus le vôtre. Aucun
            message ne pourra plus passer, dans un sens comme dans l’autre. Vous pourrez
            revenir sur ce choix depuis <strong>Mon profil</strong>.
          </p>
          {erreur && <p className={styles.erreur}>⚠ {erreur}</p>}
          <div className={styles.boutons}>
            <button type="button" className={styles.annuler} onClick={fermer} disabled={busy}>
              Annuler
            </button>
            <button type="button" className={styles.confirmer} onClick={bloquer} disabled={busy}>
              {busy ? 'En cours…' : 'Bloquer'}
            </button>
          </div>
        </div>
      )}

      {ouvert === 'signaler' && (
        <div className={styles.panneau} role="dialog" aria-label={`Signaler ${firstName}`}>
          <p className={styles.titre}>Signaler {firstName}</p>
          <p className={styles.aide}>
            Votre signalement part à notre équipe de modération. Il reste confidentiel :
            la personne n’en est pas informée.
          </p>

          <label className={styles.champ}>
            <span>Motif</span>
            <select value={motif} onChange={(e) => setMotif(e.target.value as MotifSignalement)}>
              {MOTIFS_SIGNALEMENT.map(([val, libelle]) => (
                <option key={val} value={val}>{libelle}</option>
              ))}
            </select>
          </label>

          <label className={styles.champ}>
            <span>Précisions <em>(facultatif)</em></span>
            <textarea
              rows={3}
              maxLength={1000}
              value={details}
              placeholder="Ce qui s’est passé, en quelques mots."
              onChange={(e) => setDetails(e.target.value)}
            />
          </label>

          {/* Coché par défaut : signaler sans bloquer laisse la personne
              continuer de vous écrire pendant que la modération examine. */}
          <label className={styles.case}>
            <input
              type="checkbox"
              checked={bloquerAussi}
              onChange={(e) => setBloquerAussi(e.target.checked)}
            />
            <span>Bloquer aussi {firstName}</span>
          </label>

          {erreur && <p className={styles.erreur}>⚠ {erreur}</p>}
          <div className={styles.boutons}>
            <button type="button" className={styles.annuler} onClick={fermer} disabled={busy}>
              Annuler
            </button>
            <button type="button" className={styles.confirmer} onClick={signaler} disabled={busy}>
              {busy ? 'Envoi…' : 'Envoyer le signalement'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
