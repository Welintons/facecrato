
const CACHE_NAME = "facecrato-v1";

const APP_FILES = [
  "./",
  "./index.html",
  "./login.html",
  "./cadastro.html",
  "./feed.html",
  "./manifest.json"
];

// INSTALAÇÃO
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

// ATIVAÇÃO E LIMPEZA DE CACHE ANTIGO
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// REQUISIÇÕES
self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Não armazenar chamadas ao Supabase
  if (
    url.hostname.endsWith(".supabase.co") ||
    url.hostname.includes("supabase")
  ) {
    return;
  }

  // Navegação: tenta a rede primeiro
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache =>
              cache.put(request, copy)
            );
          }
          return response;
        })
        .catch(async () => {
          return await caches.match(request) ||
                 await caches.match("./index.html");
        })
    );
    return;
  }

  // Arquivos estáticos: cache primeiro
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        if (
          response.ok &&
          url.origin === self.location.origin
        ) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache =>
            cache.put(request, copy)
          );
        }

        return response;
      });
    })
  );
});
