'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Profile, Chat, Message } from '@/types'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/useAuthStore'
import { Plus, Settings, LogOut, User as UserIcon, Search, Trash2, X, MoreVertical, Users } from 'lucide-react'
import { soundManager } from '@/lib/sounds'
import { profileCache } from '@/lib/cache'
import { cn } from '@/lib/utils'

export function Sidebar() {
    const [chats, setChats] = useState<Chat[]>([])
    const [myProfile, setMyProfile] = useState<Profile | null>(null)
    const [users, setUsers] = useState<Profile[]>([]) // Found users
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [globalSearchQuery, setGlobalSearchQuery] = useState('')
  const [globalSearchResults, setGlobalSearchResults] = useState<{ message: Message; chat: any; sender: Profile | null }[]>([])
  const [isGlobalSearching, setIsGlobalSearching] = useState(false)
  const [showGlobalSearch, setShowGlobalSearch] = useState(false)
    const [deletingChatId, setDeletingChatId] = useState<string | null>(null)
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; chatId: string } | null>(null)
    const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
    const touchStartPosRef = useRef<{ x: number; y: number; chatId: string } | null>(null)
    const longPressTriggeredRef = useRef<boolean>(false)
    const [savedMessagesChecked, setSavedMessagesChecked] = useState(false)
    const [userChatIds, setUserChatIds] = useState<string[]>([])
    const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
    const [isLoadingChats, setIsLoadingChats] = useState(false)
    const [typingUsers, setTypingUsers] = useState<Record<string, string[]>>({}) // chat_id -> user_ids[]
    const typingChannelsRef = useRef<Record<string, any>>({})
    const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const chatsRef = useRef<Chat[]>([])
    const userChatIdsRef = useRef<string[]>([])
    const router = useRouter()
    const { user, signOut } = useAuthStore()
    const [showCreateGroup, setShowCreateGroup] = useState(false)
    const [groupName, setGroupName] = useState('')
    const [selectedUsers, setSelectedUsers] = useState<string[]>([])
    const [availableUsers, setAvailableUsers] = useState<Profile[]>([])

  // Keep refs in sync
  useEffect(() => {
    chatsRef.current = chats
    userChatIdsRef.current = userChatIds
  }, [chats, userChatIds])

  // Close menu when clicking/touching outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      setContextMenu(null)
    }
    document.addEventListener('click', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      // Clean up all typing channels on unmount
      Object.values(typingChannelsRef.current).forEach(channel => {
        supabase.removeChannel(channel)
      })
      typingChannelsRef.current = {}
    }
  }, [])

  // Handle typing indicators for all chats in sidebar
  useEffect(() => {
    if (!user || chats.length === 0) return

    // Clean up old channels that are no longer in chats list
    const currentChatIds = new Set(chats.map(c => c.id))
    Object.keys(typingChannelsRef.current).forEach(id => {
      if (!currentChatIds.has(id)) {
        supabase.removeChannel(typingChannelsRef.current[id])
        delete typingChannelsRef.current[id]
      }
    })

    // Subscribe to new channels
    chats.forEach(chat => {
      if (typingChannelsRef.current[chat.id]) return

      const channel = supabase.channel(`chat_typing_sidebar_${chat.id}`)
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          const { user_id, is_typing } = payload
          if (user_id === user.id) return

          setTypingUsers(prev => {
            const current = prev[chat.id] || []
            if (is_typing) {
              if (current.includes(user_id)) return prev
              return { ...prev, [chat.id]: [...current, user_id] }
            } else {
              if (!current.includes(user_id)) return prev
              return { ...prev, [chat.id]: current.filter(id => id !== user_id) }
            }
          })
        })
        .subscribe()

      typingChannelsRef.current[chat.id] = channel
    })
  }, [chats, user?.id])

  const openContextMenu = (x: number, y: number, chatId: string) => {
    // Calculate menu position with boundary checks for mobile
    const menuWidth = 160
    const menuHeight = 60
    const padding = 10
    
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const isMobile = viewportWidth < 768
    
    let menuX = x
    let menuY = y
    
    // Horizontal positioning
    if (isMobile) {
      // Center horizontally on mobile
      menuX = Math.max(padding, (viewportWidth - menuWidth) / 2)
    } else {
      if (menuX + menuWidth + padding > viewportWidth) {
        menuX = Math.max(padding, viewportWidth - menuWidth - padding)
      }
      if (menuX < padding) menuX = padding
    }
    
    // Vertical positioning
    if (menuY + menuHeight + padding > viewportHeight) {
      menuY = Math.max(padding, viewportHeight - menuHeight - padding)
    }
    if (menuY < padding) {
      menuY = padding
    }
    
    // On mobile, prefer bottom positioning
    if (isMobile && y > viewportHeight * 0.6) {
      menuY = Math.max(padding, viewportHeight - menuHeight - padding)
    }
    
    setContextMenu({ x: menuX, y: menuY, chatId })
  }

  const handleContextMenu = (e: React.MouseEvent, chatId: string) => {
    e.preventDefault()
    openContextMenu(e.clientX, e.clientY, chatId)
  }

  const handleTouchStart = (e: React.TouchEvent, chatId: string) => {
    const touch = e.touches[0]
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY, chatId }
    longPressTriggeredRef.current = false
    
    // Start long press timer (500ms)
    longPressTimerRef.current = setTimeout(() => {
      if (touchStartPosRef.current) {
        e.preventDefault()
        e.stopPropagation()
        longPressTriggeredRef.current = true
        openContextMenu(touchStartPosRef.current.x, touchStartPosRef.current.y, touchStartPosRef.current.chatId)
        // Haptic feedback on mobile
        if ('vibrate' in navigator) {
          navigator.vibrate(50)
        }
      }
    }, 500)
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    // Clear long press timer if user lifts finger before timeout
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    
    // Prevent click if long press was triggered
    if (longPressTriggeredRef.current) {
      e.preventDefault()
      e.stopPropagation()
      // Reset after a short delay
      setTimeout(() => {
        longPressTriggeredRef.current = false
      }, 100)
    }
    
    touchStartPosRef.current = null
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    // Cancel long press if user moves finger too much
    if (touchStartPosRef.current && longPressTimerRef.current) {
      const touch = e.touches[0]
      const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x)
      const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y)
      
      // If moved more than 10px, cancel long press
      if (deltaX > 10 || deltaY > 10) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
        touchStartPosRef.current = null
      }
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
      }
    }
  }, [])

  const fetchChats = async (showLoading = false) => {
    if (!user) return
    
    if (showLoading) {
      setIsLoadingChats(true)
    }
    try {
        // 1. Fetch my profile if not cached
        if (!myProfile) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        if (profile) setMyProfile(profile as Profile)
        }

        // 2. Fetch all chats I am a member of
        const { data: myMemberships } = await supabase
            .from('chat_members')
            .select('chat_id')
            .eq('user_id', user.id)
        
        if (!myMemberships || myMemberships.length === 0) {
            setChats([])
            setUserChatIds([])
            return
        }
        
        const chatIds = myMemberships.map(m => m.chat_id)
        setUserChatIds(chatIds)

        // 3. Fetch chat details, all members (to find "the other person" in DMs), 
        // and last messages in efficient chunks
        
        // Fetch chats basic info
        const { data: chatsData } = await supabase
            .from('chats')
            .select('*')
            .in('id', chatIds)

        // Fetch all members of these chats
        const { data: allMembers } = await supabase
                            .from('chat_members')
            .select('chat_id, user_id, profiles!user_id(*)')
            .in('chat_id', chatIds)
        
        // Populate profile cache
        if (allMembers) {
          allMembers.forEach(m => {
            if (m.profiles) {
              const profileData = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
              if (profileData) {
                profileCache.set(m.user_id, profileData as unknown as Profile)
              }
            }
          })
        }

        // Fetch unread counts
        const { data: unreadMessages } = await supabase
                                .from('messages')
            .select('chat_id')
            .in('chat_id', chatIds)
                                .neq('sender_id', user.id)
                                .is('read_at', null)
                            
        // Fetch last messages
        const { data: lastMessages } = await supabase
            .from('messages')
            .select('*, sender:profiles!sender_id(*)')
            .in('chat_id', chatIds)
            .order('created_at', { ascending: false })

        // 4. Process everything in memory (FAST)
        const unreadCountMap = new Map<string, number>()
        unreadMessages?.forEach(m => {
            unreadCountMap.set(m.chat_id, (unreadCountMap.get(m.chat_id) || 0) + 1)
        })

        const lastMessageMap = new Map<string, Message>()
        lastMessages?.forEach(m => {
            if (!lastMessageMap.has(m.chat_id)) {
                lastMessageMap.set(m.chat_id, m as Message)
            }
        })

        const membersByChat = new Map<string, any[]>()
        allMembers?.forEach(m => {
            if (!membersByChat.has(m.chat_id)) membersByChat.set(m.chat_id, [])
            membersByChat.get(m.chat_id)?.push(m)
        })

        const processedChats = chatsData?.map(chat => {
            const members = membersByChat.get(chat.id) || []
            let otherUser = null

            if (chat.type === 'dm') {
                const otherMember = members.find(m => m.user_id !== user.id)
                const profileData = otherMember ? (Array.isArray(otherMember.profiles) ? otherMember.profiles[0] : otherMember.profiles) : null
                otherUser = (profileData as unknown as Profile) || (myProfile || null)
                    }
                    
                    return {
                        ...chat,
                lastMessage: lastMessageMap.get(chat.id) || null,
                otherUser,
                unreadCount: unreadCountMap.get(chat.id) || 0
                    }
        }) || []

        // 5. Filter and Sort
        let validChats = processedChats as any[]
            let foundSavedMessages = false
            validChats = validChats.filter((chat: any) => {
                const isSavedMessages = chat.name === 'Избранное' || 
                    (chat.type === 'dm' && chat.otherUser?.id === user.id)
                if (isSavedMessages) {
                if (foundSavedMessages) return false
                    foundSavedMessages = true
                }
                return true
            })
            
            validChats.sort((a, b) => {
                const timeA = a.lastMessage?.created_at || a.created_at
                const timeB = b.lastMessage?.created_at || b.created_at
                return new Date(timeB).getTime() - new Date(timeA).getTime()
            })

            setChats(validChats)

        // 6. Update online status
        const onlineSet = new Set<string>()
        const now = Date.now()
        validChats.forEach(chat => {
            if (chat.type === 'dm' && chat.otherUser?.last_seen_at) {
                const ls = new Date(chat.otherUser.last_seen_at).getTime()
                if (now - ls < 120000) onlineSet.add(chat.otherUser.id)
            }
        })
        setOnlineUsers(onlineSet)

    } catch (error) {
        console.error('Error fetching chats:', error)
        setChats([])
    } finally {
        setIsLoadingChats(false)
        }
    }

  // Play notification sound
  const playNotificationSound = () => {
    soundManager.playMessageReceived()
  }

  // Create "Избранное" (Saved Messages) chat for self
  const ensureSavedMessagesChat = async () => {
    if (!user) return
    
    try {
      const { data: myChats } = await supabase
        .from('chat_members')
        .select('chat_id')
        .eq('user_id', user.id)
      
      if (!myChats) return
      
      const selfChats: string[] = []
      for (const mc of myChats) {
        const { data: members } = await supabase
          .from('chat_members')
          .select('user_id')
          .eq('chat_id', mc.chat_id)
        
        if (members && members.length === 1 && members[0].user_id === user.id) {
          selfChats.push(mc.chat_id)
        }
      }
      
      if (selfChats.length > 0) {
        const [keepChatId, ...deleteChats] = selfChats
        await supabase.from('chats').update({ name: 'Избранное', type: 'dm' }).eq('id', keepChatId)
        for (const chatId of deleteChats) {
          await supabase.from('chat_members').delete().eq('chat_id', chatId)
          await supabase.from('messages').delete().eq('chat_id', chatId)
          await supabase.from('chats').delete().eq('id', chatId)
        }
        return
      }
      
      const { data: savedChat, error: chatError } = await supabase
        .from('chats')
        .insert({ type: 'dm', name: 'Избранное' })
        .select()
        .single()
      
      if (chatError) throw chatError
      if (savedChat) {
        await supabase.from('chat_members').insert({ chat_id: savedChat.id, user_id: user.id })
      }
    } catch (e) {
      console.error('Error creating saved messages chat:', e)
    }
  }

  // Update my online status periodically
  useEffect(() => {
    if (!user) return
    
    let lastUpdate = 0
    const MIN_UPDATE_INTERVAL = 20000 
    let statusUpdateEnabled = true
    
    const updateMyStatus = async (force = false) => {
      if (!statusUpdateEnabled) return
      const now = Date.now()
      if (!force && now - lastUpdate < MIN_UPDATE_INTERVAL) return
      lastUpdate = now
      
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', user.id)
        if (error && error.code === '42703') {
          statusUpdateEnabled = false
          return
        }
      } catch (error: any) {
        if (error?.code === '42703') {
          statusUpdateEnabled = false
          return
        }
        console.error('Error updating status:', error)
      }
    }
    
    updateMyStatus(true)
    const interval = setInterval(() => updateMyStatus(false), 20000)
    
    let activityTimeout: NodeJS.Timeout | null = null
    const handleActivity = () => {
      if (activityTimeout) clearTimeout(activityTimeout)
      activityTimeout = setTimeout(() => updateMyStatus(false), 5000)
    }
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') updateMyStatus(true)
    }
    
    const handleBeforeUnload = () => {
      try {
        const xhr = new XMLHttpRequest()
        xhr.open('PATCH', `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, false)
        xhr.setRequestHeader('Content-Type', 'application/json')
        xhr.setRequestHeader('apikey', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
        xhr.setRequestHeader('Authorization', `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}`)
        xhr.send(JSON.stringify({ last_seen_at: new Date().toISOString() }))
      } catch (error) {}
    }
    
    window.addEventListener('mousemove', handleActivity, { passive: true })
    window.addEventListener('keydown', handleActivity, { passive: true })
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      clearInterval(interval)
      if (activityTimeout) clearTimeout(activityTimeout)
      window.removeEventListener('mousemove', handleActivity)
      window.removeEventListener('keydown', handleActivity)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      updateMyStatus(true)
    }
  }, [user])

  // --- INITIAL LOAD & CHAT ACTIONS ---
  useEffect(() => {
    if (!user) return
    
    if (!savedMessagesChecked) {
      ensureSavedMessagesChat().then(() => {
        setSavedMessagesChecked(true)
        fetchChats(true)
      })
    } else {
      fetchChats(false)
    }

    // Request notification permission
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission()
    }
  }, [user])

  // --- SINGLE STABLE REALTIME CHANNEL ---
  useEffect(() => {
    if (!user) return
    
    const currentUserId = user.id
    const channelId = `sidebar_global_${currentUserId}_${Date.now()}`
    
    console.log('📡 [Sidebar] Setting up stable realtime channel:', channelId)

    const channel = supabase.channel(channelId)
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages' 
        }, async (payload) => {
            const message = payload.new as any
            if (message.deleted_at && message.deleted_for_all) return
            if (!userChatIdsRef.current.includes(message.chat_id)) return

            const { data: fullMessage } = await supabase
                .from('messages')
                .select('*, sender:profiles!sender_id(*)')
                .eq('id', message.id)
                .single()
            
            const msgToUse = fullMessage || message
            const currentPathChatId = typeof window !== 'undefined' 
                ? window.location.pathname.split('/').filter(Boolean)[1]
                : null
            
            if (msgToUse.sender_id !== currentUserId && msgToUse.chat_id !== currentPathChatId) {
                soundManager.playMessageReceived()
                if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
                    const senderName = (msgToUse.sender as any)?.full_name || 'Собеседник'
                    const senderAvatar = (msgToUse.sender as any)?.avatar_url
                    
                    const notificationOptions: NotificationOptions = {
                        body: msgToUse.content,
                        tag: msgToUse.chat_id,
                        icon: senderAvatar || undefined,
                        badge: senderAvatar || undefined,
                        requireInteraction: false,
                        silent: false
                    }
                    
                    new Notification(senderName, notificationOptions)
                }
            }
            
            setChats(prevChats => {
                const updated = [...prevChats]
                const index = updated.findIndex(c => c.id === msgToUse.chat_id)
                if (index === -1) {
                    fetchChats(false)
                    return prevChats
                }
                
                const chat = { ...updated[index] }
                chat.lastMessage = msgToUse
                if (msgToUse.sender_id !== currentUserId && msgToUse.chat_id !== currentPathChatId) {
                    chat.unreadCount = (chat.unreadCount || 0) + 1
                } else if (msgToUse.chat_id === currentPathChatId) {
                    chat.unreadCount = 0
                }
                
                updated[index] = chat
                return updated.sort((a, b) => {
                    const tA = new Date(a.lastMessage?.created_at || a.created_at).getTime()
                    const tB = new Date(b.lastMessage?.created_at || b.created_at).getTime()
                    return tB - tA
                })
            })
        })
        .on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'profiles'
        }, (payload) => {
            const updated = payload.new as Profile
            if (!updated.last_seen_at) {
                setOnlineUsers(prev => { const next = new Set(prev); next.delete(updated.id); return next })
                return
            }
            const lastSeen = new Date(updated.last_seen_at)
            const diffMinutes = (new Date().getTime() - lastSeen.getTime()) / 60000
            setOnlineUsers(prev => {
                const next = new Set(prev)
                if (diffMinutes < 2) next.add(updated.id)
                else next.delete(updated.id)
                return next
            })
        })
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'chat_members', 
            filter: `user_id=eq.${currentUserId}` 
        }, () => {
            fetchChats(false)
        })
        .subscribe((status) => {
            console.log('📡 [Sidebar] Realtime status:', status)
        })

    const handleChatRead = (event: any) => {
        if (event.detail?.chatId) {
            setChats(prev => prev.map(c => c.id === event.detail.chatId ? { ...c, unreadCount: 0 } : c))
            }
    }
    
    if (typeof window !== 'undefined') {
        window.addEventListener('chatRead', handleChatRead as EventListener)
    }
        
    return () => { 
        if (typeof window !== 'undefined') {
            window.removeEventListener('chatRead', handleChatRead as EventListener)
        }
        supabase.removeChannel(channel)
    }
  }, [user?.id])

  // Search logic
  useEffect(() => {
      const searchUsers = async () => {
          if (!user || !searchQuery.trim() || !searchQuery.startsWith('@')) {
              setUsers([])
              setIsSearching(false)
              return
          }
          setIsSearching(true)
          const cleanQuery = searchQuery.replace('@', '').trim()
          if (!cleanQuery) {
              setUsers([])
              setIsSearching(false)
              return
          }
          const { data } = await supabase.from('profiles').select('*').neq('id', user.id).ilike('username', `%${cleanQuery}%`)
          if (data) setUsers(data as Profile[])
          setIsSearching(false)
      }
      const timer = setTimeout(searchUsers, 300)
      return () => clearTimeout(timer)
  }, [searchQuery, user])

  const searchAllMessages = async (query: string) => {
    if (!query.trim() || !user) {
      setGlobalSearchResults([])
      return
    }
    setIsGlobalSearching(true)
    try {
      let chatIds = userChatIds
      if (chatIds.length === 0) {
        const { data } = await supabase.from('chat_members').select('chat_id').eq('user_id', user.id)
        if (!data || data.length === 0) {
          setGlobalSearchResults([]); setIsGlobalSearching(false); return
        }
        chatIds = data.map(m => m.chat_id)
        setUserChatIds(chatIds)
      }
      const { data: messages, error } = await supabase.from('messages').select('*, sender:profiles!sender_id(*), chats(id, name, type)').in('chat_id', chatIds).ilike('content', `%${query}%`).order('created_at', { ascending: false }).limit(50)
      if (error) throw error
      const results = (messages || []).map((msg: any) => ({ message: msg, chat: msg.chats, sender: msg.sender }))
      setGlobalSearchResults(results)
    } catch (error) {
      console.error('Error searching:', error)
      setGlobalSearchResults([])
    } finally {
      setIsGlobalSearching(false)
    }
  }

  const createChat = async (otherUserId: string) => {
      if (!user) return
      try {
        const { data: myChatMembers } = await supabase.from('chat_members').select('chat_id').eq('user_id', user.id)
        if (myChatMembers && myChatMembers.length > 0) {
            const myChatIds = myChatMembers.map(m => m.chat_id)
            const { data: commonChats } = await supabase.from('chat_members').select('chat_id, chats!inner(type)').eq('user_id', otherUserId).in('chat_id', myChatIds).eq('chats.type', 'dm').limit(1)
            if (commonChats && commonChats.length > 0) {
                router.push(`/chat/${commonChats[0].chat_id}`)
                setSearchQuery(''); setUsers([]); return
            }
        }
        const { data: chatData, error: chatError } = await supabase.from('chats').insert({ type: 'dm' }).select().single()
        if (chatError) throw chatError
        if (!chatData) return
        await supabase.from('chat_members').insert([{ chat_id: chatData.id, user_id: user.id }, { chat_id: chatData.id, user_id: otherUserId }])
        router.push(`/chat/${chatData.id}`); setSearchQuery(''); setUsers([])
        fetchChats(false)
      } catch (e) {
          console.error('Error creating chat:', e); alert('Ошибка при создании чата')
      }
  }

  const deleteChat = async (chatId: string, deleteForAll: boolean) => {
      if (!user) return
      try {
          if (deleteForAll) {
              await supabase.from('chat_members').delete().eq('chat_id', chatId)
              await supabase.from('chats').delete().eq('id', chatId)
          } else {
              await supabase.from('chat_members').delete().eq('chat_id', chatId).eq('user_id', user.id)
          }
          fetchChats(false)
          if (window.location.pathname.includes(chatId)) router.push('/chat')
          setDeletingChatId(null)
      } catch (error) {
          console.error('Error deleting chat:', error); alert('Ошибка при удалении чата'); setDeletingChatId(null)
      }
  }

  const fetchAvailableUsers = async (query?: string) => {
    if (!user) return
    try {
      // If we have a query, search by username (with @ support)
      if (query && query.trim()) {
        const cleanQuery = query.replace('@', '').trim()
        if (cleanQuery) {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .neq('id', user.id)
            .ilike('username', `%${cleanQuery}%`)
            .limit(20)
          
          if (error) throw error
          setAvailableUsers(data || [])
          return
        }
      }

      // Default: only users we have chats with
      const { data: chatMembers, error: membersError } = await supabase
        .from('chat_members')
        .select('user_id, profiles!user_id(*)')
        .in('chat_id', userChatIds)
        .neq('user_id', user.id)
      
      if (membersError) throw membersError
      
      // Filter out duplicate users from different chats
      const uniqueUsers: Profile[] = []
      const seenIds = new Set()
      
      chatMembers?.forEach(m => {
        if (m.profiles && !seenIds.has(m.user_id)) {
          seenIds.add(m.user_id)
          uniqueUsers.push(m.profiles as unknown as Profile)
        }
      })
      
      setAvailableUsers(uniqueUsers)
    } catch (error) {
      console.error('Error fetching available users:', error)
    }
  }

  const createGroup = async () => {
    if (!user || !groupName.trim() || selectedUsers.length === 0) {
      alert('Введите название группы и выберите участников'); return
    }
    try {
      const { data: chatData, error: chatError } = await supabase
        .from('chats')
        .insert({ 
          type: 'group', 
          name: groupName.trim()
        })
        .select()
        .single()

      if (chatError) throw chatError

      const members = [
        { chat_id: chatData.id, user_id: user.id },
        ...selectedUsers.map(userId => ({ chat_id: chatData.id, user_id: userId }))
      ]

      const { error: membersError } = await supabase
        .from('chat_members')
        .insert(members)

      if (membersError) throw membersError

      setShowCreateGroup(false); 
      setGroupName(''); 
      setSelectedUsers([]); 
      router.push(`/chat/${chatData.id}`)
    } catch (error: any) {
      console.error('Error creating group:', error); 
      alert(`Ошибка при создании группы: ${error.message || 'Неизвестная ошибка'}`)
      }
  }

  return (
    <div className="w-full md:w-80 flex flex-col h-full bg-[#0E1621] dark:bg-[#0E1621] border-r border-gray-800 dark:border-gray-800 overflow-y-auto overflow-x-hidden max-w-full">
      <div className="p-4 border-b border-gray-800 dark:border-gray-800 flex justify-between items-center bg-[#17212B] dark:bg-[#17212B]">
        <h1 className="font-bold text-xl text-blue-600">OwnGram</h1>
        <div className="flex gap-2">
            <button 
                onClick={() => router.push('/chat/profile')} 
                className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden hover:opacity-80 transition-all duration-300 ease-in-out hover:scale-110 active:scale-95"
                title="My Profile"
            >
                {myProfile?.avatar_url ? (
                    <img src={myProfile.avatar_url} className="w-full h-full object-cover" alt="Me" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-bold text-gray-500">
                        {myProfile?.username?.[1]?.toUpperCase() || <UserIcon className="w-5 h-5" />}
                    </div>
                )}
            </button>
            <button 
                onClick={() => { setShowCreateGroup(true); fetchAvailableUsers() }}
                className="w-10 h-10 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center transition-all duration-300 ease-in-out hover:scale-110 active:scale-95"
                title="Create Group"
            >
                <Plus className="w-5 h-5" />
            </button>
        </div>
      </div>

      <div className="p-3 border-b border-gray-800 dark:border-gray-800 bg-[#17212B] dark:bg-[#17212B]">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                placeholder="Поиск" 
                            value={searchQuery}
                onChange={(e) => {
                    const value = e.target.value; setSearchQuery(value)
                    if (value.trim() && value.startsWith('@')) {} 
                    else if (value.trim()) { setShowGlobalSearch(true); searchAllMessages(value) } 
                    else { setShowGlobalSearch(false); setGlobalSearchResults([]) }
                }}
                            className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 ease-in-out"
                        />
                    </div>
                </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-transparent">
         {showGlobalSearch ? (
            <div className="p-2">
                <div className="px-2 mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Результаты поиска</h3>
                    <button 
                        onClick={() => { setShowGlobalSearch(false); setGlobalSearchQuery(''); setGlobalSearchResults([]); setSearchQuery('') }} 
                        className="p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                        title="Закрыть поиск"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                {isGlobalSearching ? (
                    <div className="text-center py-4 text-gray-400 text-sm">Поиск...</div>
                ) : globalSearchResults.length > 0 ? (
                    <div className="space-y-2">
                        {globalSearchResults.map((result, idx) => (
                            <div key={idx} onClick={() => { router.push(`/chat/${result.chat.id}`); setShowGlobalSearch(false); setSearchQuery('') }} className="p-3 hover:bg-[#242F3D] dark:hover:bg-[#242F3D] rounded-lg cursor-pointer transition-all duration-300 ease-in-out flex items-start gap-3 hover:scale-[1.02] active:scale-95">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 overflow-hidden bg-gray-200 dark:bg-gray-700">
                                    {result.sender?.avatar_url ? <img src={result.sender.avatar_url} className="w-full h-full object-cover" alt="U" /> : <span className="text-gray-600 dark:text-gray-300 font-semibold text-sm">{(result.sender?.username?.[0] || 'U').toUpperCase()}</span>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="text-xs font-semibold text-gray-900 dark:text-white">{result.chat.type === 'dm' ? (result.sender?.full_name || 'User') : (result.chat.name || 'Chat')}</div>
                                        <div className="text-xs text-gray-500">{new Date(result.message.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>
                                    </div>
                                    <div className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">{result.message.content}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : <div className="text-center p-4 text-gray-400 text-sm">Ничего не найдено</div>}
            </div>
         ) : searchQuery && searchQuery.startsWith('@') ? (
            <div className="p-2">
                {isSearching ? <div className="text-center py-4 text-gray-400 text-sm">Поиск...</div> : users.length === 0 ? <div className="text-center p-4 text-gray-400 text-sm">Пользователь не найден</div> : (
                    <div className="space-y-1">
                        {users.map(u => (
                            <div key={u.id} onClick={() => createChat(u.id)} className="p-3 hover:bg-[#242F3D] dark:hover:bg-[#242F3D] rounded-lg cursor-pointer flex items-center gap-3 transition-all duration-300 ease-in-out hover:scale-[1.02] active:scale-95">
                                <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
                                    {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" alt="U" /> : <span className="text-gray-600 dark:text-gray-300 font-semibold text-sm">{(u.username?.[0] || 'U').toUpperCase()}</span>}
                                </div>
                                <div className="min-w-0 flex-1"><div className="truncate font-medium text-gray-900 dark:text-gray-100">{u.full_name || u.username}</div><div className="text-xs text-gray-500 truncate">@{u.username}</div></div>
                            </div>
                        ))}
                           </div>
                           )}
            </div>
         ) : isLoadingChats ? (
                <div className="p-8 text-center text-gray-500"><div className="animate-pulse flex flex-col items-center"><div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-full mb-4"></div><p>Загрузка чатов...</p></div></div>
            ) : chats.length === 0 ? (
                <div className="p-8 text-center text-gray-500"><p className="mb-2">No chats yet.</p><p className="text-sm">Начните поиск выше</p></div>
            ) : (
                <div className="flex flex-col">
                    {chats.map((chat: any) => {
                        const displayName = chat.type === 'dm' ? (chat.name === 'Избранное' ? 'Избранное' : (chat.otherUser?.full_name || chat.otherUser?.username || 'User')) : (chat.name || 'Chat')
                        const avatarUrl = chat.type === 'dm' ? chat.otherUser?.avatar_url : chat.avatar_url
                        const lastMsg = chat.lastMessage
                        const unreadCount = chat.unreadCount || 0
                        const typingInChat = typingUsers[chat.id] || []
                        const isTyping = typingInChat.length > 0
                        let lastMsgPreview = 'No messages yet'
                        
                        if (isTyping) {
                            if (chat.type === 'dm') {
                                lastMsgPreview = 'печатает...'
                            } else {
                                // For groups, we could ideally show the name, but for now just "кто-то печатает"
                                lastMsgPreview = 'кто-то печатает...'
                            }
                        } else if (lastMsg) {
                            const isFromMe = lastMsg.sender_id === user?.id
                            const senderName = isFromMe ? 'Вы' : (lastMsg.sender?.full_name || lastMsg.sender?.username?.replace(/^@+/, '') || 'User')
                            
                            let content = lastMsg.content
                            if (lastMsg.attachments && lastMsg.attachments.length > 0) {
                                const type = lastMsg.attachments[0].type
                                if (type === 'voice') content = '🎤 Голосовое сообщение'
                                else if (type === 'image') content = '🖼 Фото'
                                else content = '📎 Файл'
                            }
                            lastMsgPreview = `${senderName}: ${content}`
                        }
                        return (
                            <div 
                                key={chat.id} 
                                onContextMenu={(e) => handleContextMenu(e, chat.id)}
                                onTouchStart={(e) => handleTouchStart(e, chat.id)}
                                onTouchEnd={handleTouchEnd}
                                onTouchMove={handleTouchMove}
                                className="px-3 py-2.5 hover:bg-[#242F3D] dark:hover:bg-[#242F3D] cursor-pointer border-b border-gray-800 dark:border-gray-800 transition-all duration-300 ease-in-out flex items-center gap-3 relative group hover:scale-[1.01] active:scale-95"
                            >
                                <div 
                                    onClick={(e) => {
                                      // Prevent navigation if long press was triggered
                                      if (longPressTriggeredRef.current) {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        return
                                      }
                                      router.push(`/chat/${chat.id}`)
                                    }} 
                                    className="flex items-center gap-3 flex-1 min-w-0"
                                >
                                    <div className="relative w-14 h-14 rounded-full flex items-center justify-center shrink-0 bg-gray-200 dark:bg-gray-700">
                                        <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center">
                                        {avatarUrl ? (
                                                <img src={avatarUrl} className="w-full h-full object-cover" alt="U" />
                                        ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-blue-400 to-indigo-500">
                                                    {chat.type === 'group' ? (
                                                        <Users className="w-7 h-7 text-white" />
                                                    ) : (
                                                        <span className="text-white font-semibold text-lg">
                                                            {(displayName[0] || 'U').toUpperCase()}
                                            </span>
                                        )}
                                                </div>
                                            )}
                                        </div>
                                        {chat.type === 'dm' && chat.otherUser && chat.otherUser.id !== user?.id && onlineUsers.has(chat.otherUser.id) && <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full z-10" style={{ transform: 'translate(25%, 25%)' }}></div>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-0.5">
                                            <div className="font-medium text-gray-900 dark:text-gray-100 truncate text-[15px] flex items-center gap-1.5">
                                                {chat.type === 'group' && <Users className="w-4 h-4 text-blue-500 shrink-0" />}
                                                {displayName}
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                            <div className={cn(
                                                "text-sm truncate flex-1",
                                                isTyping ? "text-green-500 font-medium animate-pulse" : "text-gray-500 dark:text-gray-400"
                                            )}>
                                                {lastMsgPreview}
                                            </div>
                                            {unreadCount > 0 && <div className="bg-blue-500 text-white text-xs font-semibold rounded-full px-1.5 py-0.5 min-w-[18px] h-[18px] text-center shrink-0 flex items-center justify-center">{unreadCount}</div>}
                                        </div>
                                    </div>
                                </div>
                                {contextMenu && contextMenu.chatId === chat.id && (
                                    <div 
                                        className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px] max-w-[calc(100vw-20px)]"
                                        style={{ 
                                          top: `${contextMenu.y}px`, 
                                          left: `${contextMenu.x}px`,
                                          maxHeight: 'calc(100vh - 20px)'
                                        }}
                                    >
                                        <button onClick={(e) => { e.stopPropagation(); setDeletingChatId(chat.id); setContextMenu(null) }} className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                                            <Trash2 className="w-4 h-4" />
                                            Удалить чат
                                        </button>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
         )}
      </div>

      <div className="mt-auto p-4 border-t border-gray-800 dark:border-gray-800 bg-[#17212B] dark:bg-[#17212B] shrink-0">
        <div className="flex gap-2">
          <button onClick={() => router.push('/chat/settings')} className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-all duration-300 ease-in-out flex items-center justify-center gap-2 hover:scale-105 active:scale-95"><Settings className="w-4 h-4" /><span>Настройки</span></button>
          <button onClick={() => { signOut(); router.push('/login') }} className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all duration-300 ease-in-out flex items-center justify-center gap-2 hover:scale-105 active:scale-95"><LogOut className="w-4 h-4" /><span>Выход</span></button>
        </div>
      </div>

      {showCreateGroup && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateGroup(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between"><h2 className="text-xl font-bold text-gray-900 dark:text-white">Создать группу</h2><button onClick={() => setShowCreateGroup(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Закрыть"><X className="w-5 h-5 text-gray-500" /></button></div>
            <div className="p-4 flex-1 overflow-y-auto space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Название группы</label>
                <input 
                  type="text" 
                  value={groupName} 
                  onChange={(e) => setGroupName(e.target.value)} 
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" 
                  placeholder="Введите название группы" 
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Найти участников</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="Поиск по @username..." 
                    onChange={(e) => fetchAvailableUsers(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 ease-in-out"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Участники ({selectedUsers.length})</label>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {availableUsers.map((userProfile) => (
                    <div key={userProfile.id} onClick={() => { if (selectedUsers.includes(userProfile.id)) { setSelectedUsers(selectedUsers.filter(id => id !== userProfile.id)) } else { setSelectedUsers([...selectedUsers, userProfile.id]) } }} className={`p-3 rounded-lg cursor-pointer transition-all duration-300 ease-in-out flex items-center gap-3 hover:scale-[1.02] active:scale-95 ${selectedUsers.includes(userProfile.id) ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                      <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">{userProfile.avatar_url ? <img src={userProfile.avatar_url} className="w-full h-full object-cover" alt="U" /> : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-gray-500">{(userProfile.username?.[0] || 'U').toUpperCase()}</div>}</div>
                      <div className="flex-1"><div className="font-medium text-gray-900 dark:text-white">{userProfile.full_name || userProfile.username}</div><div className="text-sm text-gray-500 dark:text-gray-400">@{userProfile.username}</div></div>
                      {selectedUsers.includes(userProfile.id) && <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center"><span className="text-white text-xs">✓</span></div>}
                    </div>
                  ))}
                </div></div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2"><button onClick={() => { setShowCreateGroup(false); setGroupName(''); setSelectedUsers([]) }} className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-all duration-300 ease-in-out hover:scale-105 active:scale-95">Отмена</button><button onClick={createGroup} className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all duration-300 ease-in-out hover:scale-105 active:scale-95">Создать</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
