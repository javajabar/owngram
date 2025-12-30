'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ChatWindow } from '@/components/chat/ChatWindow'
import { useAuthStore } from '@/store/useAuthStore'
import { supabase } from '@/lib/supabase'

export default function ChatIdPage() {
  const params = useParams()
  const router = useRouter()
  const { user, loading, checkUser } = useAuthStore()
  const [checkingAccess, setCheckingAccess] = useState(true)
  const [hasAccess, setHasAccess] = useState(true) // Optimistic access
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'member' | null>(null)

  useEffect(() => {
    checkUser()
  }, [checkUser])

  const [resolvedChatId, setResolvedChatId] = useState<string | null>(null)

  // Check if user has access to this chat and resolve chat ID
  useEffect(() => {
    if (!user || !params?.id) {
      if (!loading && !user) {
        router.push('/login')
      }
      return
    }

    const checkAccess = async () => {
      try {
        // First, find the chat by short_id (from URL)
        const shortId = parseInt(params.id as string, 10)
        let chatId: string | null = null

        if (isNaN(shortId)) {
          // If not a number, try to find by UUID (for backward compatibility)
          const { data: chatByUuid } = await supabase
            .from('chats')
            .select('id')
            .eq('id', params.id as string)
            .maybeSingle()
          
          if (!chatByUuid) {
            router.push('/chat')
            return
          }
          
          chatId = chatByUuid.id
        } else {
          // Find chat by short_id
          const { data: chatData, error: chatError } = await supabase
            .from('chats')
            .select('id')
            .eq('short_id', shortId)
            .maybeSingle()

          if (chatError || !chatData) {
            console.error('Error finding chat by short_id:', chatError)
            router.push('/chat')
            return
          }

          chatId = chatData.id
        }

        if (!chatId) {
          router.push('/chat')
          return
        }

        // Check if user is a member of this chat and get their role
        const { data, error } = await supabase
          .from('chat_members')
          .select('chat_id, role')
          .eq('chat_id', chatId)
          .eq('user_id', user.id)
          .maybeSingle()

        if (error) {
          console.error('Error checking chat access:', error)
          router.push('/chat')
          return
        }

        if (!data) {
          // User is not a member of this chat - redirect to main screen
          router.push('/chat')
          return
        }

        setUserRole(data.role as any || 'member')
        setResolvedChatId(chatId)
        setHasAccess(true)
      } catch (error) {
        console.error('Error checking chat access:', error)
        router.push('/chat')
      } finally {
        setCheckingAccess(false)
      }
    }

    checkAccess()
  }, [user, params?.id, loading, router])

  if (loading || checkingAccess) {
    return null // Silent loading
  }

  if (!hasAccess || !resolvedChatId) {
    return null
  }

  return <ChatWindow chatId={resolvedChatId} userRole={userRole} />
}












