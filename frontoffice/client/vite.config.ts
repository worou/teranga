import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // Photos uploadées, servies par le backend depuis public/uploads.
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../public',
    // `public/` ne contient plus QUE la sortie de build : les photos de membres
    // vivent dans `frontoffice/uploads/`. Les y remettre exposerait de nouveau
    // les fichiers des membres à cet effacement.
    emptyOutDir: true,
  },
})
