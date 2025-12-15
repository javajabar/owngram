'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/useAuthStore'

export default function Home() {
  const router = useRouter()
  const { user, loading, error, checkUser } = useAuthStore()

  useEffect(() => {
    checkUser()
  }, [checkUser])

  useEffect(() => {
    if (loading) return // Still checking auth

    if (user) {
      router.push('/chat')
    } else {
      router.push('/login')
    }
  }, [user, loading, router])

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="text-red-500 mb-4">Ошибка авторизации: {error}</div>
          <button
            onClick={() => router.push('/login')}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Перейти к входу
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="animate-pulse flex flex-col items-center">
        <div className="h-12 w-12 bg-blue-500 rounded-full mb-4"></div>
        <div className="text-gray-500">Loading OwnGram...</div>
      </div>
    </div>
  )
}
