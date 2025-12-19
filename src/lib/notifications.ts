/**
 * Notification utilities with iOS Safari support
 * iOS Safari requires Service Worker for notifications to work
 */

// Check if running on iOS
export const isIOS = (): boolean => {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

// Check if running in standalone mode (PWA)
export const isStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (window.navigator as any).standalone === true || 
         window.matchMedia('(display-mode: standalone)').matches;
};

// Register Service Worker
export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    console.log('[Notifications] Service Worker not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    });
    
    console.log('[Notifications] Service Worker registered:', registration);
    
    // Wait for service worker to be ready
    await navigator.serviceWorker.ready;
    console.log('[Notifications] Service Worker ready');
    
    return registration;
  } catch (error) {
    console.error('[Notifications] Service Worker registration failed:', error);
    return null;
  }
};

// Request notification permission
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    console.log('[Notifications] Notifications not supported');
    return 'denied';
  }

  // On iOS, check if we're in standalone mode
  if (isIOS() && !isStandalone()) {
    console.warn('[Notifications] iOS requires app to be added to home screen for notifications');
    return 'default';
  }

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    console.log('[Notifications] Permission:', permission);
    return permission;
  }

  return Notification.permission;
};

// Show notification (works on all platforms, uses Service Worker on iOS)
export const showNotification = async (
  title: string,
  options: NotificationOptions
): Promise<void> => {
  if (typeof window === 'undefined') return;

  // Check permission
  if (!('Notification' in window)) {
    console.log('[Notifications] Notifications not supported');
    return;
  }

  const permission = Notification.permission;
  console.log('[Notifications] Permission status:', permission);
  console.log('[Notifications] Document hidden:', document.hidden);
  console.log('[Notifications] Is iOS:', isIOS());
  console.log('[Notifications] Is standalone:', isStandalone());

  // On iOS, we must use Service Worker
  if (isIOS()) {
    if (!isStandalone()) {
      console.warn('[Notifications] iOS requires app to be added to home screen');
      return;
    }

    if (permission !== 'granted') {
      console.warn('[Notifications] Permission not granted on iOS:', permission);
      return;
    }

    // Use Service Worker for iOS (even if app is active)
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        console.log('[Notifications] Service Worker ready, showing notification');
        
        // Try to show notification via Service Worker
        // On iOS, this works even when app is in foreground
        await registration.showNotification(title, {
          ...options,
          // Ensure these options are set for iOS
          badge: options.badge || '/icon-192x192.png',
          icon: options.icon || '/icon-192x192.png',
        });
        console.log('[Notifications] ✅ Notification shown via Service Worker');
        return;
      } catch (error) {
        console.error('[Notifications] ❌ Failed to show notification via SW:', error);
        console.error('[Notifications] Error details:', {
          name: (error as any)?.name,
          message: (error as any)?.message,
          stack: (error as any)?.stack
        });
        
        // Try alternative: send message to SW
        try {
          const registration = await navigator.serviceWorker.ready;
          registration.active?.postMessage({
            type: 'SHOW_NOTIFICATION',
            title,
            options: {
              ...options,
              badge: options.badge || '/icon-192x192.png',
              icon: options.icon || '/icon-192x192.png',
            }
          });
          console.log('[Notifications] 📨 Sent notification request to SW via postMessage');
        } catch (postError) {
          console.error('[Notifications] ❌ postMessage also failed:', postError);
        }
      }
    } else {
      console.warn('[Notifications] Service Worker not available on iOS');
    }
    return;
  }

  // For other platforms, use regular Notification API (only when hidden)
  if (permission === 'granted' && document.hidden) {
    try {
      new Notification(title, options);
      console.log('[Notifications] Notification shown via regular API');
    } catch (error) {
      console.error('[Notifications] Failed to show notification:', error);
    }
  } else {
    console.log('[Notifications] Skipping notification - permission:', permission, 'hidden:', document.hidden);
  }
};

// Check if notifications are available
export const areNotificationsAvailable = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  if (!('Notification' in window)) {
    console.log('[Notifications] Notification API not available');
    return false;
  }
  
  const permission = Notification.permission;
  
  // On iOS, require standalone mode and granted permission
  if (isIOS()) {
    const available = isStandalone() && 'serviceWorker' in navigator && permission === 'granted';
    console.log('[Notifications] iOS availability check:', {
      standalone: isStandalone(),
      hasSW: 'serviceWorker' in navigator,
      permission,
      available
    });
    return available;
  }
  
  // For other platforms, just check permission
  const available = permission === 'granted';
  console.log('[Notifications] Non-iOS availability check:', { permission, available });
  return available;
};

// Get notification permission status
export const getNotificationPermission = (): NotificationPermission => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
};

