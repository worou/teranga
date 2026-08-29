/* Service worker de Téranga.
 *
 * Un service worker mal écrit est la panne la plus difficile à rattraper du
 * web : il s'installe sur l'appareil des gens et peut y servir une version
 * périmée indéfiniment, sans qu'aucun déploiement n'y change rien. Tout ce qui
 * suit est écrit contre ce risque.
 *
 * LES RÈGLES, ET LEUR RAISON
 *
 *   Navigations : RÉSEAU D'ABORD. Une mise en ligne est donc visible au
 *     rechargement suivant. Le cache ne sert que hors ligne. C'est le contraire
 *     du réflexe « cache d'abord », qui donne des applications figées.
 *
 *   /assets/ : CACHE D'ABORD, et c'est sans danger — Vite y met une empreinte
 *     du contenu dans le nom du fichier. Un fichier changé change de nom : on
 *     ne peut pas servir un ancien contenu sous un nom neuf.
 *
 *   /api/ et /socket.io/ : JAMAIS de cache. Des réponses personnelles et
 *     datées n'ont rien à faire sur le disque.
 *
 *   /uploads/ : JAMAIS de cache non plus, et ce n'est pas une question de
 *     fraîcheur. Ce sont les photos des membres. Un membre qui passe ses
 *     photos en privé doit disparaître des écrans — un cache local les
 *     rendrait encore, après coup, sur l'appareil de quelqu'un d'autre.
 */

const CACHE = 'teranga-coquille-v1';
const REPLI = '/index.html';

self.addEventListener('install', () => {
  // Pas de préchargement : la coquille se met en cache à la première visite
  // réussie. Précharger obligerait à connaître les noms des fichiers versionnés,
  // qui changent à chaque build.
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const noms = await caches.keys();
      await Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/socket.io/') ||
    url.pathname.startsWith('/uploads/')
  ) {
    return;
  }

  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        try {
          const r = await fetch(req);
          if (r.ok) (await caches.open(CACHE)).put(REPLI, r.clone());
          return r;
        } catch {
          const c = await caches.open(CACHE);
          const secours = await c.match(REPLI);
          if (secours) return secours;
          return new Response(
            '<!doctype html><meta charset="utf-8"><title>Hors ligne</title>' +
              '<body style="font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#FDF8F0;color:#2B1605">' +
              '<p>Vous êtes hors ligne.</p></body>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
          );
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      (async () => {
        const c = await caches.open(CACHE);
        const connu = await c.match(req);
        if (connu) return connu;
        const r = await fetch(req);
        if (r.ok) c.put(req, r.clone());
        return r;
      })(),
    );
  }
});

/* Sortie de secours. Si une version future de ce fichier se révélait
 * défectueuse, la page peut demander au worker de se désinstaller et de vider
 * ses caches — sans quoi il faudrait attendre que chaque appareil veuille bien
 * le remplacer. */
self.addEventListener('message', (e) => {
  if (e.data === 'desinstaller') {
    e.waitUntil(
      (async () => {
        const noms = await caches.keys();
        await Promise.all(noms.map((n) => caches.delete(n)));
        await self.registration.unregister();
      })(),
    );
  }
});
