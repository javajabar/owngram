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

  // On iOS, we must use Service Worker
  if (isIOS()) {
    if (!isStandalone()) {
      console.warn('[Notifications] iOS requires app to be added to home screen');
      return;
    }

    // Use Service Worker for iOS
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, options);
        return;
      } catch (error) {
        console.error('[Notifications] Failed to show notification via SW:', error);
      }
    }
  }

  // For other platforms, use regular Notification API
  if (Notification.permission === 'granted' && document.hidden) {
    try {
      new Notification(title, options);
    } catch (error) {
      console.error('[Notifications] Failed to show notification:', error);
    }
  }
};

// Check if notifications are available
export const areNotificationsAvailable = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  if (!('Notification' in window)) return false;
  
  // On iOS, require standalone mode
  if (isIOS()) {
    return isStandalone() && 'serviceWorker' in navigator;
  }
  
  return true;
};

// Get notification permission status
export const getNotificationPermission = (): NotificationPermission => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
};

