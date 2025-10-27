const CACHE_NAME = 'eresus-react-v2';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/index.html',
  
  // Core Resus Council Documents (for offline use)
  'https://www.resus.org.uk/sites/default/files/2024-01/Adult%20Advanced%20Life%20Support%20Algorithm%202021%20Aug%202023.pdf',
  'https://www.resus.org.uk/sites/default/files/2021-04/Paediatric%20ALS%20Algorithm%202021.pdf',
  'https://www.resus.org.uk/sites/default/files/2021-05/Newborn%20Life%20Support%20Algorithm%202021.pdf',
  'https://www.resus.org.uk/sites/default/files/2023-08/Post%20cardiac%20arrest%20rehabilitation%20algorithim%202023.pdf',
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
