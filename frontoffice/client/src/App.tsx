import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing'
import Inscription from './pages/Inscription'
import Connexion from './pages/Connexion'
import Accueil from './pages/Accueil'
import Abonnement from './pages/Abonnement'
import Decouverte from './pages/Decouverte'
import Profil from './pages/Profil'
import RequireAuth from './components/RequireAuth'

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
        <Route
          path="/decouverte"
          element={
            <RequireAuth>
              <Decouverte />
            </RequireAuth>
          }
        />
        <Route
          path="/profil/:id"
          element={
            <RequireAuth>
              <Profil />
            </RequireAuth>
          }
        />
        <Route
          path="/abonnement"
          element={
            <RequireAuth>
              <Abonnement />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
