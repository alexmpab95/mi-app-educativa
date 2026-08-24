// service-worker.js — Fase -1/Fase 0.
// Estrategia sencilla: cachear el "app shell" en la instalación y servir
// desde caché primero, con actualización en segundo plano (stale-while-
// revalidate), para que la app funcione sin conexión desde la primera
// visita (apartado 13.1).

const CACHE_NAME = "educativo-cache-v8";

const ARCHIVOS_APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/app.js",
  "./js/db.js",
  "./js/crypto.js",
  "./js/curriculum.js",
  "./js/ia-orquestador.js",
  "./js/ia-motores.js",
  "./js/motor-compartido.js",
  "./js/generador.js",
  "./js/correccion.js",
  "./js/lienzo.js",
  "./js/ocr.js",
  "./js/modelo-educativo.js",
  "./js/gamificacion.js",
  "./data/curriculo-cv.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARCHIVOS_APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      // Solo se limpian los cachés de ESTE service worker (prefijo "educativo-cache-").
      // Importante: el motor de IA (WebLLM, Fase 1) guarda el modelo descargado en su
      // propio caché del navegador, con otro nombre; si lo borráramos aquí, cada
      // actualización de la app obligaría a volver a descargar cientos de MB.
      .then((nombres) =>
        Promise.all(nombres.filter((n) => n.startsWith("educativo-cache-") && n !== CACHE_NAME).map((n) => caches.delete(n)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Solo se cachea el propio origen (el "app shell"). Las peticiones a otros
  // orígenes (el CDN de WebLLM y los pesos del modelo en Fase 1) se dejan
  // pasar directamente a la red: ese motor gestiona su propio caché, con su
  // propia estrategia y su propio ciclo de vida, independiente del nuestro.
  if (new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
