const CACHE = "ohfome-operacao-v1";
const ASSETS = ["/", "/login", "/marca/ohfome-icone-quadrado.png?v=20260821"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/login")));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/marca/")) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(request, copy)); return response; })));
  }
});
