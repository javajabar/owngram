'use client'
import { useEffect } from 'react'
import { Sidebar } from '@/components/chat/Sidebar'
import { useAuthStore } from '@/store/useAuthStore'

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { checkUser } = useAuthStore()

  useEffect(() => {
    // Ensure user session is checked when navigating within chat
    // This helps keep the session fresh during navigation
    checkUser()
  }, [checkUser])

  // Don't check user here - middleware handles auth protection
  // Just ensure session is refreshed on navigation
  return (
    <div className="flex h-screen bg-white dark:bg-black overflow-hidden">
        <aside className="hidden md:block h-full shrink-0">
            <Sidebar />
        </aside>
        <main className="flex-1 h-full min-w-0 relative">
            {children}
        </main>
    </div>
  )
}



