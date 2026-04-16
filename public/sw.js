const CACHE_NAME = 'eresus-react-v6';
const PDF_CACHE_NAME = 'eresus-pdfs-v2';

const STATIC_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Map of same-origin proxy paths -> upstream PDF URLs
const PDF_MAP = {
  '/cached-pdf/adult.pdf':
    'https://www.resus.org.uk/sites/default/files/2025-10/Adult%20ALS%20algorithm%202025.pdf',
  '/cached-pdf/paeds.pdf':
    'https://www.resus.org.uk/sites/default/files/2025-10/Paediatric%20advanced%20life%20support%20algorithm%202025.pdf',
  '/cached-pdf/newborn.pdf':
    'https://www.resus.org.uk/sites/default/files/2025-10/Newborn%20life%20support%20algorithm%202025.pdf',
  '/cached-pdf/post.pdf':
    'https://www.resus.org.uk/sites/default/files/2025-10/Adult%20post-resuscitation%20care%202025.pdf',
};

// Discover and cache all Vite-built assets from index.html
async function discoverAndCacheAssets(cache) {
  try {
    const response = await fetch('/index.html');
    const html = await response.text();

    const assetRegex = /["'](\/assets\/[^"']+)["']/g;
    const assets = new Set();
    let match;
    while ((match = assetRegex.exec(html)) !== null) {
      assets.add(match[1]);
    }
    const attrRegex = /(?:src|href)=["'](\/assets\/[^"']+)["']/g;
    while ((match = attrRegex.exec(html)) !== null) {
      assets.add(match[1]);
    }

    console.log('[SW] Discovered assets to cache:', assets.size);
    await Promise.all(
      [...assets].map(url =>
        cache.add(url).catch(err => console.warn('[SW] Failed asset:', url, err))
      )
    );
  } catch (err) {
    console.warn('[SW] Failed to discover assets from index.html:', err);
  }
}

// Pre-cache PDFs as same-origin keys.
// Strategy: fetch upstream as no-cors (opaque), then store the opaque Response
// under a same-origin URL key (e.g. /cached-pdf/adult.pdf). When the app
// requests that same-origin URL, the SW responds with the opaque body, which
// browsers DO accept for <object> / <iframe> because the URL itself is same-origin.
async function precachePDFs() {
  const cache = await caches.open(PDF_CACHE_NAME);
  const results = await Promise.all(
    Object.entries(PDF_MAP).map(async ([proxyPath, upstreamUrl]) => {
      try {
        // Check if already cached
        const existing = await cache.match(proxyPath);
        if (existing) {
          console.log('[SW] PDF already cached:', proxyPath);
          return { proxyPath, ok: true, cached: true };
        }

        const upstreamResp = await fetch(upstreamUrl, {
          mode: 'no-cors',
          cache: 'no-store',
          credentials: 'omit',
        });

        // Opaque responses have status 0 but are still storable
        if (upstreamResp.type === 'opaque' || upstreamResp.ok) {
          // Store under the SAME-ORIGIN proxy path
          await cache.put(proxyPath, upstreamResp.clone());
          console.log('[SW] Pre-cached PDF:', proxyPath);
          return { proxyPath, ok: true };
        }
        console.warn('[SW] PDF fetch not cacheable:', proxyPath, upstreamResp.status);
        return { proxyPath, ok: false };
      } catch (err) {
        console.warn('[SW] Failed pre-cache PDF:', proxyPath, err);
        return { proxyPath, ok: false, error: String(err) };
      }
    })
  );
  console.log('[SW] PDF precache results:', results);
}

self.addEventListener('install', event => {
  self.skipWaiting();

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      console.log('[SW] Installing:', CACHE_NAME);

      await cache.addAll(STATIC_URLS).catch(err =>
        console.warn('[SW] Static URL cache failed:', err)
      );
      await discoverAndCacheAssets(cache);
      await precachePDFs();
    })()
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'PRECACHE_PDFS') {
    event.waitUntil(precachePDFs());
  }
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;

  // Skip third-party APIs/analytics
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

  // 1. Same-origin PDF proxy: serve from cache, fall back to network fetch + cache
  if (url.origin === self.location.origin && url.pathname.startsWith('/cached-pdf/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PDF_CACHE_NAME);
        const cached = await cache.match(url.pathname);
        if (cached) {
          console.log('[SW] Serving cached PDF:', url.pathname);
          return cached;
        }
        // Not cached yet — fetch upstream now, cache, return
        const upstreamUrl = PDF_MAP[url.pathname];
        if (!upstreamUrl) {
          return new Response('PDF not found', { status: 404 });
        }
        try {
          const resp = await fetch(upstreamUrl, { mode: 'no-cors', credentials: 'omit' });
          if (resp.type === 'opaque' || resp.ok) {
            await cache.put(url.pathname, resp.clone());
          }
          return resp;
        } catch (err) {
          return new Response('Offline and PDF not cached', { status: 503 });
        }
      })()
    );
    return;
  }

  // 2. Direct upstream PDF requests (legacy, in case any code still uses raw URL):
  // try cache first via PDF_MAP reverse lookup, then network.
  if (url.href.endsWith('.pdf')) {
    const proxyPath = Object.keys(PDF_MAP).find(k => PDF_MAP[k] === url.href);
    event.respondWith(
      (async () => {
        if (proxyPath) {
          const cache = await caches.open(PDF_CACHE_NAME);
          const cached = await cache.match(proxyPath);
          if (cached && !navigator.onLine) return cached;
          try {
            const resp = await fetch(event.request);
            if (resp && (resp.ok || resp.type === 'opaque')) {
              await cache.put(proxyPath, resp.clone());
            }
            return resp;
          } catch {
            if (cached) return cached;
            return new Response('Offline', { status: 503 });
          }
        }
        try {
          return await fetch(event.request);
        } catch {
          return new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // 3. Hashed assets: cache-first
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

  // 4. Navigation: network first, fallback to /index.html
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

  // 5. Stale-while-revalidate for everything else
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
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(n => n !== CACHE_NAME && n !== PDF_CACHE_NAME)
          .map(n => caches.delete(n))
      );
      await self.clients.claim();
      // Trigger PDF precache again on activation in case install missed any
      precachePDFs();
    })()
  );
});
