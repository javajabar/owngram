'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Message, Profile, Chat } from '@/types'
import { useAuthStore } from '@/store/useAuthStore'
import { Send, Mic, ArrowLeft, MoreVertical, Paperclip, Square } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { MessageBubble } from './MessageBubble'

export function ChatWindow({ chatId }: { chatId: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [chat, setChat] = useState<Chat | null>(null)
  const [otherUser, setOtherUser] = useState<Profile | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { user } = useAuthStore()
  const router = useRouter()
  
  // --- Native Audio Recording Logic ---
  const startRecording = async () => {
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          const recorder = new MediaRecorder(stream)
          const chunks: BlobPart[] = []

          recorder.ondataavailable = (e) => {
              if (e.data.size > 0) chunks.push(e.data)
          }

          recorder.onstop = async () => {
              const blob = new Blob(chunks, { type: 'audio/webm' })
              await sendVoiceMessage(blob)
              // Stop all tracks
              stream.getTracks().forEach(track => track.stop())
          }

          recorder.start()
          setMediaRecorder(recorder)
          setIsRecording(true)
      } catch (err) {
          console.error('Mic error:', err)
          alert('Could not access microphone')
      }
  }

  const stopRecording = () => {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop()
          setIsRecording(false)
      }
  }

  const sendVoiceMessage = async (blob: Blob) => {
      if (!user) return
      setIsUploading(true)
      
      try {
          // 1. Upload
          const fileName = `voice-${Date.now()}.webm`
          const { error } = await supabase.storage
            .from('chat-attachments')
            .upload(`${chatId}/${fileName}`, blob, { contentType: 'audio/webm' })

          if (error) throw error

          // 2. Get URL
          const { data: { publicUrl } } = supabase.storage
            .from('chat-attachments')
            .getPublicUrl(`${chatId}/${fileName}`)

          // 3. Send Message
          await supabase.from('messages').insert({
            chat_id: chatId,
            sender_id: user.id,
            content: '🎤 Voice Message',
            attachments: [{ type: 'voice', url: publicUrl }]
          })
      } catch (err) {
          console.error('Voice send error:', err)
          alert('Failed to send voice message')
      } finally {
          setIsUploading(false)
      }
  }
  // ----------------------------------

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (!chatId || !user) return

    // Fetch Chat Info
    supabase.from('chats').select('*').eq('id', chatId).single()
      .then(({ data }) => {
          if (data) {
              setChat(data as Chat)
              // If DM, fetch other user
              if (data.type === 'dm') {
                  supabase.from('chat_members')
                    .select('user_id, profiles(*)')
                    .eq('chat_id', chatId)
                    .neq('user_id', user.id)
                    .single()
                    .then(({ data: memberData }) => {
                        if (memberData?.profiles) setOtherUser(memberData.profiles as unknown as Profile)
                    })
              }
          }
      })

    // Fetch Messages
    supabase.from('messages')
      .select('*, sender:profiles(*)')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setMessages(data as Message[])
      })

    // Realtime
    const channel = supabase.channel(`chat:${chatId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages', 
        filter: `chat_id=eq.${chatId}` 
      }, async (payload) => {
          // Fetch sender info for the new message
          const { data: senderData } = await supabase.from('profiles').select('*').eq('id', payload.new.sender_id).single()
          const newMsg = { ...payload.new, sender: senderData } as Message
          setMessages(prev => {
              // Deduplicate
              if (prev.find(m => m.id === newMsg.id)) return prev
              
              // If I'm the sender, just update the existing optimistic message (if we had one) or add new
              // If I'm NOT the sender, mark as read immediately since I'm looking at the chat
              if (newMsg.sender_id !== user.id) {
                  markAsRead(newMsg.id)
              }
              
              return [...prev, newMsg]
          })
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${chatId}`
      }, (payload) => {
          setMessages(prev => prev.map(msg => 
              msg.id === payload.new.id ? { ...msg, ...payload.new } : msg
          ))
      })
      .subscribe()

    // Mark unread messages as read when entering chat
    const markAllAsRead = async () => {
        await supabase.from('messages')
            .update({ read_at: new Date().toISOString() })
            .eq('chat_id', chatId)
            .neq('sender_id', user.id)
            .is('read_at', null)
    }
    markAllAsRead()

    return () => { supabase.removeChannel(channel) }
  }, [chatId, user])

  const markAsRead = async (messageId: string) => {
      await supabase.from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('id', messageId)
  }

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!newMessage.trim() || !user) return

    const text = newMessage.trim()
    setNewMessage('') // Optimistic clear

    const { error } = await supabase.from('messages').insert({
      chat_id: chatId,
      sender_id: user.id,
      content: text
    })

    if (error) {
        console.error('Error sending:', error)
        setNewMessage(text) // Restore on error
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center px-4 justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
            <button onClick={() => router.push('/chat')} className="md:hidden p-2 -ml-2 text-gray-600 dark:text-gray-300">
                <ArrowLeft className="w-6 h-6" />
            </button>
            <div className="w-10 h-10 bg-gradient-to-tr from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-bold shrink-0">
                {otherUser?.username?.[0]?.toUpperCase() || (chat?.name?.[0] || '?')}
            </div>
            <div className="min-w-0">
                <div className="font-bold text-gray-900 dark:text-white truncate">
                    {chat?.type === 'dm' ? (otherUser?.username || 'User') : (chat?.name || 'Chat')}
                </div>
                <div className="text-xs text-green-500">Online</div>
            </div>
        </div>
        <button className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
            <MoreVertical className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col justify-end min-h-full">
            {messages.length === 0 && (
                <div className="text-center text-gray-400 py-10">No messages yet. Say hi!</div>
            )}
            {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="p-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shrink-0">
        <form onSubmit={sendMessage} className="flex items-center gap-2 max-w-4xl mx-auto">
            <button type="button" className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                <Paperclip className="w-5 h-5" />
            </button>
            <input
                type="text"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                placeholder="Message..."
                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-800 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white transition-all"
            />
            {newMessage.trim() ? (
                <button type="submit" className="p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-full transition-all active:scale-95 shadow-md">
                    <Send className="w-5 h-5" />
                </button>
            ) : (
                <div className="relative flex items-center">
                    {isRecording ? (
                        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-full animate-pulse">
                            <span className="text-xs text-red-500 font-bold">Recording...</span>
                            <button 
                                type="button" 
                                onClick={stopRecording}
                                className="p-3 bg-red-500 hover:bg-red-600 text-white rounded-full transition-all active:scale-95 shadow-md"
                            >
                                {isUploading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Square className="w-4 h-4 fill-current" />}
                            </button>
                        </div>
            ) : (
                <button 
                    type="button" 
                            onClick={startRecording}
                    className="p-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full transition-all active:scale-95"
                >
                    <Mic className="w-5 h-5" />
                </button>
                    )}
                </div>
            )}
        </form>
      </div>
    </div>
  )
}

