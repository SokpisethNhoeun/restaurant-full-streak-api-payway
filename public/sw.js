const SW_VERSION = "happyboat-pwa-v4";
const APP_SHELL_CACHE = `${SW_VERSION}-shell`;
const STATIC_CACHE = `${SW_VERSION}-static`;
const PAGE_CACHE = `${SW_VERSION}-pages`;
const API_CACHE = `${SW_VERSION}-api`;
const IMAGE_CACHE = `${SW_VERSION}-images`;

const APP_SHELL = [
  "/",
  "/dashboard",
  "/t/T01",
  "/offline.html",
  "/manifest.webmanifest",
  "/logo.png",
  "/icon-192.png",
  "/icon-512.png",
  "/maskable-icon-512.png",
  "/apple-touch-icon.png"
];

const API_PATHS_TO_CACHE = [
  "/api/customer/menu",
  "/api/customer/tables/"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const expectedCaches = new Set([
      APP_SHELL_CACHE,
      STATIC_CACHE,
      PAGE_CACHE,
      API_CACHE,
      IMAGE_CACHE
    ]);
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith("happyboat-pwa-") && !expectedCaches.has(cacheName))
        .map((cacheName) => caches.delete(cacheName))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (isStaticAsset(url, request)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (isUploadedMenuImage(url)) {
    event.respondWith(networkFirstImage(request, IMAGE_CACHE));
    return;
  }

  if (request.destination === "image") {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  if (isCacheableApi(url)) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "happyboat-sync") {
    event.waitUntil(Promise.resolve());
  }
});

self.addEventListener("push", (event) => {
  const data = event.data ? safeJson(event.data.text()) : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "HappyBoat", {
      body: data.body || "Order status updated.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/dashboard" },
      vibrate: [220, 90, 220]
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil((async () => {
    const clientsList = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existingClient = clientsList.find((client) => client.url.includes(targetUrl));
    if (existingClient) {
      await existingClient.focus();
      return;
    }
    await clients.openWindow(targetUrl);
  })());
});

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      const cache = await caches.open(PAGE_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match("/offline.html");
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error("Network unavailable and no cached response found.");
  }
}

async function networkFirstImage(request, cacheName) {
  try {
    const response = await fetch(request);
    if (isCacheableImageResponse(response)) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error("Network unavailable and no cached image response found.");
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheableResponse(response)) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkResponse = fetch(request)
    .then((response) => {
      if (isCacheableResponse(response)) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || networkResponse;
}

function isStaticAsset(url, request) {
  return url.origin === self.location.origin && (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    ["font", "style", "script", "worker"].includes(request.destination)
  );
}

function isCacheableApi(url) {
  return API_PATHS_TO_CACHE.some((path) => url.pathname.startsWith(path));
}

function isUploadedMenuImage(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/api/public/uploads/menu-images/");
}

function isCacheableResponse(response) {
  return response && (response.ok || response.type === "opaque");
}

function isCacheableImageResponse(response) {
  if (!response) return false;
  if (response.type === "opaque") return true;
  const contentType = response.headers.get("content-type") || "";
  return response.ok && contentType.toLowerCase().startsWith("image/");
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
