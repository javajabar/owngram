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
        // Check if user is a member of this chat and get their role
        const { data, error } = await supabase
          .from('chat_members')
          .select('chat_id, role')
          .eq('chat_id', params.id as string)
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

  if (!hasAccess || !params?.id) {
    return null
  }

  return <ChatWindow chatId={params.id as string} userRole={userRole} />
}












