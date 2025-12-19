// Service Worker for push notifications (required for iOS Safari)
const CACHE_NAME = 'owngram-v1';

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installing...');
  self.skipWaiting(); // Activate immediately
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  return self.clients.claim(); // Take control of all pages immediately
});

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received:', event);
  
  let notificationData = {
    title: 'OwnGram',
    body: 'У вас новое сообщение',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: 'message',
    requireInteraction: false,
    silent: false
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        ...notificationData,
        ...data,
        tag: data.tag || data.chatId || 'message'
      };
    } catch (e) {
      console.error('[SW] Error parsing push data:', e);
    }
  }

  const notificationOptions = {
    body: notificationData.body,
    tag: notificationData.tag,
    requireInteraction: notificationData.requireInteraction,
    silent: notificationData.silent,
    data: notificationData.data || {}
  };

  // Only add icon/badge if they exist
  if (notificationData.icon) notificationOptions.icon = notificationData.icon;
  if (notificationData.badge) notificationOptions.badge = notificationData.badge;

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationOptions)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  event.notification.close();

  const chatId = event.notification.tag || event.notification.data?.chatId;
  const urlToOpen = chatId ? `/chat/${chatId}` : '/chat';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window/tab open with the target URL
      for (const client of clientList) {
        if (client.url.includes('/chat') && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window/tab
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  }
});

