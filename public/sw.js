const SHELL = "tamp-shell-v3";
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) =>
    cache.add(new Request(OFFLINE, { cache: "reload" })),
  ));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key !== SHELL && /^(tamp-shell-|tamp-runtime-)/.test(key))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") event.waitUntil(self.skipWaiting());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || request.mode !== "navigate" || url.origin !== self.location.origin
    || url.pathname === "/api" || url.pathname.startsWith("/api/")) return;

  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(SHELL);
    return await cache.match(OFFLINE) ?? Response.error();
  }));
});
