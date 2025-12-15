'use client'

import { Sidebar } from '@/components/chat/Sidebar'

export default function ChatPage() {
  return (
    <div className="h-full w-full">
        {/* Mobile: Show sidebar (list) as the main view */}
        <div className="md:hidden h-full w-full">
            <Sidebar />
        </div>
        
        {/* Desktop: Show empty state */}
        <div className="hidden md:flex h-full w-full items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-500">
            <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900 mb-4">
                    <svg className="w-8 h-8 text-blue-500 dark:text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                </div>
                <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">Select a chat to start messaging</h2>
                <p>Send photos and voice messages to your friends.</p>
            </div>
        </div>
    </div>
  )
}



