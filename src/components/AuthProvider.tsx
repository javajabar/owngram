'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/store/useAuthStore'
import { soundManager } from '@/lib/sounds'
import { registerServiceWorker } from '@/lib/notifications'
import { registerPushSubscription } from '@/lib/push-subscription'

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const checkUser = useAuthStore((state) => state.checkUser)

  useEffect(() => {
    checkUser()

    // Register Service Worker for notifications (required for iOS)
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      registerServiceWorker()
        .then(async (registration) => {
          if (registration) {
            // После регистрации SW, регистрируем push-подписку
            const user = useAuthStore.getState().user
            if (user?.id) {
              console.log('[AuthProvider] Registering push subscription for user:', user.id)
              await registerPushSubscription(user.id)
            }
          }
        })
        .catch((error) => {
          console.error('Failed to register Service Worker:', error)
        })
    }

    // Unlock audio context on first user interaction
    const unlockAudio = () => {
      soundManager.init()
      window.removeEventListener('click', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
      window.removeEventListener('touchstart', unlockAudio)
    }

    window.addEventListener('click', unlockAudio)
    window.addEventListener('keydown', unlockAudio)
    window.addEventListener('touchstart', unlockAudio)

    return () => {
      window.removeEventListener('click', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
      window.removeEventListener('touchstart', unlockAudio)
    }
  }, [checkUser])

  return <>{children}</>
}








