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
import Assistants from './pages/Assistants'
import BulleAide from './components/BulleAide'
import Conseils from './pages/Conseils'
import RequireAuth from './components/RequireAuth'
import { SUBSCRIPTIONS_ENABLED } from './config'
import Favoris from './pages/Favoris'
import { InstallerApp } from './components/InstallerApp'

export default function App() {
  return (
    <BrowserRouter>
      {/* Hors des routes : l'invitation vaut sur toutes les pages, et elle ne
          s'affiche de toute façon que si le navigateur juge l'installation
          possible. */}
      <InstallerApp />
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
        {/* Mes favoris : réservé aux membres — la liste est celle de MES likes. */}
        <Route
          path="/favoris"
          element={
            <RequireAuth>
              <Favoris />
            </RequireAuth>
          }
        />
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
        {/* Conseils generaux : PUBLIC, sans RequireAuth. Quelqu'un qui hesite
            a s'inscrire doit pouvoir lire ce qu'on a a dire — c'est aussi la
            porte d'entree de l'accompagnement payant. */}
        <Route path="/conseils" element={<Conseils />} />

        {/* Assistants : conseil payant. Pas de `requireCompleteProfile` —
            quelqu'un dont le profil coince est justement celui qui a besoin
            d'aide, l'écarter d'ici serait fermer la porte au bon moment. */}
        <Route
          path="/assistants"
          element={
            <RequireAuth>
              <Assistants />
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

      {/* Hors des routes, comme l'invitation à installer : l'aide vaut sur
          toutes les pages, y compris publiques. Quelqu'un qui hésite à
          s'inscrire est précisément celui qui a des questions. */}
      <BulleAide />
    </BrowserRouter>
  )
}
