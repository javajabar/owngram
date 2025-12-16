'use client'

import { ChatWindow } from '@/components/chat/ChatWindow'
import { useParams } from 'next/navigation'

export default function ChatIdPage() {
  const params = useParams()
  // Ensure we have an ID
  if (!params?.id) return null
  
  return <ChatWindow chatId={params.id as string} />
}









