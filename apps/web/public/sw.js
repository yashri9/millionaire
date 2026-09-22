/* Published-deck offline cache (P2). Cache-first for images/audio; network-first for Q&A. */
const CACHE = "voxdeck-published-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isAsset =
    /\.(webp|png|jpg|jpeg|mp3|mpeg|wav)(\?|$)/i.test(url.pathname) ||
    url.hostname.includes("storage.supabase.co");
  const isAsk = url.pathname.includes("/api/d/") && url.pathname.includes("/ask");

  if (isAsk) {
    // Network-first for Q&A
    event.respondWith(
      fetch(req).catch(() => caches.match(req).then((r) => r || Response.error())),
    );
    return;
  }

  if (isAsset || url.pathname.startsWith("/d/")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res.ok) void cache.put(req, res.clone());
          return res;
        } catch {
          return cached || Response.error();
        }
      }),
    );
  }
});
