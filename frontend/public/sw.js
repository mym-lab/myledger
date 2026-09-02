// MyLedger Service Worker — v3
// Strategy:
//   HTML (/, /index.html)  → network-only   (always fresh so chunk hashes are current)
//   JS/CSS assets          → cache-first     (content-hashed filenames, safe to cache)
//   Images & other static  → cache-first     (rarely change)
//   API calls (/api/*)     → bypass SW entirely
const CACHE = 'myledger-v3';

self.addEventListener('install', e => {
  // Don't precache HTML — always fetch fresh from network
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 1. API calls — always bypass service worker
  if (url.pathname.startsWith('/api/')) return;

  // 2. HTML documents — always network, never cache
  //    This ensures users always get the latest index.html with correct chunk hashes
  const isHtml = e.request.mode === 'navigate' ||
    url.pathname === '/' || url.pathname === '/index.html' ||
    e.request.headers.get('accept')?.includes('text/html');
  if (isHtml) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 3. JS / CSS assets (Vite content-hashed) — cache-first, network fallback
  //    Since filenames include content hash, a cached copy is always correct for that hash.
  //    New deployments produce new filenames → auto cache-miss → fresh fetch.
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
