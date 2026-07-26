import { Navigate } from 'react-router-dom'
import { isAuthenticated } from '../api/auth'

/**
 * Garde de route : réserve l'accès aux utilisateurs porteurs d'un token.
 * Sans token, redirige vers la connexion (remplacement d'historique pour que
 * le bouton « retour » ne ramène pas sur la page protégée).
 */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/connexion" replace />
  }
  return <>{children}</>
}
