const CACHE_NAME = 'eresus-react-v11';

const STATIC_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  // Spoken prompts must work with no signal
  '/audio/prompts/rhythm_check_due.mp3',
  '/audio/prompts/prepare_rhythm_check.mp3',
  '/audio/prompts/adrenaline_due.mp3',
  '/audio/prompts/consider_adrenaline.mp3',
  '/audio/prompts/consider_amiodarone.mp3',
  '/audio/prompts/consider_amiodarone_second.mp3',
  '/audio/prompts/consider_lidocaine_second.mp3',
  '/audio/prompts/reassess_newborn.mp3',
  // Guideline charts are bundled, so every one opens with no signal
  '/guidelines/adult_als.png',
  '/guidelines/paediatric_als.png',
  '/guidelines/newborn_ls.png',
  '/guidelines/traumatic_arrest.png',
  '/guidelines/post_arrest.png',
  '/guidelines/jrcalc_adult_arrest.webp',
  '/guidelines/jrcalc_post_rosc.webp',
];

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

self.addEventListener('install', event => {
  self.skipWaiting();

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      console.log('[SW] Installing:', CACHE_NAME);

      // One at a time, so one missing file can't stop the rest (prompts, charts) caching.
      await Promise.all(
        STATIC_URLS.map(url => cache.add(url).catch(err => console.warn('[SW] Static URL cache failed:', url, err)))
      );
      await discoverAndCacheAssets(cache);
    })()
  );
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
        // The page last fetched online first: it points at the assets cached with it.
        .catch(async () => (await caches.match(event.request)) || (await caches.match('/')) || caches.match('/index.html'))
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
          .filter(n => n !== CACHE_NAME)
          .map(n => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});
