// Service worker : l'appli fonctionne hors ligne sur le chantier.
const VERSION = 'metre-facade-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/db.js', 'js/catalog.js', 'js/geom.js', 'js/editor.js', 'js/ai.js', 'js/laser.js', 'js/report.js',
  'icons/icon-192.png', 'icons/icon-512.png',
  ...['cheminee', 'clim', 'descente', 'eau', 'eclairage', 'edf', 'gc-ext', 'gc-int', 'gonds', 'grille-defense', 'grille', 'marches', 'pannes', 'parabole', 'rampe', 'rive', 'store'].map(p => `pictos/${p}.png`),
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('metre-facade-') && k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'api.anthropic.com') return; // jamais en cache
  if (url.origin === location.origin) {
    // réseau d'abord (mises à jour), cache si hors ligne
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const copie = r.clone(); caches.open(VERSION).then(c => c.put(req, copie)); }
      return r;
    }).catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
    return;
  }
  if (url.hostname === 'cdn.jsdelivr.net') {
    // bibliothèque d'analyse : cache d'abord
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      if (res.ok) { const copie = res.clone(); caches.open(VERSION).then(c => c.put(req, copie)); }
      return res;
    })));
  }
});
