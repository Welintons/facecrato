// Versão do cache: altere para 'facecrato-v2', 'v3', etc., sempre que fizer mudanças grandes
const CACHE_NAME = 'facecrato-v1';

// Arquivos que serão salvos offline no celular do usuário
const urlsToCache = [
  '/facecrato/',
  '/facecrato/index.html'
];

// Instala o Service Worker e guarda os arquivos no cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting(); // Força o SW novo a assumir o controle imediatamente
});

// Remove caches antigos quando você atualizar a versão
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Intercepta as requisições: tenta buscar na rede primeiro, se falhar ou estiver offline, pega do cache
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
