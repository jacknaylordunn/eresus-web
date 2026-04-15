const CACHE_NAME = 'eresus-react-v4';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',

  // Core Resus Council Documents 2025 (for offline use)
  'https://www.resus.org.uk/sites/default/files/2025-10/Adult%20ALS%20algorithm%202025.pdf',
  'https://www.resus.org.uk/sites/default/files/2025-10/Paediatric%20advanced%20life%20support%20algorithm%202025.pdf',
  'https://www.resus.org.uk/sites/default/files/2025-10/Newborn%20life%20support%20algorithm%202025.pdf',
  'https://www.resus.org.uk/sites/default/files/2025-10/Adult%20post-resuscitation%20care%202025.pdf',
];

self.addEventListener('install', event => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Opened cache');
      // Cache same-origin URLs normally
      const sameOrigin = urlsToCache.filter(u => !u.startsWith('http'));
      const crossOrigin = urlsToCache.filter(u => u.startsWith('http'));

      return cache.addAll(sameOrigin).then(() =>
        Promise.all(
          crossOrigin.map(url =>
            cache.add(new Request(url, { mode: 'cors' })).catch(err =>
              console.warn('Failed to cache:', url, err)
            )
          )
        )
      );
    })
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip chrome-extension, analytics, Firebase API calls etc.
  if (
    url.protocol === 'chrome-extension:' ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('googletagmanager.com') ||
    url.hostname.includes('google-analytics.com') ||
    url.hostname.includes('firebaseinstallations') ||
    url.hostname.includes('identitytoolkit')
  ) {
    return;
  }

  // PDFs: network first, fallback to cache
  if (url.href.includes('.pdf')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Vite hashed assets (e.g. /assets/index-abc123.js) — cache first (immutable)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Navigation requests (HTML pages): network first, fallback to cached /index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Everything else: stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});
