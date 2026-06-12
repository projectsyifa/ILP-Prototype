/* =====================================================================
   ILP Academy 2026 — Service Worker
   Strategy:
   - JS/CSS/Images (local) → network-first (always fresh, cache as fallback)
   - Fonts (external CDN) → cache-first (never change, safe to cache forever)
   Bump CACHE_VER to wipe all caches on next visit.
   ===================================================================== */

const CACHE_VER = "ilp-v201";

/* Install: skip waiting so new SW activates immediately */
self.addEventListener("install", () => self.skipWaiting());

/* Activate: purge all old cache versions immediately */
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VER).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Fetch handler */
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  /* Never intercept Supabase, Google APIs, or CDN requests */
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("jsdelivr.net") || url.hostname.includes("unpkg.com") ||
    url.hostname.includes("fonts.g")
  ) return;

  const dest = e.request.destination;

  /* Fonts from external CDNs: cache-first (content-addressed, never changes) */
  if (dest === "font") {
    e.respondWith(
      caches.match(e.request).then(
        (cached) =>
          cached ||
          fetch(e.request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE_VER).then((c) => c.put(e.request, clone));
            }
            return res;
          })
      )
    );
    return;
  }

  /* Everything else (JS, CSS, images, documents): network-first.
     Always fetch the latest from network; fall back to cache only when offline. */
  if (dest === "script" || dest === "style" || dest === "image" || dest === "document" || dest === "") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VER).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
});
