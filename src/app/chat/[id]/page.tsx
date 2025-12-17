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
  const [hasAccess, setHasAccess] = useState(false)

  useEffect(() => {
    checkUser()
  }, [checkUser])

  // Check if user has access to this chat
  useEffect(() => {
    if (!user || !params?.id) {
      if (!loading && !user) {
        router.push('/login')
      }
      return
    }

    const checkAccess = async () => {
      try {
        // Check if user is a member of this chat
        const { data, error } = await supabase
          .from('chat_members')
          .select('chat_id')
          .eq('chat_id', params.id as string)
          .eq('user_id', user.id)
          .maybeSingle()

        if (error) {
          console.error('Error checking chat access:', error)
          router.push('/chat')
          return
        }

        if (!data) {
          // User is not a member of this chat
          router.push('/chat')
          return
        }

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
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-12 w-12 bg-blue-500 rounded-full mb-4"></div>
          <div className="text-gray-500">Loading...</div>
        </div>
      </div>
    )
  }

  if (!user || !hasAccess || !params?.id) {
    return null
  }

  return <ChatWindow chatId={params.id as string} />
}












