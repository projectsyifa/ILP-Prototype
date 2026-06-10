/* =====================================================================
   ILP Academy 2026 — Service Worker
   Cache-first for all static assets; pass-through for Supabase API.
   Bump CACHE_VER whenever CSS/JS changes to force refresh.
   ===================================================================== */

const CACHE_VER = "ilp-v119";
/* Paths are resolved relative to the SW's own location (project root) */
const STATIC = [
  "assets/style.css",
  "assets/app.css",
  "assets/ui.css",
  "assets/auth.js",
  "scripts/main.js",
  "assets/ILP-Logo.png",
  "app.html",
];

/* Install: pre-cache known static assets */
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_VER).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

/* Activate: purge old cache versions */
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VER).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Fetch: cache-first for static assets, network-only for Supabase */
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  /* Never cache Supabase API or auth requests */
  if (url.hostname.includes("supabase.co") || url.hostname.includes("googleapis.com")) return;

  /* Cache-first for scripts, styles, images, fonts */
  const dest = e.request.destination;
  if (dest === "script" || dest === "style" || dest === "image" || dest === "font") {
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
  }
});
