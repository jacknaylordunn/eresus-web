const CACHE_NAME = 'eresus-react-v3';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/index.html',
  
  // Core Resus Council Documents 2025 (for offline use)
  'https://www.resus.org.uk/sites/default/files/2025-10/Adult%20ALS%20algorithm%202025.pdf',
  'https://www.resus.org.uk/sites/default/files/2025-10/Paediatric%20advanced%20life%20support%20algorithm%202025.pdf',
  'https://www.resus.org.uk/sites/default/files/2025-10/Newborn%20life%20support%20algorithm%202025.pdf',
  'https://www.resus.org.uk/sites/default/files/2025-10/Adult%20post-resuscitation%20care%202025.pdf',
];

self.addEventListener('install', event => {
  // Force the waiting service worker to become the active service worker.
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        // Use { mode: 'cors' } for cross-origin requests
        const requests = urlsToCache.map(url => new Request(url, { mode: 'cors' }));
        return Promise.all(
          requests.map(req => 
            cache.add(req).catch(err => console.warn('Failed to cache:', req.url, err))
          )
        );
      })
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Special handling for PDFs - always try network first, fallback to cache
  if (url.href.includes('.pdf')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache successful PDF responses
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Network failed, try cache
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // For all other requests, cache first strategy
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        
        return fetch(event.request).then(
          networkResponse => {
            if(!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }
            
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
            
            return networkResponse;
          }
        ).catch(err => {
          console.error('Fetch failed:', err);
          throw err;
        });
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Tell the active service worker to take control of the page immediately.
      return self.clients.claim();
    })
  );
});
