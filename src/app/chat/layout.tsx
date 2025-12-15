'use client'
import { Sidebar } from '@/components/chat/Sidebar'

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode
}) {
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


