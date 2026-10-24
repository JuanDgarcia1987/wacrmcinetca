/**
 * wacrm Service Worker
 * - Caches static assets for offline support
 * - Handles Web Push notifications
 * - Handles notification clicks to open conversations
 */

const CACHE_NAME = 'wacrm-v1';
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/inbox',
  '/contacts',
  '/pipelines',
  '/manifest.json',
];

// Install - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { credentials: 'same-origin' })));
    })
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Supabase realtime websocket
  if (url.pathname.startsWith('/realtime') || url.hostname.includes('supabase')) return;

  // Skip API routes (always fresh)
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Serve from cache, update in background
        event.waitUntil(
          fetch(request).then((networkResponse) => {
            if (networkResponse.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse.clone()));
            }
          }).catch(() => { /* offline */ })
        );
        return cachedResponse;
      }

      // Not in cache - fetch from network
      return fetch(request).then((networkResponse) => {
        // Cache successful responses for static assets
        if (networkResponse.ok && isStaticAsset(url.pathname)) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (request.mode === 'navigate') {
          return caches.match('/') || new Response('Offline', { status: 503 });
        }
      });
    })
  );
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