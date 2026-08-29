import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { enregistrerServiceWorker } from './pwa'

// Enregistré hors du rendu : le worker n'est utile qu'aux visites suivantes,
// et n'a rien à voir avec l'arbre React.
enregistrerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
