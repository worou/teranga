/**
 * Enregistrement du service worker.
 *
 * En développement, on ne l'enregistre PAS : un worker qui met en cache la
 * coquille pendant qu'on travaille sert des versions périmées à chaque
 * rechargement, et l'on cherche longtemps pourquoi une modification « ne prend
 * pas ». Il n'a d'intérêt qu'en production, où les fichiers sont versionnés.
 *
 * L'enregistrement attend `load` : le worker n'est utile qu'aux visites
 * suivantes, le lancer pendant le premier rendu ne ferait que disputer la
 * bande passante aux fichiers dont la page a besoin tout de suite.
 */
export function enregistrerServiceWorker() {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Un échec d'enregistrement ne doit rien casser : le site fonctionne
      // exactement pareil sans worker, il n'est simplement pas installable.
    });
  });
}

/**
 * Sortie de secours, à appeler depuis la console si une version du worker se
 * révélait défectueuse : `desinstallerServiceWorker()`. Sans elle, un worker
 * fautif resterait sur les appareils jusqu'à ce qu'ils veuillent bien le
 * remplacer — la panne la plus difficile à rattraper du web.
 */
export async function desinstallerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  if ('caches' in window) {
    const noms = await caches.keys();
    await Promise.all(noms.map((n) => caches.delete(n)));
  }
  location.reload();
}
