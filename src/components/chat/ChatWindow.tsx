'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Message, Profile, Chat } from '@/types'
import { useAuthStore } from '@/store/useAuthStore'
import { useCallStore } from '@/store/useCallStore'
import { Send, Mic, ArrowLeft, MoreVertical, Paperclip, Square, X, Search, Phone, Users, Camera, Share2, Copy, CheckCircle2, UserPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { MessageBubble } from './MessageBubble'
import { ImageViewer } from '@/components/ImageViewer'
import { CallModal } from './CallModal'
import { soundManager } from '@/lib/sounds'
import { WebRTCHandler } from '@/lib/webrtc'
import { profileCache } from '@/lib/cache'

// Format last seen time
function formatLastSeen(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  if (diffMins < 1) return 'только что'
  if (diffMins < 60) return `${diffMins} мин назад`
  if (diffHours < 24) return `${diffHours} ч назад`
  if (diffDays === 1) return 'вчера'
  if (diffDays < 7) return `${diffDays} дн назад`
  
  return date.toLocaleDateString('ru-RU', { 
    day: 'numeric', 
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

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
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map())
  const [groupMembers, setGroupMembers] = useState<Profile[]>([])
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set())
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [showForwardModal, setShowForwardModal] = useState(false)
  const [forwardingTargetChatId, setForwardingTargetChatId] = useState<string | null>(null)
  const [userChats, setUserChats] = useState<any[]>([])
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteSearchQuery, setInviteSearchQuery] = useState('')
  const [availableForInvite, setAvailableForInvite] = useState<Profile[]>([])
  const [isInviting, setIsInviting] = useState(false)
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)
  const [showProfile, setShowProfile] = useState(false)
  const [isOnline, setIsOnline] = useState(false)
  const [lastSeen, setLastSeen] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Message[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [viewingImage, setViewingImage] = useState<string | null>(null)
  const [viewingAvatar, setViewingAvatar] = useState<string | null>(null)
  const [isBlockedByMe, setIsBlockedByMe] = useState(false)
  const [isBlockingMe, setIsBlockingMe] = useState(false)
  
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null)
  
  // Pagination State
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const MESSAGES_PER_PAGE = 50
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isCalling, setIsCalling] = useState(false)
  const [incomingCall, setIncomingCall] = useState(false)
  const [isInCall, setIsInCall] = useState(false)
  const [callStartTime, setCallStartTime] = useState<number | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const webrtcHandlerRef = useRef<WebRTCHandler | null>(null)
  const callChannelRef = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Refs for stable call listener
  const callStateRef = useRef({ isCalling, incomingCall, isInCall, otherUser })
  useEffect(() => {
    callStateRef.current = { isCalling, incomingCall, isInCall, otherUser }
  }, [isCalling, incomingCall, isInCall, otherUser])
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { user } = useAuthStore()
  const { incomingCall: globalIncomingCall, clearIncomingCall } = useCallStore()
  const router = useRouter()
  
  // Check block status
  const checkBlockStatus = useCallback(async () => {
    if (!user || !otherUser || chat?.type !== 'dm') {
      setIsBlockedByMe(false)
      setIsBlockingMe(false)
      return
    }

    try {
      const { data: blockedByMe } = await supabase
        .from('blocked_users')
        .select('*')
        .eq('blocker_id', user.id)
        .eq('blocked_id', otherUser.id)
        .maybeSingle()
      
      const { data: blockingMe } = await supabase
        .from('blocked_users')
        .select('*')
        .eq('blocker_id', otherUser.id)
        .eq('blocked_id', user.id)
        .maybeSingle()

      setIsBlockedByMe(!!blockedByMe)
      setIsBlockingMe(!!blockingMe)
    } catch (error) {
      console.error('Error checking block status:', error)
    }
  }, [user?.id, otherUser?.id, chat?.type])

  useEffect(() => {
    checkBlockStatus()
    
    // Subscribe to block status changes
    const blockChannel = supabase.channel(`blocks:${chatId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'blocked_users'
      }, () => {
        checkBlockStatus()
      })
      .subscribe()
    
    return () => {
      supabase.removeChannel(blockChannel)
    }
  }, [checkBlockStatus, chatId])
  
  // Update my online status periodically (removed - handled globally in Sidebar)
  // This prevents duplicate updates
  
  // Check other user's online status (only if column exists)
  useEffect(() => {
    if (!otherUser || otherUser.id === user?.id) return
    
    // Check if last_seen_at exists in the profile
    if (!('last_seen_at' in otherUser) || !otherUser.last_seen_at) {
      // Column doesn't exist or is null, show offline
      setIsOnline(false)
      setLastSeen(null)
      return
    }
    
    const checkOnlineStatus = (lastSeenValue?: string) => {
      const lastSeenAt = lastSeenValue || otherUser.last_seen_at
      if (lastSeenAt) {
        const lastSeenDate = new Date(lastSeenAt)
        const now = new Date()
        const diffMinutes = (now.getTime() - lastSeenDate.getTime()) / 60000
        
        setIsOnline(diffMinutes < 2) // Online if active in last 2 minutes
        setLastSeen(lastSeenAt)
      } else {
        setIsOnline(false)
        setLastSeen(null)
      }
    }
    
    checkOnlineStatus()
    
    // Subscribe to profile changes (only if column exists) - real-time updates
    const channel = supabase.channel(`profile:${otherUser.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${otherUser.id}`
      }, (payload) => {
        const updated = payload.new as Profile
        setOtherUser(prev => prev ? { ...prev, ...updated } : null)
        // Immediately update status when we get real-time update
        if ('last_seen_at' in updated && updated.last_seen_at) {
          checkOnlineStatus(updated.last_seen_at)
        } else {
          setIsOnline(false)
          setLastSeen(null)
        }
      })
      .subscribe()
    
    // Check status every 10 seconds (fallback if real-time fails)
    const interval = setInterval(() => checkOnlineStatus(), 10000)
    
    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [otherUser?.id, user?.id])
  
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
          // Play sound when recording starts
          soundManager.playRecordingStart()
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
            attachments: [{ type: 'voice', url: publicUrl }],
            delivered_at: new Date().toISOString() // Голосовое сообщение доставлено (1 галочка)
          })
          
          // Play sound when voice message is sent
          soundManager.playMessageSent()
      } catch (err) {
          console.error('Voice send error:', err)
          alert('Failed to send voice message')
      } finally {
          setIsUploading(false)
      }
  }
  // ----------------------------------

  const handleToggleSelection = (messageId: string) => {
    setSelectedMessageIds(prev => {
      const next = new Set(prev)
      if (next.has(messageId)) {
        next.delete(messageId)
      } else {
        if (next.size < 100) {
          next.add(messageId)
        }
      }
      return next
    })
  }

  const handleStartSelection = (messageId: string) => {
    setIsSelectionMode(true)
    setSelectedMessageIds(new Set([messageId]))
  }

  const handleForwardMessages = async (targetChatId: string) => {
    if (!user || selectedMessageIds.size === 0) return

    try {
      const messagesToForward = messages.filter(m => selectedMessageIds.has(m.id))
      
      for (const msg of messagesToForward) {
        await supabase.from('messages').insert({
          chat_id: targetChatId,
          sender_id: user.id,
          content: msg.content,
          attachments: msg.attachments,
          forwarded_from_id: msg.sender_id,
          delivered_at: new Date().toISOString()
        })
      }

      setIsSelectionMode(false)
      setSelectedMessageIds(new Set())
      setShowForwardModal(false)
      
      if (targetChatId === chatId) {
        // Already in this chat, it will update via realtime
      } else {
        router.push(`/chat/${targetChatId}`)
      }
    } catch (err) {
      console.error('Error forwarding messages:', err)
      alert('Ошибка при пересылке сообщений')
    }
  }

  const fetchUserChats = async () => {
    if (!user) return
    const { data: memberships } = await supabase.from('chat_members').select('chat_id').eq('user_id', user.id)
    if (!memberships) return
    
    const chatIds = memberships.map(m => m.chat_id)
    const { data: chatsData } = await supabase.from('chats').select('*').in('id', chatIds)
    const { data: members } = await supabase.from('chat_members').select('chat_id, user_id, profiles!user_id(*)').in('chat_id', chatIds)
    
    const processed = chatsData?.map(c => {
      let name = c.name
      let avatar = c.avatar_url
      if (c.type === 'dm') {
        const other = members?.find(m => m.chat_id === c.id && m.user_id !== user.id)
        const profile = other?.profiles as any
        name = profile?.full_name || profile?.username || 'User'
        avatar = profile?.avatar_url
      }
      return { ...c, displayName: name, displayAvatar: avatar }
    })
    setUserChats(processed || [])
  }

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string)
      setSelectedAvatarFile(file)
    }
    reader.readAsDataURL(file)
  }

  const handleUploadAvatar = async () => {
    if (!selectedAvatarFile || !chatId) return

    try {
      setIsUploadingAvatar(true)
      const fileExt = selectedAvatarFile.name.split('.').pop()
      const fileName = `${chatId}-${Date.now()}.${fileExt}`
      const filePath = `avatars/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, selectedAvatarFile)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      const { error: updateError } = await supabase
        .from('chats')
        .update({ avatar_url: publicUrl })
        .eq('id', chatId)

      if (updateError) throw updateError

      setChat(prev => prev ? { ...prev, avatar_url: publicUrl } : null)
      setAvatarPreview(null)
      setSelectedAvatarFile(null)
      alert('Фото группы обновлено!')
    } catch (err: any) {
      console.error('Error uploading group avatar:', err)
      alert('Ошибка при загрузке фото: ' + err.message)
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleAddReaction = async (messageId: string, emoji: string) => {
    if (!user) return
    const message = messages.find(m => m.id === messageId)
    if (!message) return

    const reactions = { ...(message.reactions || {}) }
    const userIds = [...(reactions[emoji] || [])]
    
    if (userIds.includes(user.id)) {
      reactions[emoji] = userIds.filter(id => id !== user.id)
      if (reactions[emoji].length === 0) delete reactions[emoji]
    } else {
      // Remove other reactions from this user (Telegram style)
      Object.keys(reactions).forEach(key => {
        reactions[key] = reactions[key].filter(id => id !== user.id)
        if (reactions[key].length === 0) delete reactions[key]
      })
      reactions[emoji] = [...(reactions[emoji] || []), user.id]
    }

    try {
      await supabase.from('messages').update({ reactions }).eq('id', messageId)
      // Local state will update via Realtime
    } catch (err) {
      console.error('Error updating reaction:', err)
    }
  }

  const handleInviteUser = async (userId: string) => {
    if (!chatId) return
    setIsInviting(true)
    try {
      const { error } = await supabase
        .from('chat_members')
        .insert({ chat_id: chatId, user_id: userId })
      
      if (error) throw error
      
      // Update local members list
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single()
      if (profile) {
        setGroupMembers(prev => [...prev, profile as Profile])
      }
      
      setShowInviteModal(false)
      setInviteSearchQuery('')
    } catch (err: any) {
      console.error('Error inviting user:', err)
      alert('Пользователь уже в группе или произошла ошибка')
    } finally {
      setIsInviting(false)
    }
  }

  const navigateToUserChat = async (userId: string) => {
    if (!user || userId === user.id) return
    
    // Check if DM already exists
    const { data: myChatMembers } = await supabase
      .from('chat_members')
      .select('chat_id')
      .eq('user_id', user.id)
    
    if (myChatMembers && myChatMembers.length > 0) {
      const myChatIds = myChatMembers.map(m => m.chat_id)
      const { data: commonChats } = await supabase
        .from('chat_members')
        .select('chat_id, chats!inner(type)')
        .eq('user_id', userId)
        .in('chat_id', myChatIds)
        .eq('chats.type', 'dm')
        .limit(1)
      
      if (commonChats && commonChats.length > 0) {
        setShowProfile(false)
        router.push(`/chat/${commonChats[0].chat_id}`)
        return
      }
    }

    // Create new DM if not found
    try {
      const { data: chatData, error: chatError } = await supabase
        .from('chats')
        .insert({ type: 'dm' })
        .select()
        .single()
      
      if (chatError) throw chatError
      if (!chatData) return
      
      await supabase.from('chat_members').insert([
        { chat_id: chatData.id, user_id: user.id },
        { chat_id: chatData.id, user_id: userId }
      ])
      
      setShowProfile(false)
      router.push(`/chat/${chatData.id}`)
    } catch (err) {
      console.error('Error creating chat for navigation:', err)
    }
  }

  const fetchUsersForInvite = async (query: string) => {
    if (!query.trim() || !user) return
    const cleanQuery = query.replace('@', '').trim()
    
    // Get current members to exclude them
    const memberIds = groupMembers.map(m => m.id)
    
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', user.id)
      .not('id', 'in', `(${memberIds.join(',')})`)
      .ilike('username', `%${cleanQuery}%`)
      .limit(10)
    
    if (data) setAvailableForInvite(data as Profile[])
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (inviteSearchQuery) fetchUsersForInvite(inviteSearchQuery)
      else setAvailableForInvite([])
    }, 300)
    return () => clearTimeout(timer)
  }, [inviteSearchQuery])

  useEffect(() => {
    if (showForwardModal) fetchUserChats()
  }, [showForwardModal])

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
              // If DM, fetch other user (or self for "Избранное")
              if (data.type === 'dm') {
                  supabase.from('chat_members')
                    .select('user_id, profiles!user_id(*)')
                    .eq('chat_id', chatId)
                    .neq('user_id', user.id)
                    .maybeSingle()
                    .then(({ data: memberData }) => {
                        if (memberData?.profiles) {
                            setOtherUser(memberData.profiles as unknown as Profile)
                        } else {
                            // If no other user found, this might be "Избранное" (self-chat)
                            // Set otherUser to current user
                            supabase.from('profiles')
                                .select('*')
                                .eq('id', user.id)
                                .single()
                                .then(({ data: selfProfile }) => {
                                    if (selfProfile) setOtherUser(selfProfile as Profile)
                                })
                        }
                    })
              } else if (data.type === 'group') {
                  // Fetch all members for group
                  supabase.from('chat_members')
                    .select('user_id, profiles!user_id(*)')
                    .eq('chat_id', chatId)
                    .then(({ data: membersData }) => {
                        if (membersData) {
                            const profiles = membersData
                                .map(m => m.profiles as unknown as Profile)
                                .filter(Boolean)
                            setGroupMembers(profiles)
                        }
                    })
              }
          }
      })

    // Fetch Messages
    const fetchInitialMessages = async () => {
      setHasMore(true)
      const { data, error } = await supabase.from('messages')
      .select('*, sender:profiles!sender_id(*), forwarded_from:profiles!forwarded_from_id(*)')
      .eq('chat_id', chatId)
        .order('created_at', { ascending: false }) // Get latest first for pagination
        .limit(MESSAGES_PER_PAGE)
      
        if (error) {
          console.error('Error fetching messages:', error)
          setMessages([])
          return
        }
        
        if (data) {
          const mappedMessages = data
          .filter((msg: any) => !(msg.deleted_at && msg.deleted_for_all))
          .map((msg: any) => ({ ...msg, reply_to: null }))
          .reverse() as Message[] // Reverse back to chronological order
        
          setMessages(mappedMessages)
        setHasMore(data.length === MESSAGES_PER_PAGE)
        
        // Initial scroll to bottom
        setTimeout(scrollToBottom, 100)
      }
    }

    fetchInitialMessages()

    // Realtime
    const channel = supabase.channel(`chat:${chatId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages', 
        filter: `chat_id=eq.${chatId}` 
      }, async (payload) => {
          console.log('New message received:', payload.new.id)
          // Skip deleted messages
          if (payload.new.deleted_at) return
          
          // Fetch sender info from cache or DB
          const senderData = await profileCache.fetch(payload.new.sender_id, supabase)
          let forwardedFrom = null
          if (payload.new.forwarded_from_id) {
            forwardedFrom = await profileCache.fetch(payload.new.forwarded_from_id, supabase)
          }
          
          let replyTo = null
          if (payload.new.reply_to_id) {
            const { data: replyData } = await supabase
              .from('messages')
              .select('*, sender:profiles!sender_id(*)')
              .eq('id', payload.new.reply_to_id)
              .single()
            replyTo = replyData as Message | null
          }
          const newMsg = { 
            ...payload.new, 
            sender: senderData, 
            forwarded_from: forwardedFrom,
            reply_to: replyTo, 
            status: 'sent' 
          } as Message
          setMessages(prev => {
              const existingIndex = prev.findIndex(m => m.id === newMsg.id)
              
              if (existingIndex !== -1) {
                console.log('✅ Updating optimistic message with server data:', newMsg.id)
                const updated = [...prev]
                updated[existingIndex] = { ...updated[existingIndex], ...newMsg }
                return updated
              }
              
              console.log('➕ Adding new message to list:', newMsg.id)
              
              // If I'm the sender, just update the existing optimistic message (if we had one) or add new
              // If I'm NOT the sender, mark as read immediately since I'm looking at the chat
              if (newMsg.sender_id !== user.id) {
                  // Update delivered_at if not set (should be set by sender, but just in case)
                  if (!newMsg.delivered_at) {
                      newMsg.delivered_at = new Date().toISOString()
                  }
                  // Mark as read immediately
                  markAsRead(newMsg.id)
                  // Keep unread count at 0 since we're viewing the chat
                  setUnreadCount(0)
              }
              
              // Scroll to bottom when new message arrives
              setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
              }, 100)
              
              // Play sound when receiving a message (only if not from current user)
              if (newMsg.sender_id !== user?.id) {
                soundManager.playMessageReceived()
              }
              
              return [...prev, newMsg]
          })
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${chatId}`
      }, async (payload) => {
          console.log('Message updated:', payload.new.id)
          // If message was deleted, remove it from the list
          if (payload.new.deleted_at && payload.new.deleted_for_all) {
            setMessages(prev => prev.filter(msg => msg.id !== payload.new.id))
          } else {
            // Update message - fetch full data including sender (simple query without foreign key join)
            try {
              const { data: updatedMessage } = await supabase
                .from('messages')
                .select('*, sender:profiles!sender_id(*)')
                .eq('id', payload.new.id)
                .single()
              
              if (updatedMessage) {
                setMessages(prev => prev.map(msg => 
                  msg.id === payload.new.id ? { ...msg, ...updatedMessage, reply_to: null } as Message : msg
                ))
              } else {
                // Fallback: update with payload data (includes read_at, delivered_at)
                setMessages(prev => prev.map(msg => 
                  msg.id === payload.new.id ? { 
                    ...msg, 
                    ...payload.new,
                    // Preserve sender if not in payload
                    sender: payload.new.sender || msg.sender
                  } as Message : msg
                ))
              }
            } catch (error) {
              console.error('Error updating message:', error)
              // Fallback: just update with payload data
              setMessages(prev => prev.map(msg => 
                msg.id === payload.new.id ? { ...msg, ...payload.new } : msg
              ))
            }
          }
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${chatId}`
      }, (payload) => {
          console.log('Message deleted:', payload.old.id)
          setMessages(prev => prev.filter(msg => msg.id !== payload.old.id))
      })
      .on('broadcast', { event: 'typing' }, async (payload) => {
          // Only show typing if it's from another user
          if (payload.payload.user_id !== user.id) {
              const userId = payload.payload.user_id
              const isTypingNow = payload.payload.is_typing
              
              if (isTypingNow) {
                  // Fetch name if not in typingUsers
                  let name = typingUsers.get(userId)
                  if (!name) {
                      const profile = await profileCache.fetch(userId, supabase)
                      name = profile?.full_name || profile?.username?.replace(/^@+/, '') || 'Кто-то'
                  }
                  
                  setTypingUsers(prev => {
                      const next = new Map(prev)
                      next.set(userId, name!)
                      return next
                  })
                  
                  // Auto-hide after 3 seconds
                  setTimeout(() => {
                      setTypingUsers(prev => {
                          const next = new Map(prev)
                          next.delete(userId)
                          return next
                      })
                  }, 3000)
              } else {
                  setTypingUsers(prev => {
                      const next = new Map(prev)
                      next.delete(userId)
                      return next
                  })
              }
          }
      })
      .subscribe((status) => {
          console.log('Channel subscription status:', status)
          if (status === 'SUBSCRIBED') {
              console.log('Successfully subscribed to chat:', chatId)
          }
      })

    // Mark all messages as read when entering chat
    const markAllAsRead = async () => {
        try {
            // Update read_at for all messages from other users in this chat
            const { error } = await supabase
                .from('messages')
                .update({ read_at: new Date().toISOString() })
                .eq('chat_id', chatId)
                .neq('sender_id', user.id)
                .is('read_at', null)
            
            if (error) {
                console.error('Error marking messages as read:', error)
            } else {
                // Update local state to show 2 галочки immediately
                setMessages(prev => prev.map(msg => {
                    if (msg.chat_id === chatId && msg.sender_id !== user.id && !msg.read_at) {
                        return { ...msg, read_at: new Date().toISOString() }
                    }
                    return msg
                }))
                
                // Trigger sidebar refresh
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('chatRead', { detail: { chatId } }))
                }
            }
        } catch (e) {
            console.error('Error marking messages as read:', e)
        }
        
        // Always set unread count to 0 when in chat (we're viewing it)
        setUnreadCount(0)
    }
    markAllAsRead()
    
    // Don't update unread count periodically when in chat - we're viewing it, so count should be 0
    // Only update when we receive new messages in real-time
    
    // Cleanup on unmount - trigger sidebar refresh when leaving chat
    return () => { 
        supabase.removeChannel(channel)
        // When leaving chat, trigger sidebar refresh to update unread counts
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('chatLeft', { detail: { chatId } }))
        }
        // Cleanup recording
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop()
        }
    }
  }, [chatId, user])

  // Call handlers (defined before useEffect to avoid dependency issues)
  const insertCallMessage = async (status: 'completed' | 'missed' | 'rejected' | 'cancelled', duration: number = 0) => {
    if (!user || !chatId) return

    const callInfo = {
      status,
      duration: Math.floor(duration / 1000) // convert ms to seconds
    }

    const { error } = await supabase.from('messages').insert({
      chat_id: chatId,
      sender_id: user.id,
      content: status === 'completed' ? `Звонок (${Math.floor(duration / 60000)} мин)` : 'Звонок',
      type: 'call',
      call_info: callInfo,
      created_at: new Date().toISOString(),
    })

    if (error) {
      console.error('Error inserting call message:', error)
    }
  }

  const handleEndCall = async () => {
    // Stop ringing sound
    soundManager.stopCallRinging()
    
    // Play call ended sound
    soundManager.playCallEnded()
    
    // Only insert message if we were actually in a call or initiated one
    if (isInCall && callStartTime) {
      const duration = Date.now() - callStartTime
      await insertCallMessage('completed', duration)
    } else if (isCalling) {
      await insertCallMessage('cancelled')
    }

    if (webrtcHandlerRef.current) {
      await webrtcHandlerRef.current.endCall()
      webrtcHandlerRef.current = null
    }

    setIsCalling(false)
    setIncomingCall(false)
    setIsInCall(false)
    setCallStartTime(null)
    setLocalStream(null)
    setRemoteStreams(new Map())
    setIsMuted(false)
    setIsVideoEnabled(true)
  }

  const handleStartCall = async () => {
    if (!user || !chatId) return

    try {
      console.log('📞 Starting call in chat:', chatId)
      setIsCalling(true)
      // Start ringing sound (will repeat until answered/rejected)
      soundManager.startCallRinging()
      
      // If it's a DM, send direct call request
      if (chat?.type === 'dm' && otherUser) {
        await supabase.from('call_signals').insert({
          chat_id: chatId,
          from_user_id: user.id,
          to_user_id: otherUser.id,
          signal_type: 'call-request',
          created_at: new Date().toISOString(),
        })
      }

      // Initialize WebRTC
      const handler = new WebRTCHandler(
        user.id,
        chatId,
        (userId, stream) => {
          console.log('📥 Remote stream received from:', userId)
          setRemoteStreams(prev => {
            const next = new Map(prev)
            next.set(userId, stream)
            return next
          })
        },
        (userId) => {
          console.log('🧹 Remote stream removed from:', userId)
          setRemoteStreams(prev => {
            const next = new Map(prev)
            next.delete(userId)
            return next
          })
        },
        handleEndCall
      )
      webrtcHandlerRef.current = handler
      const stream = await handler.initialize()
      setLocalStream(stream)
      
      // If group, joining is enough (Presence will trigger handshakes)
      if (chat?.type === 'group') {
        setIsInCall(true)
        setIsCalling(false)
        setCallStartTime(Date.now())
        soundManager.stopCallRinging()
      }
    } catch (error) {
      console.error('Error starting call:', error)
      alert('Не удалось начать звонок. Проверьте разрешения на камеру и микрофон.')
      setIsCalling(false)
    }
  }

  const handleAcceptCall = async () => {
    if (!user || !chatId) return

    // IMMEDIATELY change state - don't wait for anything
    setIsInCall(true)
    setIncomingCall(false)
    setCallStartTime(Date.now())
    
    // Stop ringing sound
    soundManager.stopCallRinging()
    // Play call answered sound
    soundManager.playCallAnswered()

    try {
      // If DM, send call accept
      if (chat?.type === 'dm' && otherUser) {
        await supabase.from('call_signals').insert({
          chat_id: chatId,
          from_user_id: user.id,
          to_user_id: otherUser.id,
          signal_type: 'call-accept',
          created_at: new Date().toISOString(),
        })
      }

      // Initialize WebRTC
      const handler = new WebRTCHandler(
        user.id,
        chatId,
        (userId, stream) => {
          console.log('📥 Remote stream received from:', userId)
          setRemoteStreams(prev => {
            const next = new Map(prev)
            next.set(userId, stream)
            return next
          })
        },
        (userId) => {
          console.log('🧹 Remote stream removed from:', userId)
          setRemoteStreams(prev => {
            const next = new Map(prev)
            next.delete(userId)
            return next
          })
        },
        handleEndCall
      )
      webrtcHandlerRef.current = handler
      const stream = await handler.initialize()
      setLocalStream(stream)
    } catch (error) {
      console.error('Error accepting call:', error)
      alert('Не удалось принять звонок. Проверьте разрешения на камеру и микрофон.')
      handleEndCall()
    }
  }

  const handleRejectCall = async () => {
    if (!user || !otherUser || !chatId) return

    // Stop ringing sound
    soundManager.stopCallRinging()

    // Send call reject
    await supabase.from('call_signals').insert({
      chat_id: chatId,
      from_user_id: user.id,
      to_user_id: otherUser.id,
      signal_type: 'call-reject',
      created_at: new Date().toISOString(),
    })

    await insertCallMessage('rejected')
    handleEndCall()
  }

  const handleToggleMute = () => {
    if (webrtcHandlerRef.current) {
      webrtcHandlerRef.current.toggleMute()
      setIsMuted(!isMuted)
    }
  }

  const handleToggleVideo = () => {
    if (webrtcHandlerRef.current) {
      webrtcHandlerRef.current.toggleVideo()
      setIsVideoEnabled(!isVideoEnabled)
    }
  }

  // Handle incoming calls from global state or events
  useEffect(() => {
    const processIncomingCall = (incomingChatId: string, fromUserId: string) => {
      if (incomingChatId !== chatId) {
        console.log('⏭️ Incoming call is for different chat, ignoring')
        return
      }
      
      console.log('✅ Incoming call is for current chat, setting up call UI...')
      
      // Fetch caller profile if not available
      if (!otherUser || otherUser.id !== fromUserId) {
        console.log('📥 Fetching caller profile for incoming call...')
        supabase.from('profiles')
          .select('*')
          .eq('id', fromUserId)
          .single()
          .then(({ data, error }) => {
            if (error) {
              console.error('❌ Error fetching caller profile:', error)
            } else if (data) {
              console.log('✅ Caller profile loaded, showing incoming call:', data)
              setOtherUser(data as Profile)
              setIncomingCall(true)
              clearIncomingCall() // Clear global state after processing
            }
          })
      } else {
        console.log('✅ Caller profile already available, showing incoming call')
        setIncomingCall(true)
        clearIncomingCall() // Clear global state after processing
      }
    }
    
    // Check global state for incoming call (in case call arrived before ChatWindow loaded)
    if (globalIncomingCall && globalIncomingCall.chatId === chatId && globalIncomingCall.fromUserId) {
      console.log('📞 Found incoming call in global state:', globalIncomingCall)
      processIncomingCall(globalIncomingCall.chatId, globalIncomingCall.fromUserId)
    }
    
    // Listen for incoming call events (from Sidebar)
    const handleIncomingCall = (event: CustomEvent) => {
      const { chatId: incomingChatId, fromUserId } = event.detail
      console.log('📞 Received incoming call event:', { 
        incomingChatId, 
        currentChatId: chatId, 
        fromUserId,
        isMatch: incomingChatId === chatId
      })
      processIncomingCall(incomingChatId, fromUserId)
    }
    
    window.addEventListener('incomingCall', handleIncomingCall as EventListener)
    
    return () => {
      window.removeEventListener('incomingCall', handleIncomingCall as EventListener)
    }
  }, [chatId, otherUser, globalIncomingCall, clearIncomingCall])

  // Handle call signals for current chat (WebRTC signals, call-accept, call-reject, call-end)
  useEffect(() => {
    if (!chatId || !user?.id) {
      console.log('⚠️ Call listener setup skipped:', { chatId, hasUser: !!user, userId: user?.id })
      return
    }

    // Don't skip if chat is not loaded yet - we'll check type when processing signals
    // This allows listener to be set up immediately, even before chat data is fetched
    const currentUserId = user.id // Capture user ID in closure to avoid stale closures
    console.log('🔔 Setting up call listener for chat:', chatId, 'user:', currentUserId, 'chatType:', chat?.type || 'loading...')

    const channel = supabase
      .channel(`calls-${chatId}-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_signals',
          filter: `chat_id=eq.${chatId}`,
        },
        async (payload) => {
          const signal = payload.new as any
          
          // Get latest state from ref to avoid stale closure and dependency spam
          const { isCalling: refIsCalling, incomingCall: refIncomingCall, otherUser: refOtherUser } = callStateRef.current
          
          // Convert to strings for reliable comparison
          const signalTo = String(signal.to_user_id || '').trim()
          const signalFrom = String(signal.from_user_id || '').trim()
          const currentUserStr = String(currentUserId || '').trim()
          const otherUserStr = refOtherUser?.id ? String(refOtherUser.id).trim() : ''
          
          console.log('📞 Call signal received:', {
            type: signal.signal_type,
            from: signalFrom,
            to: signalTo,
            currentUser: currentUserStr,
            otherUser: otherUserStr,
            isForMe: signalTo === currentUserStr
          })
          
          // Skip call-request signals - they're handled globally in Sidebar
          if (signal.signal_type === 'call-request') {
            console.log('📞 Call-request signal received in ChatWindow (handled globally, ignoring)')
            return
          }
          
          // Check if this signal is for current user
          const isCallAcceptForMe = signal.signal_type === 'call-accept' && 
            ((signalFrom === otherUserStr && signalTo === currentUserStr) || refIsCalling)
          const isCallRejectForMe = (signal.signal_type === 'call-reject' || signal.signal_type === 'call-end') && 
            (signalTo === currentUserStr || signalFrom === otherUserStr || refIsCalling || refIncomingCall)
          
          // WebRTC signals (offer, answer, ice-candidate) should be passed to WebRTCHandler
          const isWebRTCSignal = (signal.signal_type === 'offer' || signal.signal_type === 'answer' || signal.signal_type === 'ice-candidate') &&
            webrtcHandlerRef.current &&
            (signalTo === currentUserStr)
          
          if (isCallAcceptForMe || isCallRejectForMe || isWebRTCSignal) {
            console.log('✅ Signal is for me! Processing...', { 
              type: signal.signal_type,
              isCallAcceptForMe,
              isCallRejectForMe,
              isCalling: refIsCalling,
              incomingCall: refIncomingCall
            })
            
            if (signal.signal_type === 'call-accept') {
              console.log('✅ Call accepted by:', signalFrom)
              // Stop ringing sound
              soundManager.stopCallRinging()
              
              // If we initiated the call, handle acceptance
              if (refIsCalling && webrtcHandlerRef.current) {
                console.log('✅ Call accepted, establishing connection...')
                setIsInCall(true)
                setIsCalling(false)
                setCallStartTime(Date.now())
                // Play call answered sound
                soundManager.playCallAnswered()
              }
            } else if (signal.signal_type === 'call-reject' || signal.signal_type === 'call-end') {
              console.log('❌ Call rejected/ended')
              // Stop ringing sound
              soundManager.stopCallRinging()
              
              // Insert message if we were calling and it was rejected
              if (refIsCalling && signal.signal_type === 'call-reject') {
                await insertCallMessage('rejected')
              } else if (refIncomingCall && signal.signal_type === 'call-end') {
                // If caller ended before we answered
                await insertCallMessage('missed')
              }
              
              // If it's a DM, end the whole thing. If group, maybe just one person left.
              if (chat?.type === 'dm') {
                handleEndCall()
              }
            }
          } else {
            console.log('⏭️ Signal is not for me, ignoring', {
              type: signal.signal_type,
              from: signal.from_user_id,
              to: signal.to_user_id,
              currentUser: currentUserId,
              otherUser: otherUserStr,
              isCalling: refIsCalling,
              incomingCall: refIncomingCall
            })
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Call channel subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to call signals')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to call signals')
        }
      })

    callChannelRef.current = channel

    // Fallback: Poll for missed signals every 2 seconds
    const pollInterval = setInterval(async () => {
      try {
        const { data: signals, error } = await supabase
          .from('call_signals')
          .select('*')
          .eq('chat_id', chatId)
          .eq('to_user_id', currentUserId)
          .eq('signal_type', 'call-request')
          .order('created_at', { ascending: false })
          .limit(1)

        if (error) {
          console.error('Error polling for calls:', error)
          return
        }

        if (signals && signals.length > 0) {
          const signal = signals[0]
          const { isCalling: refIsCalling, incomingCall: refIncomingCall, isInCall: refIsInCall } = callStateRef.current
          // Check if signal is recent (within last 10 seconds) and we haven't processed it
          const signalTime = new Date(signal.created_at).getTime()
          const now = Date.now()
          if (now - signalTime < 10000 && !refIncomingCall && !refIsCalling && !refIsInCall) {
            console.log('📞 Found missed call signal via polling:', signal)
            // Process the signal
            if (!otherUser || otherUser.id !== signal.from_user_id) {
              supabase.from('profiles')
                .select('*')
                .eq('id', signal.from_user_id)
                .single()
                .then(({ data }) => {
                  if (data) {
                    setOtherUser(data as Profile)
                  }
                })
            }
            setIncomingCall(true)
            soundManager.playIncomingCall()
          }
        }
      } catch (error) {
        console.error('Error in call polling:', error)
      }
    }, 2000)

    return () => {
      console.log('🧹 Cleaning up call listener')
      clearInterval(pollInterval)
      supabase.removeChannel(channel)
    }
  }, [chatId, user?.id, chat?.type])

  const loadMoreMessages = async () => {
    if (!hasMore || isLoadingMore || !messages.length) return
    
    setIsLoadingMore(true)
    const oldestMsg = messages[0]
    const scrollContainer = scrollContainerRef.current
    const previousScrollHeight = scrollContainer?.scrollHeight || 0

    try {
      const { data, error } = await supabase.from('messages')
        .select('*, sender:profiles!sender_id(*), forwarded_from:profiles!forwarded_from_id(*)')
        .eq('chat_id', chatId)
        .lt('created_at', oldestMsg.created_at)
        .order('created_at', { ascending: false })
        .limit(MESSAGES_PER_PAGE)

      if (error) throw error

      if (data && data.length > 0) {
        const olderMessages = data
          .filter((msg: any) => !(msg.deleted_at && msg.deleted_for_all))
          .map((msg: any) => ({ ...msg, reply_to: null }))
          .reverse() as Message[]

        setMessages(prev => [...olderMessages, ...prev])
        setHasMore(data.length === MESSAGES_PER_PAGE)
        
        // Restore scroll position
        setTimeout(() => {
          if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight - previousScrollHeight
          }
        }, 0)
      } else {
        setHasMore(false)
      }
    } catch (err) {
      console.error('Error loading more messages:', err)
    } finally {
      setIsLoadingMore(false)
    }
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop === 0 && hasMore && !isLoadingMore) {
      loadMoreMessages()
    }
  }

  const markAsRead = async (messageId: string) => {
      try {
          await supabase
              .from('messages')
              .update({ read_at: new Date().toISOString() })
              .eq('id', messageId)
          
          // Update local state immediately for instant UI feedback
          setMessages(prev => prev.map(msg => 
              msg.id === messageId ? { ...msg, read_at: new Date().toISOString() } : msg
          ))
      } catch (e) {
          // Ignore errors silently
      }
  }

  const handleFileUpload = async (files: FileList) => {
    if (!user || !chatId) return
    
    setIsUploading(true)
    
    try {
      for (const file of Array.from(files)) {
        const isImage = file.type.startsWith('image/')
        const fileType = isImage ? 'image' : 'file'
        const fileName = `${Date.now()}-${file.name}`
        const filePath = `${chatId}/${fileName}`
        
        // Upload file
        const { error: uploadError } = await supabase.storage
          .from('chat-attachments')
          .upload(filePath, file, { contentType: file.type })
        
        if (uploadError) throw uploadError
        
        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('chat-attachments')
          .getPublicUrl(filePath)
        
        // Create message with attachment
        await supabase.from('messages').insert({
          chat_id: chatId,
          sender_id: user.id,
          content: isImage ? '📷 Фото' : `📎 ${file.name}`,
          attachments: [{ 
            type: fileType, 
            url: publicUrl,
            name: file.name,
            size: file.size,
            mimeType: file.type
          }],
          delivered_at: new Date().toISOString()
        })
      }
    } catch (error) {
      console.error('Error uploading file:', error)
      alert('Ошибка при загрузке файла')
    } finally {
      setIsUploading(false)
    }
  }

  const searchMessages = useCallback(async (query: string) => {
    if (!query.trim() || !chatId) {
      setSearchResults([])
      return
    }
    
    setIsSearching(true)
    try {
      // Search only in current chat
      const { data, error } = await supabase
        .from('messages')
        .select('*, sender:profiles!sender_id(*)')
        .eq('chat_id', chatId)
        .ilike('content', `%${query}%`)
        .order('created_at', { ascending: false })
        .limit(50)
      
      if (error) throw error
      setSearchResults(data || [])
    } catch (error) {
      console.error('Error searching messages:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [chatId])

  // Debounce search
  useEffect(() => {
    if (!showSearch) return
    
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        searchMessages(searchQuery)
      } else {
        setSearchResults([])
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchQuery, showSearch, searchMessages])

  // Debounce search
  useEffect(() => {
    if (!showSearch) return
    
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        searchMessages(searchQuery)
      } else {
        setSearchResults([])
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchQuery, showSearch, chatId])

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
    const tempId = crypto.randomUUID()
    const optimisticMessage: Message = {
      id: tempId,
      chat_id: chatId,
      sender_id: user.id,
      content: text,
      created_at: new Date().toISOString(),
      attachments: null,
      delivered_at: null,
      read_at: null,
      reply_to_id: replyingTo?.id || null,
      reply_to: replyingTo,
      status: 'sending'
    }

    // Add optimistically to UI
    setMessages(prev => [...prev, optimisticMessage])
    setNewMessage('') 
    setReplyingTo(null)

    // Scroll to bottom immediately
    setTimeout(scrollToBottom, 50)

    try {
      const { error, data } = await supabase.from('messages').insert({
        id: tempId,
      chat_id: chatId,
      sender_id: user.id,
      content: text,
      reply_to_id: replyingTo?.id || null,
        delivered_at: new Date().toISOString()
      }).select().single()

      if (error) throw error
      
      // Update status to 'sent' if successful
      setMessages(prev => prev.map(msg => 
        msg.id === tempId ? { ...msg, status: 'sent' as const } : msg
      ))
      
      // Play sound
      soundManager.playMessageSent()
    } catch (error) {
        console.error('Error sending:', error)
      // Mark as error in UI
      setMessages(prev => prev.map(msg => 
        msg.id === tempId ? { ...msg, status: 'error' as const } : msg
      ))
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
    <div className="flex flex-col h-full bg-[#E5E5E5] dark:bg-[#0E1621] max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center px-4 justify-between shrink-0 shadow-sm z-10">
        <div 
            onClick={() => setShowProfile(true)}
            className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 p-2 -ml-2 rounded-lg transition-colors"
        >
            <button onClick={(e) => { e.stopPropagation(); router.push('/chat') }} className="md:hidden p-2 -ml-2 text-gray-600 dark:text-gray-300 shrink-0 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full">
                <ArrowLeft className="w-6 h-6" />
            </button>
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 overflow-hidden bg-gradient-to-tr from-blue-400 to-purple-500">
                {(chat?.type === 'group' ? chat.avatar_url : otherUser?.avatar_url) ? (
                    <img src={chat?.type === 'group' ? chat.avatar_url! : otherUser?.avatar_url!} className="w-full h-full object-cover" alt={chat?.name || 'Chat'} />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        {chat?.type === 'group' ? (
                            <Users className="w-6 h-6 text-white" />
                        ) : (
                            <span className="text-white font-bold text-lg">
                                {(chat?.type === 'dm' ? (otherUser?.username?.[0] || otherUser?.full_name?.[0]) : (chat?.name?.[0])) || '?'}
                            </span>
                        )}
                    </div>
                )}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <div className="font-bold text-gray-900 dark:text-white truncate flex items-center gap-1.5">
                        {chat?.type === 'group' && <Users className="w-4 h-4 text-blue-500 shrink-0" />}
                        {chat?.type === 'dm' 
                            ? (chat?.name === 'Избранное' ? 'Избранное' : (otherUser?.full_name || otherUser?.username?.replace(/^@+/, '') || 'User'))
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
                    {typingUsers.size > 0 ? (
                        <span className="text-blue-500 flex items-center gap-1 transition-all duration-300">
                            <span>
                                {Array.from(typingUsers.values()).join(', ')} {typingUsers.size > 1 ? 'печатают' : 'печатает'}
                            </span>
                            <span className="flex gap-0.5">
                                <span className="animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1.4s' }}>.</span>
                                <span className="animate-bounce" style={{ animationDelay: '200ms', animationDuration: '1.4s' }}>.</span>
                                <span className="animate-bounce" style={{ animationDelay: '400ms', animationDuration: '1.4s' }}>.</span>
                            </span>
                        </span>
                    ) : chat?.name === 'Избранное' ? (
                        <span className="text-gray-400">заметки для себя</span>
                    ) : chat?.type === 'group' ? (
                        <span className="text-gray-400">{groupMembers.length} участников</span>
                    ) : isOnline ? (
                        <span className="text-green-500 transition-colors duration-300">в сети</span>
                    ) : lastSeen ? (
                        <span className="text-gray-400 transition-colors duration-300">
                            был(а) {formatLastSeen(lastSeen)}
                        </span>
                    ) : (
                        <span className="text-gray-400">не в сети</span>
                    )}
                </div>
            </div>
        </div>
        <div className="flex items-center gap-2">
            {(chat?.type === 'dm' ? (otherUser && chat?.name !== 'Избранное') : true) && (
              <button 
                  onClick={(e) => {
                      e.stopPropagation()
                      handleStartCall()
                  }}
                  className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full shrink-0 transition-colors"
                  title="Позвонить"
              >
                  <Phone className="w-5 h-5" />
              </button>
            )}
            <button 
                onClick={(e) => {
                    e.stopPropagation()
                    setShowSearch(!showSearch)
                    if (!showSearch) {
                        setSearchQuery('')
                        setSearchResults([])
                    }
                }}
                className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full shrink-0 transition-colors"
                title="Поиск"
            >
                <Search className="w-5 h-5" />
        </button>
        </div>
      </div>

      {/* Search Bar */}
      {showSearch && (
        <div className="px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Поиск в чате..." 
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
              }}
              className="w-full pl-9 pr-10 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('')
                  setSearchResults([])
                }}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-2 scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-transparent"
      >
        <div className="flex flex-col justify-end min-h-full">
            {isLoadingMore && (
              <div className="flex justify-center py-2 shrink-0">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!showSearch && messages.length === 0 && (
                <div className="text-center text-gray-400 py-10">No messages yet. Say hi!</div>
            )}
            {showSearch && searchResults.length === 0 && searchQuery && !isSearching && (
                <div className="text-center text-gray-400 py-10">Сообщения не найдены</div>
            )}
            {(showSearch && searchResults.length > 0 ? searchResults : messages).map((msg, index) => {
                // Determine if this message should show avatar (first in series)
                const messageList = showSearch && searchResults.length > 0 ? searchResults : messages
                const prevMessage = index > 0 ? messageList[index - 1] : null
                const isFirstInSeries = !prevMessage || 
                    prevMessage.sender_id !== msg.sender_id ||
                    (new Date(msg.created_at).getTime() - new Date(prevMessage.created_at).getTime()) > 5 * 60 * 1000 // 5 minutes gap
                
                return (
                    <MessageBubble 
                        key={msg.id} 
                        message={msg} 
                        showAvatar={isFirstInSeries}
                        onImageClick={(imageUrl) => setViewingImage(imageUrl)}
                        onAvatarClick={(avatarUrl) => setViewingAvatar(avatarUrl)}
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
                        onReaction={handleAddReaction}
                        onForward={(message) => {
                          handleStartSelection(message.id)
                          setShowForwardModal(true)
                        }}
                        onSelect={handleToggleSelection}
                        onUserClick={navigateToUserChat}
                        isSelected={selectedMessageIds.has(msg.id)}
                        isSelectionMode={isSelectionMode}
                    />
                )
            })}
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

      {/* Profile Modal */}
      {showProfile && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowProfile(false)}>
            <div className="bg-white dark:bg-[#17212B] rounded-[2.5rem] shadow-2xl w-full max-w-3xl overflow-hidden transform transition-all border border-gray-100 dark:border-gray-800" onClick={e => e.stopPropagation()}>
                {/* Header with gradient */}
                <div className="h-32 bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 relative rounded-t-[2.5rem]">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
                </div>
                
                <div className="px-8 pb-8 pt-2">
                    {/* Avatar */}
                    <div className="relative -mt-16 mb-6 flex justify-center">
                        <div className="relative group">
                            <div 
                                className="w-28 h-28 rounded-full border-4 border-white dark:border-[#17212B] shadow-xl overflow-hidden bg-gray-200 dark:bg-gray-700 flex items-center justify-center cursor-pointer hover:opacity-95 transition-all hover:scale-105"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    const url = chat?.type === 'group' ? chat.avatar_url : otherUser?.avatar_url
                                    if (url) {
                                        setViewingAvatar(url)
                                    }
                                }}
                            >
                                {(chat?.type === 'group' ? chat.avatar_url : otherUser?.avatar_url) ? (
                                    <img src={chat?.type === 'group' ? chat.avatar_url! : otherUser?.avatar_url!} className="w-full h-full object-cover" alt="Avatar" />
                                ) : (
                                    chat?.type === 'group' ? (
                                        <Users className="w-14 h-14 text-gray-400" />
                                    ) : (
                                        <span className="text-4xl font-bold text-gray-500 dark:text-gray-300">
                                            {(chat?.type === 'dm' ? (otherUser?.username?.[0] || otherUser?.full_name?.[0]) : (chat?.name?.[0])) || '?'}
                                        </span>
                                    )
                                )}
                            </div>
                            
                            {chat?.type === 'group' && (
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        const input = document.getElementById('group-avatar-upload') as HTMLInputElement
                                        if (input) input.click()
                                    }}
                                    className="absolute bottom-1 right-1 p-2.5 bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-600 transition-all active:scale-90"
                                >
                                    <Camera className="w-5 h-5" />
                                </button>
                            )}
                            <input
                                id="group-avatar-upload"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleAvatarSelect}
                            />
                        </div>
                    </div>

                    {/* Avatar Preview Modal */}
                    {avatarPreview && (
                      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 max-w-2xl w-full shadow-2xl space-y-8 animate-in zoom-in duration-300">
                          <div className="text-center">
                            <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2 tracking-tight">Предпросмотр фото</h3>
                            <p className="text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest text-xs">Так будет выглядеть ваша группа</p>
                          </div>
                          
                          <div className="flex justify-center">
                            <div className="w-48 h-48 rounded-full overflow-hidden border-4 border-blue-500 shadow-xl">
                              <img src={avatarPreview} className="w-full h-full object-cover" alt="Preview" />
                            </div>
                          </div>

                          <div className="flex gap-4">
                            <button
                              onClick={() => { setAvatarPreview(null); setSelectedAvatarFile(null) }}
                              className="flex-1 py-4 px-6 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-all active:scale-95 uppercase tracking-widest text-sm"
                            >
                              Отмена
                            </button>
                            <button
                              onClick={handleUploadAvatar}
                              disabled={isUploadingAvatar}
                              className="flex-1 py-4 px-6 rounded-2xl bg-blue-500 text-white font-bold hover:bg-blue-600 disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-blue-500/20 uppercase tracking-widest text-sm"
                            >
                              {isUploadingAvatar ? 'Загрузка...' : 'Сохранить'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* User Info / Group Members */}
                    <div className="mb-8 text-center space-y-4">
                        <div>
                            <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-1 tracking-tight">
                                {chat?.type === 'dm' 
                                    ? (chat?.name === 'Избранное' ? 'Избранное' : (otherUser?.full_name || otherUser?.username?.replace(/^@+/, '') || 'User'))
                                    : chat?.name}
                            </h2>
                            {chat?.type === 'dm' && chat?.name !== 'Избранное' && otherUser?.username && (
                                <p className="text-blue-500 dark:text-blue-400 text-base font-bold tracking-wide">@{otherUser.username.replace(/^@+/, '')}</p>
                            )}
                            {chat?.type === 'group' && (
                                <div className="flex items-center justify-center gap-2">
                                    <p className="text-gray-500 text-sm font-bold uppercase tracking-widest">{groupMembers.length} участников</p>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setShowInviteModal(true) }}
                                        className="p-2 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-xl text-blue-500 transition-all active:scale-90"
                                        title="Пригласить"
                                    >
                                        <UserPlus className="w-5 h-5" />
                                    </button>
                                </div>
                            )}
                        </div>
                        
                        {chat?.type === 'dm' && otherUser?.status && (
                            <div className="pt-2">
                                <p className="text-gray-600 dark:text-gray-300 text-base italic leading-relaxed font-medium">"{otherUser.status}"</p>
                            </div>
                        )}
                        
                        {chat?.type === 'group' && (
                            <div className="pt-4 border-t border-gray-100 dark:border-gray-800 max-h-64 overflow-y-auto space-y-4 px-2 text-left scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700">
                                {groupMembers.map(member => {
                                    const lastSeenAt = member.last_seen_at
                                    const isMemberOnline = lastSeenAt ? (Date.now() - new Date(lastSeenAt).getTime()) < 120000 : false
                                    
                                    return (
                                        <div 
                                          key={member.id} 
                                          className="flex items-center gap-4 p-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-2xl cursor-pointer transition-all active:scale-[0.98]"
                                          onClick={() => navigateToUserChat(member.id)}
                                        >
                                            <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 shrink-0 border-2 border-transparent hover:border-blue-500 transition-all shadow-sm">
                                                {member.avatar_url ? (
                                                    <img src={member.avatar_url} className="w-full h-full object-cover" alt="U" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-sm font-bold text-gray-500">
                                                        {(member.username?.[0] || 'U').toUpperCase()}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[15px] font-bold text-gray-900 dark:text-white truncate">
                                                    {member.full_name || member.username?.replace(/^@+/, '')}
                                                </div>
                                                <div className="text-xs font-medium">
                                                    {isMemberOnline ? (
                                                        <span className="text-green-500">в сети</span>
                                                    ) : lastSeenAt ? (
                                                        <span className="text-gray-500">был(а) {formatLastSeen(lastSeenAt)}</span>
                                                    ) : (
                                                        <span className="text-gray-400">не в сети</span>
                                                    )}
                                                </div>
                                            </div>
                                            {isMemberOnline && (
                                                <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        
                        {chat?.type === 'dm' && otherUser?.bio && (
                            <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                                <p className="text-gray-700 dark:text-gray-200 text-base leading-relaxed whitespace-pre-wrap break-words font-medium">
                                    {otherUser.bio}
                                </p>
                            </div>
                        )}
                        
                        {chat?.type === 'dm' && otherUser?.birth_date && (
                            <div className="pt-2">
                                <p className="text-gray-500 dark:text-gray-400 text-sm font-semibold">
                                    🎂 {new Date(otherUser.birth_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                            </div>
                        )}
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="space-y-3">
                        {chat?.type === 'dm' && chat?.name !== 'Избранное' && otherUser?.id !== user?.id && (
                            <button 
                                onClick={async () => {
                                    if (!user || !otherUser) return
                                    try {
                                        if (isBlockedByMe) {
                                            const { error } = await supabase
                                                .from('blocked_users')
                                                .delete()
                                                .eq('blocker_id', user.id)
                                                .eq('blocked_id', otherUser.id)
                                            
                                            if (error) throw error
                                            setIsBlockedByMe(false)
                                        } else {
                                            const { error } = await supabase
                                                .from('blocked_users')
                                                .upsert({
                                                    blocker_id: user.id,
                                                    blocked_id: otherUser.id,
                                                    created_at: new Date().toISOString()
                                                }, {
                                                    onConflict: 'blocker_id,blocked_id'
                                                })
                                            
                                            if (error) throw error
                                            setIsBlockedByMe(true)
                                            setShowProfile(false)
                                        }
                                    } catch (error) {
                                        console.error('Error blocking/unblocking user:', error)
                                        alert('Ошибка при выполнении операции')
                                    }
                                }}
                                className={`w-full py-4 text-base ${isBlockedByMe ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white' : 'bg-red-500 hover:bg-red-600 text-white'} rounded-2xl font-black transition-all duration-200 shadow-lg hover:shadow-xl active:scale-95`}
                            >
                                {isBlockedByMe ? 'Разблокировать' : 'Заблокировать'}
                            </button>
                        )}
                    
                    <button 
                        onClick={() => setShowProfile(false)}
                            className="w-full py-4 text-base bg-gray-100 dark:bg-[#242F3D] hover:bg-gray-200 dark:hover:bg-[#2b394a] rounded-2xl text-gray-900 dark:text-white font-black transition-all duration-200 shadow-md hover:shadow-lg active:scale-95"
                    >
                        Закрыть
                    </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Image Viewer Modal */}
      {viewingImage && (
        <ImageViewer
          imageUrl={viewingImage}
          alt="Message image"
          onClose={() => setViewingImage(null)}
        />
      )}

      {/* Avatar Viewer Modal */}
      {viewingAvatar && (
        <ImageViewer
          imageUrl={viewingAvatar}
          alt="Avatar"
          onClose={() => setViewingAvatar(null)}
        />
      )}

      {/* Selection Mode Bar */}
      {isSelectionMode && (
        <div className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center px-4 justify-between shrink-0 shadow-md z-20">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => { setIsSelectionMode(false); setSelectedMessageIds(new Set()) }}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
            >
              <X className="w-6 h-6 text-gray-500" />
            </button>
            <div className="font-bold text-gray-900 dark:text-white">
              Выбрано: {selectedMessageIds.size}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={selectedMessageIds.size === 0}
              onClick={() => setShowForwardModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all font-semibold shadow-sm"
            >
              <Share2 className="w-4 h-4" />
              <span>Переслать</span>
            </button>
          </div>
        </div>
      )}

      {/* Forward Modal */}
      {showForwardModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowForwardModal(false)}>
          <div className="bg-white dark:bg-[#17212B] rounded-[2.5rem] shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[80vh] border border-gray-100 dark:border-gray-800" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Переслать</h3>
              <button onClick={() => setShowForwardModal(false)} className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-all active:scale-90">
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700">
              {userChats.length === 0 ? (
                <div className="text-center py-12 text-gray-500 font-medium text-lg">Нет доступных чатов</div>
              ) : (
                userChats.map(chat => (
                  <div 
                    key={chat.id}
                    onClick={() => handleForwardMessages(chat.id)}
                    className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-[#242F3D] rounded-[1.5rem] cursor-pointer transition-all active:scale-[0.98]"
                  >
                    <div className="w-14 h-14 rounded-full overflow-hidden bg-gradient-to-tr from-blue-400 to-indigo-500 flex items-center justify-center shrink-0 border-2 border-transparent hover:border-white transition-all shadow-md">
                      {chat.displayAvatar ? (
                        <img src={chat.displayAvatar} className="w-full h-full object-cover" alt="U" />
                      ) : (
                        chat.type === 'group' ? <Users className="w-7 h-7 text-white" /> : <span className="text-white font-black text-xl">{(chat.displayName?.[0] || 'U').toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900 dark:text-white text-[17px] truncate tracking-tight">{chat.displayName}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest text-[10px] mt-0.5 opacity-70">{chat.type === 'group' ? 'Группа' : 'Личный чат'}</div>
                    </div>
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-xl">
                      <Send className="w-5 h-5 rotate-[-20deg]" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowInviteModal(false)}>
          <div className="bg-white dark:bg-[#17212B] rounded-[2.5rem] shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[80vh] border border-gray-100 dark:border-gray-800" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Пригласить</h3>
              <button onClick={() => setShowInviteModal(false)} className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-all active:scale-90">
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="relative">
                <Search className="absolute left-4 top-3 w-5 h-5 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Поиск по @username..." 
                  value={inviteSearchQuery}
                  onChange={(e) => setInviteSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-gray-100 dark:bg-[#242F3D] border-2 border-transparent focus:border-blue-500 rounded-2xl text-base outline-none transition-all text-gray-900 dark:text-white font-medium"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700">
              {inviteSearchQuery && availableForInvite.length === 0 ? (
                <div className="text-center py-12 text-gray-500 font-medium">Пользователи не найдены</div>
              ) : (
                availableForInvite.map(u => (
                  <div 
                    key={u.id}
                    onClick={() => handleInviteUser(u.id)}
                    className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-[#242F3D] rounded-[1.5rem] cursor-pointer transition-all active:scale-[0.98] group"
                  >
                    <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0 border-2 border-transparent group-hover:border-blue-500 transition-all">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} className="w-full h-full object-cover" alt="U" />
                      ) : (
                        <span className="text-gray-500 font-black text-lg">{(u.username?.[0] || 'U').toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900 dark:text-white text-base truncate">{u.full_name || u.username}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">@{u.username}</div>
                    </div>
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-xl group-hover:bg-blue-500 group-hover:text-white transition-all">
                      <UserPlus className="w-6 h-6" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Call Modal */}
      <CallModal
        isOpen={isCalling || incomingCall || isInCall}
        isIncoming={incomingCall && !isInCall}
        otherUser={chat?.type === 'group' ? { id: 'group', username: null, full_name: chat.name, avatar_url: chat.avatar_url, status: null, last_seen_at: null } as Profile : otherUser}
        callStartTime={callStartTime}
        onClose={handleEndCall}
        onAccept={handleAcceptCall}
        onReject={handleRejectCall}
        localStream={localStream}
        remoteStreams={remoteStreams}
        isMuted={isMuted}
        isVideoEnabled={isVideoEnabled}
        onToggleMute={handleToggleMute}
        onToggleVideo={handleToggleVideo}
      />

      {/* Input */}
      <div className="p-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shrink-0">
        {(isBlockedByMe || isBlockingMe) ? (
          <div className="flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl text-gray-500 dark:text-gray-400 text-sm font-medium">
            {isBlockedByMe ? 'Вы заблокировали этого пользователя' : 'Вас заблокировали'}
          </div>
        ) : (
        <form onSubmit={sendMessage} className="flex items-center gap-2 max-w-4xl mx-auto">
              <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                      if (e.target.files) {
                          handleFileUpload(e.target.files)
                          e.target.value = '' // Reset input
                      }
                  }}
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.txt"
                  className="hidden"
              />
              <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors disabled:opacity-50"
              >
                  {isUploading ? (
                      <div className="w-5 h-5 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                <Paperclip className="w-5 h-5" />
                  )}
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
        )}
      </div>
    </div>
  )
}

