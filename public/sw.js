const CACHE_NAME = 'eresus-react-v5';

const STATIC_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

const PDF_URLS = [
  'https://www.resus.org.uk/sites/default/files/2025-10/Adult%20ALS%20algorithm%202025.pdf',
  'https://www.resus.org.uk/sites/default/files/2025-10/Paediatric%20advanced%20life%20support%20algorithm%202025.pdf',
  'https://www.resus.org.uk/sites/default/files/2025-10/Newborn%20life%20support%20algorithm%202025.pdf',
  'https://www.resus.org.uk/sites/default/files/2025-10/Adult%20post-resuscitation%20care%202025.pdf',
];

// Discover and cache all Vite-built assets from index.html
async function discoverAndCacheAssets(cache) {
  try {
    const response = await fetch('/index.html');
    const html = await response.text();

    // Find all /assets/ references (JS, CSS, images etc.)
    const assetRegex = /["'](\/assets\/[^"']+)["']/g;
    const assets = new Set();
    let match;
    while ((match = assetRegex.exec(html)) !== null) {
      assets.add(match[1]);
    }

    // Also find any src= or href= references to /assets/
    const attrRegex = /(?:src|href)=["'](\/assets\/[^"']+)["']/g;
    while ((match = attrRegex.exec(html)) !== null) {
      assets.add(match[1]);
    }

    console.log('Discovered assets to cache:', [...assets]);
    await Promise.all(
      [...assets].map(url =>
        cache.add(url).catch(err => console.warn('Failed to cache asset:', url, err))
      )
    );
  } catch (err) {
    console.warn('Failed to discover assets from index.html:', err);
  }
}

self.addEventListener('install', event => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      console.log('Opened cache:', CACHE_NAME);

      // Cache static URLs
      await cache.addAll(STATIC_URLS);

      // Cache Vite-built assets discovered from index.html
      await discoverAndCacheAssets(cache);

      // Cache PDFs (best-effort, opaque responses for cross-origin)
      await Promise.all(
        PDF_URLS.map(url =>
          fetch(new Request(url, { mode: 'no-cors' }))
            .then(response => {
              if (response.status === 0 || response.ok) {
                return cache.put(url, response);
              }
              console.warn('PDF response not cacheable:', url, response.status);
            })
            .catch(err => console.warn('Failed to cache PDF:', url, err))
        )
      );
    })
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET
  if (event.request.method !== 'GET') return;

  // Skip API calls, analytics, Firebase
  if (
    url.protocol === 'chrome-extension:' ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('googletagmanager.com') ||
    url.hostname.includes('google-analytics.com') ||
    url.hostname.includes('firebaseinstallations') ||
    url.hostname.includes('identitytoolkit') ||
    url.hostname.includes('securetoken')
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
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Hashed assets (/assets/*): cache first (immutable)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Navigation: network first, fallback to cached /index.html (SPA)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
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
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
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
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});
