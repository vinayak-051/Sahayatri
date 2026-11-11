// Sahayatri service worker: an offline app shell, cached build assets and Web Push.
//
// Only same-origin GET requests are handled. Everything else (map tiles,
// Supabase, photo hosts, API calls) goes to the network untouched.
//
// Bump VERSION when the caching rules change: activate deletes every cache that
// doesn't belong to the current version.
const VERSION = "v2";
const SHELL_CACHE = `sahayatri-shell-${VERSION}`;
const ASSET_CACHE = `sahayatri-assets-${VERSION}`;
const SHELL_URLS = ["/", "/manifest.json", "/og-image.png"];
// Hashed build files never change, but every deploy adds new ones; keep the newest.
const MAX_ASSETS = 150;

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const current = [SHELL_CACHE, ASSET_CACHE];
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !current.includes(key)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Every route serves the same index.html, so the latest one is kept as "/".
    event.respondWith(networkFirst(event, "/", (response) => isCacheable(response) && isHtml(response)));
  } else if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(event));
  } else if (SHELL_URLS.includes(url.pathname)) {
    event.respondWith(networkFirst(event, url.pathname, isCacheable));
  }
});

self.addEventListener("push", (event) => {
  const payload = readPushPayload(event);
  const data = isObject(payload.data) ? { ...payload.data } : {};
  if (!data.url && typeof payload.url === "string") data.url = payload.url;
  event.waitUntil(
    self.registration.showNotification(payload.title || "Sahayatri Journeys", {
      body: payload.body || "",
      icon: "/og-image.png",
      data,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openApp(notificationTarget(event.notification.data)));
});

// Only complete, successful same-origin responses are kept: never errors,
// partial (206) or opaque responses.
function isCacheable(response) {
  return response.status === 200 && response.type === "basic" && !response.redirected;
}

function isHtml(response) {
  return (response.headers.get("Content-Type") || "").includes("text/html");
}

function isObject(value) {
  return Boolean(value) && typeof value === "object";
}

// Best effort: a shell file that can't be fetched now is cached on a later visit,
// and never stops the worker (which push needs) from installing.
async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(
    SHELL_URLS.map(async (path) => {
      try {
        const response = await fetch(path, { cache: "reload" });
        if (isCacheable(response)) await cache.put(path, response);
      } catch {
        // Offline while installing.
      }
    })
  );
}

async function cacheFirst(event) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  if (isCacheable(response)) {
    const copy = response.clone();
    event.waitUntil(
      cache
        .put(event.request, copy)
        .then(() => trimCache(cache, MAX_ASSETS))
        .catch(() => {})
    );
  }
  return response;
}

// Network first; keeps the latest good copy under `key` for when the network is gone.
async function networkFirst(event, key, isWorthKeeping) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(event.request);
    if (isWorthKeeping(response)) {
      const copy = response.clone();
      event.waitUntil(cache.put(key, copy).catch(() => {}));
    }
    return response;
  } catch (error) {
    const cached = await cache.match(key);
    if (cached) return cached;
    if (event.request.mode === "navigate") return offlineResponse();
    throw error;
  }
}

// Cache keys come back oldest first, so the oldest entries go first.
async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  const excess = keys.length - maxEntries;
  if (excess > 0) await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
}

function offlineResponse() {
  return new Response("You're offline. Check your connection and try again.", {
    status: 503,
    statusText: "Service Unavailable",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function readPushPayload(event) {
  if (!event.data) return {};
  try {
    const payload = event.data.json();
    return isObject(payload) ? payload : {};
  } catch {
    return { body: event.data.text() };
  }
}

// Same-origin paths only: a push payload must never send the user to another site.
function notificationTarget(data) {
  const fallback = new URL("/notifications", self.location.origin).href;
  if (!isObject(data) || typeof data.url !== "string") return fallback;
  try {
    const url = new URL(data.url, self.location.origin);
    return url.origin === self.location.origin ? url.href : fallback;
  } catch {
    return fallback;
  }
}

// Reuse an open app window (focus it, then go to the target) or open a new one.
async function openApp(url) {
  const windows = await self.clients.matchAll({ type: "window" });
  const client = windows.find((c) => c.focused) || windows[0];
  if (!client) return self.clients.openWindow(url);
  await client.focus();
  return client.url === url ? client : client.navigate(url);
}
