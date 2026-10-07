/* JD One service worker.
 * App shell (HTML, JS, CSS, icons): cache-first with background refresh.
 * Data (Supabase, any cross-origin request): network-first, never cached long.
 * The base path is derived from the registration scope, so the same file
 * works at / and at /jd-one/.
 */
const VERSION = "jd-one-muyid8ej";
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;
const scopePath = new URL(self.registration.scope).pathname; // e.g. "/jd-one/"

const PRECACHE = [scopePath, `${scopePath}manifest.webmanifest`, `${scopePath}icons/icon-192.png`, `${scopePath}icons/icon-512.png`];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  // Guest app and customer portal are separate static pages: never serve them from the staff app cache.
  if (sameOrigin && /\/(guest|portal)\//.test(url.pathname)) return;

  // Cross-origin (Supabase, fonts): network first, short-lived fallback cache.
  if (!sameOrigin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.pathname.includes("/rest/v1/")) caches.open(DATA).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req)),
    );
    return;
  }

  // Navigations: network first so deploys show up, fall back to cached page or the shell.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(SHELL).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match(scopePath)) || Response.error()),
    );
    return;
  }

  // Static assets (hashed _next/static, icons, sw): cache first, refresh in background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
