/**
 * Утилита для регистрации push-подписок
 * Работает на всех платформах, включая iOS (через Service Worker)
 */

import { supabase } from './supabase'

export interface PushSubscriptionData {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

/**
 * Конвертирует PushSubscription в формат для хранения
 */
function subscriptionToData(subscription: PushSubscription): PushSubscriptionData {
  const key = subscription.getKey('p256dh')
  const auth = subscription.getKey('auth')
  
  if (!key || !auth) {
    throw new Error('Invalid subscription keys')
  }

  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: btoa(String.fromCharCode(...new Uint8Array(key))),
      auth: btoa(String.fromCharCode(...new Uint8Array(auth))),
    },
  }
}

/**
 * Регистрирует push-подписку пользователя
 */
export async function registerPushSubscription(
  userId: string
): Promise<boolean> {
  if (typeof window === 'undefined') return false

  // Проверяем поддержку
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('[Push] Push notifications not supported')
    return false
  }

  try {
    // Получаем Service Worker registration
    const registration = await navigator.serviceWorker.ready

    // Проверяем существующую подписку
    let subscription = await registration.pushManager.getSubscription()

    // Если подписки нет, создаем новую
    if (!subscription) {
      // Запрашиваем разрешение
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        console.log('[Push] Notification permission denied')
        return false
      }

      // Создаем подписку
      // VAPID публичный ключ берется из .env.local (NEXT_PUBLIC_VAPID_PUBLIC_KEY)
      // Должен совпадать с VAPID_PUBLIC_KEY в Supabase Secrets!
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      
      if (!vapidPublicKey) {
        console.error('[Push] ❌ VAPID public key not configured!')
        console.error('[Push] Add NEXT_PUBLIC_VAPID_PUBLIC_KEY to .env.local')
        return false
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })
    }

    // Конвертируем подписку в формат для хранения
    const subscriptionData = subscriptionToData(subscription)

    // Сохраняем в базу данных
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        endpoint: subscriptionData.endpoint,
        p256dh: subscriptionData.keys.p256dh,
        auth: subscriptionData.keys.auth,
        user_agent: navigator.userAgent,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,endpoint',
      })

    if (error) {
      console.error('[Push] Failed to save subscription:', error)
      return false
    }

    console.log('[Push] ✅ Subscription registered successfully')
    return true
  } catch (error) {
    console.error('[Push] Failed to register subscription:', error)
    return false
  }
}

/**
 * Удаляет push-подписку пользователя
 */
export async function unregisterPushSubscription(userId: string): Promise<boolean> {
  if (typeof window === 'undefined') return false

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()

    if (subscription) {
      await subscription.unsubscribe()
    }

    // Удаляем из базы данных
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)

    if (error) {
      console.error('[Push] Failed to delete subscription:', error)
      return false
    }

    console.log('[Push] ✅ Subscription unregistered')
    return true
  } catch (error) {
    console.error('[Push] Failed to unregister subscription:', error)
    return false
  }
}

/**
 * Конвертирует VAPID ключ из base64 URL в Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map((char) => char.charCodeAt(0)))
}

