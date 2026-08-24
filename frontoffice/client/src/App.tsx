import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing'
import Inscription from './pages/Inscription'
import Connexion from './pages/Connexion'
import Accueil from './pages/Accueil'
import Abonnement from './pages/Abonnement'
import Decouverte from './pages/Decouverte'
import Profil from './pages/Profil'
import MonProfil from './pages/MonProfil'
import Messages from './pages/Messages'
import Conversation from './pages/Conversation'
import RequireAuth from './components/RequireAuth'
import { SUBSCRIPTIONS_ENABLED } from './config'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/inscription" element={<Inscription />} />
        <Route path="/connexion" element={<Connexion />} />
        <Route
          path="/accueil"
          element={
            <RequireAuth>
              <Accueil />
            </RequireAuth>
          }
        />
        {/* Publiques : un visiteur parcourt et recherche les profils sans
            compte. Interagir (liker, écrire) reste réservé aux membres, la
            garde étant posée côté API. */}
        <Route path="/decouverte" element={<Decouverte />} />
        <Route
          path="/mon-profil"
          element={
            <RequireAuth>
              <MonProfil />
            </RequireAuth>
          }
        />
        <Route path="/profil/:id" element={<Profil />} />
        {/* Messagerie : réservée aux membres au profil complet. Écrire ne
            suppose aucun accord préalable — le système de match a été retiré. */}
        <Route
          path="/messages"
          element={
            <RequireAuth>
              <Messages />
            </RequireAuth>
          }
        />
        <Route
          path="/messages/:conversationId"
          element={
            <RequireAuth>
              <Conversation />
            </RequireAuth>
          }
        />
        {/* Version 1 : tunnel d'abonnement retiré du routage. La page reste
            en place et redevient accessible en réactivant le drapeau. */}
        {SUBSCRIPTIONS_ENABLED && (
          <Route
            path="/abonnement"
            element={
              <RequireAuth>
                <Abonnement />
              </RequireAuth>
            }
          />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
