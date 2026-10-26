// Offline: every file the app needs is kept on the phone, so it opens and works in airplane mode.
// Bump VERSION with every change so phones fetch the new files (they update in the background).
const VERSION = 'sd-m1-02';
const FILES = [
  './', 'index.html', 'manifest.webmanifest',
  'css/base.css', 'css/sheets.css',
  'js/main.js', 'js/nav.js', 'js/navmap.js', 'js/loop.js', 'js/hud.js', 'js/settings.js', 'js/sheets.js',
  'js/cards.js', 'js/upgrade.js', 'js/storage.js', 'js/decks.js', 'js/sample.js', 'js/editor.js',
  'js/export.js', 'js/decksheet.js', 'js/tuning.js',
  'js/art/rng.js', 'js/art/sigils.js', 'js/art/pixels.js', 'js/art/font.js', 'js/art/face.js', 'js/art/panels.js', 'js/art/cache.js',
  'js/table/table.js', 'js/table/layouts.js', 'js/table/input.js',
  'js/lift/lift.js', 'js/lift/infobox.js',
  'fonts/pixelify-sans-latin-400-normal.woff2', 'fonts/pixelify-sans-latin-600-normal.woff2', 'fonts/pixelify-sans-latin-700-normal.woff2',
  'fonts/lora-latin-400-normal.woff2', 'fonts/lora-latin-400-italic.woff2', 'fonts/lora-latin-600-normal.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/new-idea-96.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('sd-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (req.mode === 'navigate') return (await cache.match('index.html')) || fetch(req);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  })());
});
