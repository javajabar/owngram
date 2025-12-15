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
  const [unreadCount, setUnreadCount] = useState(0)
  const [isTyping, setIsTyping] = useState(false)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)
  
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

    // Fetch Messages with replies
    supabase.from('messages')
      .select('*, sender:profiles(*), reply_to:messages!messages_reply_to_id_fkey(*, sender:profiles(*))')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) {
          // Map messages and set reply_to, filter out messages deleted for all
          const mappedMessages = data
            .filter((msg: any) => {
              // Don't show messages deleted for all
              if (msg.deleted_at && msg.deleted_for_all) return false
              return true
            })
            .map((msg: any) => ({
              ...msg,
              reply_to: msg.reply_to || null
            })) as Message[]
          setMessages(mappedMessages)
        }
      })

    // Realtime
    const channel = supabase.channel(`chat:${chatId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages', 
        filter: `chat_id=eq.${chatId}` 
      }, async (payload) => {
          // Skip deleted messages
          if (payload.new.deleted_at) return
          
          // Fetch sender info and reply_to for the new message
          const { data: senderData } = await supabase.from('profiles').select('*').eq('id', payload.new.sender_id).single()
          let replyTo = null
          if (payload.new.reply_to_id) {
            const { data: replyData } = await supabase
              .from('messages')
              .select('*, sender:profiles(*)')
              .eq('id', payload.new.reply_to_id)
              .single()
            replyTo = replyData as Message | null
          }
          const newMsg = { ...payload.new, sender: senderData, reply_to: replyTo } as Message
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
          // If message was deleted, remove it from the list
          if (payload.new.deleted_at) {
            setMessages(prev => prev.filter(msg => msg.id !== payload.new.id))
          } else {
            // Update message
            setMessages(prev => prev.map(msg => 
              msg.id === payload.new.id ? { ...msg, ...payload.new } : msg
            ))
          }
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
      .on('broadcast', { event: 'typing' }, (payload) => {
          // Only show typing if it's from the other user
          if (payload.payload.user_id !== user.id) {
              setIsTyping(payload.payload.is_typing)
              // Auto-hide after 3 seconds
              if (payload.payload.is_typing) {
                  setTimeout(() => setIsTyping(false), 3000)
              }
          }
      })
      .subscribe()

    // Mark unread messages as read when entering chat
    const markAllAsRead = async () => {
        await supabase.from('messages')
            .update({ read_at: new Date().toISOString() })
            .eq('chat_id', chatId)
            .neq('sender_id', user.id)
            .is('read_at', null)
        
        // Update unread count
        const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('chat_id', chatId)
            .neq('sender_id', user.id)
            .is('read_at', null)
        setUnreadCount(count || 0)
    }
    markAllAsRead()
    
    // Update unread count periodically
    const updateUnreadCount = async () => {
        const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('chat_id', chatId)
            .neq('sender_id', user.id)
            .is('read_at', null)
        setUnreadCount(count || 0)
    }
    
    // Update unread count when messages change
    const unreadInterval = setInterval(updateUnreadCount, 2000)
    
    // Cleanup on unmount
    return () => { 
        supabase.removeChannel(channel)
        if (unreadInterval) clearInterval(unreadInterval)
    }
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
    
    // If editing, update message instead of creating new
    if (editingMessage) {
      const { error } = await supabase
        .from('messages')
        .update({ 
          content: text,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingMessage.id)
        .eq('sender_id', user.id) // Only allow editing own messages
      
      if (error) {
        console.error('Error updating message:', error)
        alert('Ошибка при редактировании сообщения')
      } else {
        setEditingMessage(null)
        setNewMessage('')
        setReplyingTo(null)
      }
      return
    }

    // Create new message
    setNewMessage('') // Optimistic clear
    setReplyingTo(null)

    const { error } = await supabase.from('messages').insert({
      chat_id: chatId,
      sender_id: user.id,
      content: text,
      reply_to_id: replyingTo?.id || null
    })

    if (error) {
        console.error('Error sending:', error)
        setNewMessage(text) // Restore on error
    }
  }

  const deleteMessage = async (messageId: string, deleteForAll: boolean) => {
    if (!user) return
    
    try {
      if (deleteForAll) {
        // Delete for everyone
        const { error } = await supabase
          .from('messages')
          .update({ 
            deleted_at: new Date().toISOString(),
            deleted_for_all: true,
            content: 'Сообщение удалено'
          })
          .eq('id', messageId)
          .eq('sender_id', user.id) // Only sender can delete for all
        
        if (error) throw error
      } else {
        // Delete only for current user (soft delete by marking as deleted)
        // We'll need to track this differently - maybe add a deleted_by_user_ids array
        // For now, we'll use a simple approach: mark as deleted for this user
        // This requires a more complex schema, so for MVP we'll just delete for all
        const { error } = await supabase
          .from('messages')
          .update({ 
            deleted_at: new Date().toISOString(),
            deleted_for_all: false
          })
          .eq('id', messageId)
        
        if (error) throw error
      }
    } catch (error) {
      console.error('Error deleting message:', error)
      alert('Ошибка при удалении сообщения')
    }
  }

  const editMessage = (message: Message) => {
    if (message.sender_id !== user?.id) return
    setEditingMessage(message)
    setNewMessage(message.content)
    setReplyingTo(null)
    // Scroll to input
    setTimeout(() => {
      const input = document.querySelector('input[type="text"]') as HTMLInputElement
      input?.focus()
    }, 100)
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center px-4 justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3 flex-1 min-w-0">
            <button onClick={() => router.push('/chat')} className="md:hidden p-2 -ml-2 text-gray-600 dark:text-gray-300 shrink-0">
                <ArrowLeft className="w-6 h-6" />
            </button>
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 overflow-hidden bg-gradient-to-tr from-blue-400 to-purple-500">
                {otherUser?.avatar_url ? (
                    <img src={otherUser.avatar_url} className="w-full h-full object-cover" alt={otherUser.username || 'User'} />
                ) : (
                    <span className="text-white font-bold text-lg">
                        {(chat?.type === 'dm' ? (otherUser?.username?.[0] || otherUser?.full_name?.[0]) : (chat?.name?.[0])) || '?'}
                    </span>
                )}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <div className="font-bold text-gray-900 dark:text-white truncate">
                        {chat?.type === 'dm' 
                            ? (otherUser?.username || otherUser?.full_name || 'User')
                            : (chat?.name || 'Chat')
                        }
                    </div>
                    {unreadCount > 0 && (
                        <div className="bg-blue-500 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center shrink-0">
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </div>
                    )}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {isTyping ? (
                        <span className="text-blue-500 flex items-center gap-1">
                            <span>печатает</span>
                            <span className="flex gap-0.5">
                                <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                                <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                                <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                            </span>
                        </span>
                    ) : (
                        <span className="text-green-500">Online</span>
                    )}
                </div>
            </div>
        </div>
        <button className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full shrink-0">
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
                <MessageBubble 
                    key={msg.id} 
                    message={msg} 
                    onReply={(message) => {
                        setReplyingTo(message)
                        setEditingMessage(null)
                        setTimeout(() => {
                            const input = document.querySelector('input[type="text"]') as HTMLInputElement
                            input?.focus()
                        }, 100)
                    }}
                    onEdit={(message) => editMessage(message)}
                    onDelete={(messageId, deleteForAll) => deleteMessage(messageId, deleteForAll)}
                />
            ))}
            <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Reply/Edit Preview */}
      {(replyingTo || editingMessage) && (
        <div className="px-4 py-2 bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            {replyingTo && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Ответ на: <span className="font-medium">{replyingTo.sender?.username || replyingTo.sender?.full_name || 'User'}</span>
                <span className="ml-2 text-gray-400 truncate">{replyingTo.content.substring(0, 50)}...</span>
              </div>
            )}
            {editingMessage && (
              <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                Редактирование сообщения
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setReplyingTo(null)
              setEditingMessage(null)
              setNewMessage('')
            }}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input */}
      <div className="p-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shrink-0">
        <form onSubmit={sendMessage} className="flex items-center gap-2 max-w-4xl mx-auto">
            <button type="button" className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                <Paperclip className="w-5 h-5" />
            </button>
            <input
                type="text"
                value={newMessage}
                onChange={e => {
                    setNewMessage(e.target.value)
                }}
                onInput={(e) => {
                    // Send typing indicator when user types
                    const value = (e.target as HTMLInputElement).value
                    if (value.trim() && chatId && user) {
                        // Use the existing channel to send typing event
                        const typingChannel = supabase.channel(`chat:${chatId}`)
                        typingChannel.send({
                            type: 'broadcast',
                            event: 'typing',
                            payload: { user_id: user.id, is_typing: true }
                        })
                        
                        // Clear previous timeout
                        const timeoutKey = `typingTimeout_${chatId}`
                        if ((window as any)[timeoutKey]) {
                            clearTimeout((window as any)[timeoutKey])
                        }
                        
                        // Stop typing after 2 seconds of no input
                        ;(window as any)[timeoutKey] = setTimeout(() => {
                            typingChannel.send({
                                type: 'broadcast',
                                event: 'typing',
                                payload: { user_id: user.id, is_typing: false }
                            })
                        }, 2000)
                    }
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage(e)
                        setIsTyping(false)
                    }
                }}
                placeholder={editingMessage ? "Редактировать сообщение..." : replyingTo ? "Ответить..." : "Message..."}
                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-800 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white transition-all"
            />
            {newMessage.trim() ? (
                <button type="submit" className="p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-full transition-all active:scale-95 shadow-md">
                    {editingMessage ? <span className="text-sm">✓</span> : <Send className="w-5 h-5" />}
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

