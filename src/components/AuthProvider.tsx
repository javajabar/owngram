'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/store/useAuthStore'

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const checkUser = useAuthStore((state) => state.checkUser)

  useEffect(() => {
    checkUser()
  }, [checkUser])

  return <>{children}</>
}





