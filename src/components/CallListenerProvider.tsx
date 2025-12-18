'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/useAuthStore'
import { useCallStore } from '@/store/useCallStore'
import { useRouter } from 'next/navigation'
import { soundManager } from '@/lib/sounds'

export default function CallListenerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  const { setIncomingCall } = useCallStore()
  const router = useRouter()

  useEffect(() => {
    if (!user?.id) {
      console.log('📞 Call listener: no user, skipping setup')
      return
    }

    const currentUserId = user.id
    console.log('📞 Setting up global call listener for user:', currentUserId)

    // Global listener for incoming calls (works from anywhere, independent of UI)
    const globalCallChannel = supabase
      .channel(`global-calls-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_signals',
          filter: `to_user_id=eq.${currentUserId}`,
        },
        async (payload) => {
          const signal = payload.new as any
          console.log('📞 Global call signal received:', {
            type: signal.signal_type,
            from: signal.from_user_id,
            to: signal.to_user_id,
            chatId: signal.chat_id,
            currentUser: currentUserId
          })
          
          // Only handle call-request signals
          if (signal.signal_type === 'call-request') {
            console.log('📞 Incoming call detected globally, processing...')
            
            // Check if it's a DM chat
            const { data: chatData } = await supabase
              .from('chats')
              .select('type')
              .eq('id', signal.chat_id)
              .single()
            
            if (chatData && chatData.type === 'dm') {
              console.log('✅ DM chat confirmed, handling incoming call...')
              
              // Play ringing sound immediately
              soundManager.startCallRinging()
              
              // Store incoming call in global state (works even if ChatWindow not loaded yet)
              setIncomingCall(signal.chat_id, signal.from_user_id)
              
              // Redirect to the chat
              router.push(`/chat/${signal.chat_id}`)
              
              // Also dispatch custom event for immediate handling if ChatWindow is already loaded
              setTimeout(() => {
                console.log('📢 Dispatching incomingCall event...')
                window.dispatchEvent(new CustomEvent('incomingCall', {
                  detail: {
                    chatId: signal.chat_id,
                    fromUserId: signal.from_user_id
                  }
                }))
              }, 100)
              
              // Retry after longer delay in case navigation takes time
              setTimeout(() => {
                console.log('📢 Dispatching incomingCall event (retry)...')
                window.dispatchEvent(new CustomEvent('incomingCall', {
                  detail: {
                    chatId: signal.chat_id,
                    fromUserId: signal.from_user_id
                  }
                }))
              }, 500)
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Global call channel subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to global call signals')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to global call signals')
        }
      })

    return () => {
      console.log('🧹 Cleaning up global call listener')
      supabase.removeChannel(globalCallChannel)
    }
  }, [user?.id, router, setIncomingCall])

  return <>{children}</>
}

