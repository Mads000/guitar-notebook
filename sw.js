// Service Worker: speichert ausschließlich den App-Code für den Offline-Betrieb.
// Songdaten liegen in IndexedDB und werden hier NIE gelesen, verändert oder gelöscht.
//
// Bei jedem Update der App VERSION erhöhen – nur dann erkennt das iPhone die neue Version.
const VERSION = '1.6.3';
const CACHE = 'gn-app-' + VERSION;

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './styles/main.css',
  './styles/editor.css',
  './styles/tabs.css',
  './styles/view.css',
  './js/app.js',
  './js/ui.js',
  './js/storage.js',
  './js/songs.js',
  './js/editor.js',
  './js/chords.js',
  './js/progression.js',
  './js/strumming.js',
  './js/tabs.js',
  './js/tabeditor.js',
  './js/pdf.js',
  './js/backup.js',
  './js/samples.js',
  './js/media.js',
  './js/importer.js',
  './js/songview.js',
  './js/ai.js',
  './js/merge.js',
  './js/aiedit.js',
  './js/sync.js',
  './js/transpose.js',
  './vendor/jspdf.umd.min.js',
  './vendor/peerjs.min.js',
  './assets/icons/icon.svg',
  './assets/fonts/source-serif-4.woff2',
  './assets/icons/icon-180.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  // Alle Dateien frisch vom Server holen (nicht aus dem HTTP-Cache), damit die neue Version vollständig ist.
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  // Nur alte App-Code-Caches entfernen. IndexedDB (Songs) bleibt unangetastet.
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('gn-app-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Die App bestätigt ein Update erst, nachdem alle Änderungen gespeichert sind.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Cache zuerst: Die App startet immer offline aus dem Cache.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') {
      return (await cache.match('./index.html')) || fetch(req);
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch {
      return new Response('Offline – Datei nicht im App-Cache', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
