/* TailorHub service worker - offline support. Bump VERSION when you want to force a cache refresh. */
const VERSION = 'th-v8';
const CORE = 'th-core-' + VERSION;
const LIBS = 'th-libs-' + VERSION;

const LIB_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage-compat.js',
  'https://fonts.googleapis.com/css2?family=Zilla+Slab:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const core = await caches.open(CORE);
    await core.add(new Request('./', { cache: 'reload' })).catch(() => {});
    await Promise.all(['manifest.json','icon-192.png','icon-512.png'].map(u => core.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    const libs = await caches.open(LIBS);
    await Promise.all(LIB_URLS.map(u => libs.add(new Request(u, { mode: 'cors' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CORE && k !== LIBS).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* App page: network first (so updates show), cached copy when offline */
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(CORE);
        c.put('./', fresh.clone());
        return fresh;
      } catch (err) {
        return (await caches.match('./', { ignoreSearch: true })) || (await caches.match('index.html', { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }

  /* Libraries + fonts: cache first, fill cache on first online use */
  const isLib = url.hostname === 'cdnjs.cloudflare.com' ||
                url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/') ||
                url.hostname === 'fonts.googleapis.com' ||
                url.hostname === 'fonts.gstatic.com';
  if (isLib) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) {
          const c = await caches.open(LIBS);
          c.put(req, res.clone());
        }
        return res;
      } catch (err) {
        return Response.error();
      }
    })());
    return;
  }
  /* Everything else (Firebase/Firestore API calls etc.) goes straight to network, untouched */
});
