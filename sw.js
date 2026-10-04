const CACHE_NAME = 'cajazeiras-v8';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './config.js?v=8',
  './manifest.json?v=8',
  './icon-192.png',
  './icon-512.png'
];

// Instalação do Service Worker e cache inicial de recursos estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Ativação e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceção de requisições
self.addEventListener('fetch', (event) => {
  // Ignora requisições para a API do Google Apps Script para evitar cache inadequado de dados dinâmicos
  if (event.request.url.includes('script.google.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});