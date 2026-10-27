/**
 * wacrm Service Worker
 * - Caches ONLY immutable static assets (hashed /_next/build artifacts) for
 *   offline support; NEVER caches HTML documents or protected routes.
 * - Handles Web Push notifications
 * - Handles notification clicks to open conversations
 *
 * NOTE (bugfix): earlier versions put '/' and page routes in STATIC_ASSETS and
 * followed the /login redirect at install, caching the login HTML (with
 * `Vary: rsc, next-router-*`) under those URLs. Serving that to a navigation
 * made Chromium abort the page with net::ERR_FAILED. Documents and auth-guarded
 * routes are now network-first and never cached.
 */

const CACHE_NAME = 'wacrm-v2';
const SHELL_CACHE = 'wacrm-shell-v2';
// Only fingerprinted / hashed static assets go in the immutable cache.
// Docs, HTML and auth-guarded routes are intentionally NOT listed here.
const STATIC_ASSETS = [
  '/manifest.json',
];

// Install - cache only static shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate - clean ALL old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch - static assets from cache-first; documents/API always from network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Supabase realtime websocket
  if (url.pathname.startsWith('/realtime') || url.hostname.includes('supabase')) return;

  // Skip API routes (always fresh)
  if (url.pathname.startsWith('/api/')) return;

  // Documents & navigations: ALWAYS network-first, never cache the HTML.
  // The server sets cache-control: private, no-store and Vary: rsc, ... which
  // makes stale/cached copies of these routes wrong (they depend on auth).
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request).catch(() => {
        // Offline fallback: only the immutable shell, if any.
        return caches.open(SHELL_CACHE).then((c) => c.match('/')) ||
          new Response('Sin conexión', { status: 503 });
      })
    );
    return;
  }

  // Static hashed assets: cache-first, background revalidate.
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request).then((resp) => {
            if (resp && resp.ok) {
              cache.put(request, resp.clone());
            }
            return resp;
          }).catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // Everything else: network only.
  return;
});

function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/icons/') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.js') ||
    pathname === '/manifest.json'
  );
}

// Push notification event
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'wacrm', body: event.data.text() };
  }

  const { title, body, icon, badge, data, tag, requireInteraction } = payload;

  const options = {
    body: body || 'Nuevo mensaje',
    icon: icon || '/icons/icon-192.png',
    badge: badge || '/icons/icon-72.png',
    data: data || {},
    tag: tag || 'wacrm-message',
    requireInteraction: requireInteraction !== false,
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'dismiss', title: 'Descartar' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(title || 'wacrm', options)
  );
});

// Notification click - open conversation
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const data = event.notification.data || {};
  const conversationId = data.conversationId;
  const url = conversationId ? `/inbox?c=${encodeURIComponent(conversationId)}` : '/inbox';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Try to focus existing window
      for (const client of clients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.pathname === '/inbox' && client.focus) {
          client.postMessage({ type: 'NAVIGATE', conversationId });
          return client.focus();
        }
      }
      // Open new window
      return self.clients.openWindow(url);
    })
  );
});

// Notification close
self.addEventListener('notificationclose', (event) => {
  // Optional: track dismissed notifications
  console.log('[SW] Notification closed:', event.notification.tag);
});

// Message from client (e.g., to navigate from existing window)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});