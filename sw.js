// Mode hors-ligne : l'application s'ouvre sans réseau une fois visitée.
const CACHE = 'livre-recettes-v18';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/db.js', 'js/state.js', 'js/calc.js', 'js/util.js', 'js/files.js', 'js/ui.js', 'js/backup.js',
  'js/view-recap.js', 'js/view-missions.js', 'js/view-livres.js', 'js/view-urssaf.js', 'js/view-imprimer.js', 'js/view-reglages.js',
  'js/sync.js', 'js/sync-core.js', 'js/github.js', 'js/tva-view.js', 'js/charts.js', 'js/bareme.js', 'js/taux.js', 'js/view-documents.js',
  'vendor/jszip.min.js', 'vendor/pdf.min.mjs', 'vendor/pdf.worker.min.mjs',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Fichiers de l'application : réseau d'abord (pour recevoir les mises à jour), cache en secours.
// L'API GitHub et tout ce qui n'est pas de notre origine ne passent jamais par le cache.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
  );
});
