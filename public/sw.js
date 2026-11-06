// Service Worker for Cebu Marathon 2027 - Tacloban Leg
// Provides instant HTML shell loading while Render free-tier awakens from cold sleep

const CACHE_NAME = 'cebu-marathon-shell-v3';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/hero-runners-bg.jpg',
  '/Cebu Marathon 2027 Rainbow Logo.png',
  '/clubs/club_tbrc.png',
  '/clubs/club_tgr.png',
  '/clubs/club_trc.png',
  '/clubs/club_motion.png',
  '/clubs/club_ost.png',
  '/clubs/club_alangalang.png',
  '/clubs/club_santafe.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn('SW shell cache partial failure:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls - always live from backend
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Stale-while-revalidate for static assets / HTML shell
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

