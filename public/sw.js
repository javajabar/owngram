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

// Handle push notifications (серверные push от Supabase Edge Function)
self.addEventListener('push', (event) => {
  console.log('[SW] 📬 Push notification received from server:', event);
  
  let notificationData = {
    title: 'OwnGram',
    body: 'У вас новое сообщение',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: 'message',
    requireInteraction: false,
    silent: false,
    data: {}
  };

  // Парсим данные от сервера
  if (event.data) {
    try {
      const data = event.data.json();
      console.log('[SW] Parsed push data:', data);
      
      notificationData = {
        title: data.title || notificationData.title,
        body: data.body || notificationData.body,
        icon: data.icon || notificationData.icon,
        badge: data.badge || notificationData.badge,
        tag: data.tag || data.chatId || notificationData.tag,
        requireInteraction: data.requireInteraction || false,
        silent: data.silent || false,
        data: data.data || {}
      };
    } catch (e) {
      console.error('[SW] Error parsing push data:', e);
      // Если не JSON, пытаемся как текст
      try {
        notificationData.body = event.data.text();
      } catch (textError) {
        console.error('[SW] Error parsing as text:', textError);
      }
    }
  }

  const notificationOptions = {
    body: notificationData.body,
    tag: notificationData.tag,
    requireInteraction: notificationData.requireInteraction,
    silent: notificationData.silent,
    data: {
      ...notificationData.data,
      chatId: notificationData.data.chatId || notificationData.tag,
      messageId: notificationData.data.messageId,
      senderId: notificationData.data.senderId,
    }
  };

  // Only add icon/badge if they exist
  if (notificationData.icon) notificationOptions.icon = notificationData.icon;
  if (notificationData.badge) notificationOptions.badge = notificationData.badge;

  console.log('[SW] Showing notification:', notificationData.title, notificationOptions);

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationOptions)
      .then(() => {
        console.log('[SW] ✅ Push notification shown successfully');
      })
      .catch((error) => {
        console.error('[SW] ❌ Failed to show push notification:', error);
      })
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
    console.log('[SW] Showing notification from message:', { title, options });
    
    const notificationOptions = {
      ...options,
      body: options.body || '',
      tag: options.tag || 'message',
      requireInteraction: options.requireInteraction || false,
      silent: options.silent || false,
      data: options.data || {}
    };
    
    // Only add icon/badge if they exist
    if (options.icon) notificationOptions.icon = options.icon;
    if (options.badge) notificationOptions.badge = options.badge;
    
    event.waitUntil(
      self.registration.showNotification(title, notificationOptions)
        .then(() => {
          console.log('[SW] ✅ Notification shown successfully');
        })
        .catch((error) => {
          console.error('[SW] ❌ Failed to show notification:', error);
        })
    );
  }
});

