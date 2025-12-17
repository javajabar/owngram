'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Profile, Chat } from '@/types'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/useAuthStore'
import { Plus, Settings, LogOut, User as UserIcon, Search, Trash2, X, MoreVertical } from 'lucide-react'
import { soundManager } from '@/lib/sounds'

export function Sidebar() {
    const [chats, setChats] = useState<Chat[]>([])
    const [myProfile, setMyProfile] = useState<Profile | null>(null)
    const [users, setUsers] = useState<Profile[]>([]) // Found users
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [globalSearchQuery, setGlobalSearchQuery] = useState('')
  const [globalSearchResults, setGlobalSearchResults] = useState<any[]>([])
  const [isGlobalSearching, setIsGlobalSearching] = useState(false)
  const [showGlobalSearch, setShowGlobalSearch] = useState(false)
    const [deletingChatId, setDeletingChatId] = useState<string | null>(null)
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; chatId: string } | null>(null)
    const [savedMessagesChecked, setSavedMessagesChecked] = useState(false)
    const [userChatIds, setUserChatIds] = useState<string[]>([])
    const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
    const [isLoadingChats, setIsLoadingChats] = useState(false)
    const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const chatsRef = useRef<Chat[]>([])
    const router = useRouter()
    const { user, signOut } = useAuthStore()
    const [showCreateGroup, setShowCreateGroup] = useState(false)
    const [groupName, setGroupName] = useState('')
    const [selectedUsers, setSelectedUsers] = useState<string[]>([])
    const [availableUsers, setAvailableUsers] = useState<Profile[]>([])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null)
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const handleContextMenu = (e: React.MouseEvent, chatId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, chatId })
  }

  const fetchChats = async (showLoading = false) => {
    if (!user) return
    
    if (showLoading) {
      setIsLoadingChats(true)
    }
    try {
        // Fetch my profile (cache to avoid repeated calls)
        if (!myProfile) {
            const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
            if (profile) setMyProfile(profile as Profile)
        }
        const profile = myProfile

        // Fetch my chats with last message and other user info
        const { data: memberData } = await supabase
            .from('chat_members')
            .select(`
                chat_id, 
                chats(*),
                profiles!chat_members_user_id_fkey(*)
            `)
            .eq('user_id', user.id)
        
        if (!memberData || memberData.length === 0) {
            setChats([])
            return
        }
        
        const chatIds = memberData.map(m => m.chat_id).filter(Boolean)
        if (chatIds.length === 0) {
            setChats([])
            return
        }
        
        // Get current chat ID
        const currentChatId = typeof window !== 'undefined' 
            ? (() => {
                const pathParts = window.location.pathname.split('/').filter(Boolean)
                if (pathParts[0] === 'chat' && pathParts[1]) {
                    return pathParts[1]
                }
                return null
            })()
            : null
        
        // Fetch all last messages in one query (optimized)
        const { data: allLastMessages } = await supabase
            .from('messages')
            .select('*, sender:profiles(*)')
            .in('chat_id', chatIds)
            .order('created_at', { ascending: false })
        
        // Group messages by chat_id and get the latest for each
        const lastMessagesMap = new Map<string, any>()
        if (allLastMessages) {
            allLastMessages.forEach((msg: any) => {
                if (!lastMessagesMap.has(msg.chat_id)) {
                    lastMessagesMap.set(msg.chat_id, msg)
                }
            })
        }
        
        // Fetch unread counts for all chats at once (optimized) - use parallel count queries
        const unreadCountPromises = chatIds.map(async (chatId) => {
            if (chatId === currentChatId) return { chatId, count: 0 }
            const { count } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('chat_id', chatId)
                .neq('sender_id', user.id)
                .is('read_at', null)
            return { chatId, count: count || 0 }
        })
        
        const unreadCountResults = await Promise.all(unreadCountPromises)
        const unreadCountMap = new Map<string, number>()
        unreadCountResults.forEach(result => {
            unreadCountMap.set(result.chatId, result.count)
        })
        
        // For each chat, fetch last message and other user (for DM)
        const chatsWithDetails = await Promise.all(
            memberData.map(async (m: any) => {
                const chat = m.chats
                if (!chat) return null
                
                const lastMessage = lastMessagesMap.get(chat.id) || null
                const unreadCount = currentChatId === chat.id ? 0 : (unreadCountMap.get(chat.id) || 0)
                
                // For DM, get other user (or self for "Избранное")
                let otherUser = null
                if (chat.type === 'dm') {
                    const { data: otherMember } = await supabase
                        .from('chat_members')
                        .select('profiles(*)')
                        .eq('chat_id', chat.id)
                        .neq('user_id', user.id)
                        .maybeSingle()
                    if (otherMember?.profiles) {
                        otherUser = otherMember.profiles
                    } else {
                        // If no other user, this is "Избранное" (self-chat)
                        otherUser = profile as Profile
                    }
                }
                
                return {
                    ...chat,
                    lastMessage: lastMessage || null,
                    otherUser: otherUser || null,
                    unreadCount: unreadCount || 0
                }
            })
        )
            
            let validChats = chatsWithDetails.filter(Boolean) as any[]
            
            // Filter out duplicate "Избранное" chats - keep only the first one
            let foundSavedMessages = false
            validChats = validChats.filter((chat: any) => {
                const isSavedMessages = chat.name === 'Избранное' || 
                    (chat.type === 'dm' && chat.otherUser?.id === user.id)
                if (isSavedMessages) {
                    if (foundSavedMessages) return false // Skip duplicates
                    foundSavedMessages = true
                }
                return true
            })
            
            // Sort by last message time
            validChats.sort((a, b) => {
                const timeA = a.lastMessage?.created_at || a.created_at
                const timeB = b.lastMessage?.created_at || b.created_at
                return new Date(timeB).getTime() - new Date(timeA).getTime()
            })
            setChats(validChats)
            chatsRef.current = validChats
            
            // Update online status for other users
            const otherUserIds = new Set<string>()
            validChats.forEach(chat => {
                if (chat.type === 'dm' && chat.otherUser && chat.otherUser.id !== user.id) {
                    otherUserIds.add(chat.otherUser.id)
                }
            })
            
            // Check online status for all other users (only if column exists)
            if (otherUserIds.size > 0) {
                try {
                    const userIdsArray = Array.from(otherUserIds)
                    const { data: profiles, error } = await supabase
                        .from('profiles')
                        .select('id, last_seen_at')
                        .in('id', userIdsArray)
                    
                    if (error) {
                        // If column doesn't exist, just skip online status
                        if (error.code === '42703') {
                            return
                        }
                        console.error('Error fetching online status:', error)
                        return
                    }
                    
                    if (profiles) {
                        const now = new Date()
                        const onlineSet = new Set<string>()
                        profiles.forEach(profile => {
                            if (profile.last_seen_at) {
                                const lastSeen = new Date(profile.last_seen_at)
                                const diffMinutes = (now.getTime() - lastSeen.getTime()) / 60000
                                if (diffMinutes < 2) {
                                    onlineSet.add(profile.id)
                                }
                            }
                        })
                        setOnlineUsers(onlineSet)
                    }
                } catch (error: any) {
                    // If column doesn't exist, just skip
                    if (error?.code === '42703') {
                        return
                    }
                    console.error('Error checking online status:', error)
                }
            }
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
      // Get ALL my DM chats
      const { data: myChats } = await supabase
        .from('chat_members')
        .select('chat_id')
        .eq('user_id', user.id)
      
      if (!myChats) return
      
      // Find all self-chats (chats where I'm the only member)
      const selfChats: string[] = []
      
      for (const mc of myChats) {
        const { data: members } = await supabase
          .from('chat_members')
          .select('user_id')
          .eq('chat_id', mc.chat_id)
        
        // If I'm the only member, it's a self-chat
        if (members && members.length === 1 && members[0].user_id === user.id) {
          selfChats.push(mc.chat_id)
        }
      }
      
      if (selfChats.length > 0) {
        // Keep only the first one, delete the rest
        const [keepChatId, ...deleteChats] = selfChats
        
        // Update the first one to have name "Избранное"
        await supabase
          .from('chats')
          .update({ name: 'Избранное', type: 'dm' })
          .eq('id', keepChatId)
        
        // Delete duplicates
        for (const chatId of deleteChats) {
          await supabase.from('chat_members').delete().eq('chat_id', chatId)
          await supabase.from('messages').delete().eq('chat_id', chatId)
          await supabase.from('chats').delete().eq('id', chatId)
        }
        
        return // We have a saved messages chat now
      }
      
      // No self-chat exists, create one
      const { data: savedChat, error: chatError } = await supabase
        .from('chats')
        .insert({ type: 'dm', name: 'Избранное' })
        .select()
        .single()
      
      if (chatError) throw chatError
      if (!savedChat) return
      
      // Add user as the only member
      await supabase
        .from('chat_members')
        .insert({ chat_id: savedChat.id, user_id: user.id })
        
    } catch (e) {
      console.error('Error creating saved messages chat:', e)
    }
  }

  // Update online status globally
  useEffect(() => {
    if (!user) return
    
    let lastUpdate = 0
    const MIN_UPDATE_INTERVAL = 20000 // 20 seconds minimum between updates
    let statusUpdateEnabled = true
    
    const updateMyStatus = async (force = false) => {
      if (!statusUpdateEnabled) return
      
      const now = Date.now()
      // Only update if at least 20 seconds have passed (or forced)
      if (!force && now - lastUpdate < MIN_UPDATE_INTERVAL) {
        return
      }
      lastUpdate = now
      
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', user.id)
        
        if (error && error.code === '42703') {
          // Column doesn't exist, stop trying to update
          statusUpdateEnabled = false
          return
        }
      } catch (error: any) {
        if (error?.code === '42703') {
          // Column doesn't exist, stop trying
          statusUpdateEnabled = false
          return
        }
        console.error('Error updating status:', error)
      }
    }
    
    // Update immediately
    updateMyStatus(true)
    
    // Update every 20 seconds
    const interval = setInterval(() => updateMyStatus(false), 20000)
    
    // Update on activity (debounced)
    let activityTimeout: NodeJS.Timeout | null = null
    const handleActivity = () => {
      if (activityTimeout) {
        clearTimeout(activityTimeout)
      }
      // Update after 5 seconds of activity
      activityTimeout = setTimeout(() => updateMyStatus(false), 5000)
    }
    
    // Handle page visibility - update when page becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateMyStatus(true) // Force update when page becomes visible
      }
    }
    
    // Handle page unload - send final update
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Use synchronous XMLHttpRequest for reliable delivery on page close
      try {
        const xhr = new XMLHttpRequest()
        xhr.open('PATCH', `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, false) // false = synchronous
        xhr.setRequestHeader('Content-Type', 'application/json')
        xhr.setRequestHeader('apikey', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
        xhr.setRequestHeader('Authorization', `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}`)
        xhr.send(JSON.stringify({ last_seen_at: new Date().toISOString() }))
      } catch (error) {
        // Ignore errors on unload
      }
    }
    
    window.addEventListener('mousemove', handleActivity, { passive: true })
    window.addEventListener('keydown', handleActivity, { passive: true })
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      clearInterval(interval)
      if (activityTimeout) {
        clearTimeout(activityTimeout)
      }
      window.removeEventListener('mousemove', handleActivity)
      window.removeEventListener('keydown', handleActivity)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      // Final update on cleanup
      updateMyStatus(true)
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    
    // Ensure "Избранное" chat exists (only once)
    if (!savedMessagesChecked) {
      ensureSavedMessagesChat().then(() => {
        setSavedMessagesChecked(true)
        fetchChats(true) // Show loading only on initial load
      })
    } else {
      fetchChats(false) // Don't show loading on subsequent loads
    }

    let currentChatId: string | null = null
    // Get current chat ID from URL
    if (typeof window !== 'undefined') {
      const pathParts = window.location.pathname.split('/')
      if (pathParts[1] === 'chat' && pathParts[2]) {
        currentChatId = pathParts[2]
      }
      
      // Listen for chat read and chat left events
      const handleChatRead = (event: CustomEvent) => {
        if (event.detail?.chatId) {
          // Update unread count locally without full refresh
          setChats(prev => prev.map(chat => 
            chat.id === event.detail.chatId 
              ? { ...chat, unreadCount: 0 }
              : chat
          ))
        }
      }
      
      const handleChatLeft = (event: CustomEvent) => {
        // No need to refresh - real-time updates will handle it
      }
      
      window.addEventListener('chatRead', handleChatRead as EventListener)
      window.addEventListener('chatLeft', handleChatLeft as EventListener)
      
      return () => {
        window.removeEventListener('chatRead', handleChatRead as EventListener)
        window.removeEventListener('chatLeft', handleChatLeft as EventListener)
      }
    }

    // Request notification permission on mount
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission()
    }

    // Get user's chat IDs for filtering
    supabase
        .from('chat_members')
        .select('chat_id')
        .eq('user_id', user.id)
        .then(({ data }) => {
            if (data) {
                setUserChatIds(data.map(m => m.chat_id))
            }
        })
    
    const channel = supabase.channel('sidebar_chats')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_members', filter: `user_id=eq.${user.id}` }, () => {
            fetchChats(false) // Don't show loading
        })
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages'
        }, async (payload) => {
            const message = payload.new as any
            
            // Skip deleted messages
            if (message.deleted_at && message.deleted_for_all) return
            
            // Check if user is a member of this chat (client-side filter)
            // Double-check by querying
            const { data: memberCheck } = await supabase
                .from('chat_members')
                .select('chat_id')
                .eq('chat_id', message.chat_id)
                .eq('user_id', user.id)
                .maybeSingle()
            
            if (!memberCheck) return // Not a member, ignore
            
            // Get current chat ID dynamically
            const currentPathChatId = typeof window !== 'undefined' 
                ? (() => {
                    const pathParts = window.location.pathname.split('/').filter(Boolean)
                    if (pathParts[0] === 'chat' && pathParts[1]) {
                        return pathParts[1]
                    }
                    return null
                })()
                : null
            
            // Fetch full message with sender info
            const { data: fullMessage } = await supabase
                .from('messages')
                .select('*, sender:profiles(*)')
                .eq('id', message.id)
                .single()
            
            if (!fullMessage) {
                // If we can't fetch full message, do a full refresh (silent)
                fetchChats(false)
                return
            }
            
            // Play sound and show notification if message is not from current user and not in current chat
            if (fullMessage.sender_id !== user.id && fullMessage.chat_id !== currentPathChatId) {
                playNotificationSound()
                // Show browser notification only if page is not focused
                if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
                    const senderName = (fullMessage.sender as any)?.full_name || 
                                     (fullMessage.sender as any)?.username?.replace(/^@+/, '') || 
                                     'Someone'
                    const content = fullMessage.attachments?.length > 0 
                        ? (fullMessage.attachments[0].type === 'voice' ? '🎤 Голосовое сообщение' : '📎 Вложение')
                        : fullMessage.content
                    
                    new Notification(`${senderName}`, {
                        body: content,
                        icon: (fullMessage.sender as any)?.avatar_url || '/favicon.ico',
                        tag: fullMessage.chat_id,
                        requireInteraction: false
                    })
                }
            }
            
            // Update chat in state
            setChats(prevChats => {
                const chatIndex = prevChats.findIndex(c => c.id === fullMessage.chat_id)
                if (chatIndex === -1) {
                    // New chat - do full refresh (silent)
                    fetchChats(false)
                    return prevChats
                }
                
                const updatedChats = [...prevChats]
                const chat = { ...updatedChats[chatIndex] }
                
                // Update last message with full data
                chat.lastMessage = fullMessage
                
                // Update unread count if not from me and not currently viewing
                if (fullMessage.sender_id !== user.id && fullMessage.chat_id !== currentPathChatId) {
                    chat.unreadCount = (chat.unreadCount || 0) + 1
                } else if (fullMessage.chat_id === currentPathChatId) {
                    // If viewing this chat, unread count should be 0
                    chat.unreadCount = 0
                }
                
                updatedChats[chatIndex] = chat
                
                // Re-sort by last message time
                updatedChats.sort((a, b) => {
                    const timeA = a.lastMessage?.created_at || a.created_at
                    const timeB = b.lastMessage?.created_at || b.created_at
                    return new Date(timeB).getTime() - new Date(timeA).getTime()
                })
                
                return updatedChats
            })
        })
        .on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'messages'
        }, async (payload) => {
            const updatedMessage = payload.new as any
            
            // Check if user is a member of this chat
            const { data: memberCheck } = await supabase
                .from('chat_members')
                .select('chat_id')
                .eq('chat_id', updatedMessage.chat_id)
                .eq('user_id', user.id)
                .maybeSingle()
            
            if (!memberCheck) return
            
            // Update chat in state immediately for read status
            setChats(prevChats => {
                const chatIndex = prevChats.findIndex(c => c.id === updatedMessage.chat_id)
                if (chatIndex === -1) return prevChats
                
                const updatedChats = [...prevChats]
                const chat = { ...updatedChats[chatIndex] }
                
                // If this is the last message, update it
                if (chat.lastMessage?.id === updatedMessage.id) {
                    chat.lastMessage = { ...chat.lastMessage, ...updatedMessage }
                }
                
                // If message was deleted, refresh (silent)
                if (updatedMessage.deleted_at && updatedMessage.deleted_for_all) {
                    fetchChats(false)
                    return prevChats
                }
                
                updatedChats[chatIndex] = chat
                return updatedChats
            })
            
            // Debounced full refresh for other updates
            if (fetchTimeoutRef.current) {
                clearTimeout(fetchTimeoutRef.current)
            }
            fetchTimeoutRef.current = setTimeout(() => {
                fetchChats(false) // Silent refresh
            }, 500)
        })
        .subscribe()
        
    return () => { 
        supabase.removeChannel(channel)
        // Clean up fetch timeout
        if (fetchTimeoutRef.current) {
            clearTimeout(fetchTimeoutRef.current)
        }
    }
  }, [user, myProfile])
  
  // Subscribe to profile updates for online status (separate effect)
  useEffect(() => {
    if (!user || chats.length === 0) return
    
    const profileChannels: any[] = []
    const otherUserIds = new Set<string>()
    
    chats.forEach(chat => {
        if (chat.type === 'dm' && chat.otherUser && chat.otherUser.id !== user.id) {
            otherUserIds.add(chat.otherUser.id)
        }
    })
    
    // Subscribe to updates for all other users (only if column exists)
    otherUserIds.forEach(userId => {
        const profileChannel = supabase.channel(`profile_status:${userId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'profiles',
                filter: `id=eq.${userId}`
            }, (payload) => {
                const updated = payload.new as Profile
                // Immediately update status when we get real-time update
                if ('last_seen_at' in updated && updated.last_seen_at) {
                    const lastSeen = new Date(updated.last_seen_at)
                    const now = new Date()
                    const diffMinutes = (now.getTime() - lastSeen.getTime()) / 60000
                    setOnlineUsers(prev => {
                        const next = new Set(prev)
                        if (diffMinutes < 2) {
                            next.add(updated.id)
                        } else {
                            next.delete(updated.id)
                        }
                        return next
                    })
                } else {
                    // If last_seen_at is null, user is offline
                    setOnlineUsers(prev => {
                        const next = new Set(prev)
                        next.delete(updated.id)
                        return next
                    })
                }
            })
            .subscribe()
        profileChannels.push(profileChannel)
    })
    
    return () => {
        profileChannels.forEach(ch => supabase.removeChannel(ch))
    }
  }, [user, chats])

  // Search users logic
  useEffect(() => {
      const searchUsers = async () => {
          if (!user) return
          
          // Only search if user has typed something starting with @
          const trimmedQuery = searchQuery.trim()
          if (!trimmedQuery || !trimmedQuery.startsWith('@')) {
              setUsers([])
              setIsSearching(false)
              return
          }
          
          setIsSearching(true)
          
          // Remove @ and search by username
          const cleanQuery = trimmedQuery.replace('@', '').trim()
          if (!cleanQuery) {
              setUsers([])
              setIsSearching(false)
              return
          }
          
          const { data } = await supabase
              .from('profiles')
              .select('*')
              .neq('id', user.id)
              .ilike('username', `%${cleanQuery}%`)
          
          if (data) setUsers(data as Profile[])
          setIsSearching(false)
      }

      // Debounce search
      const timer = setTimeout(searchUsers, 300)
      return () => clearTimeout(timer)
  }, [searchQuery, user])

  // Global search in all chats
  const searchAllMessages = async (query: string) => {
    if (!query.trim() || !user) {
      setGlobalSearchResults([])
      return
    }
    
    setIsGlobalSearching(true)
    try {
      // Get all user's chat IDs
      const { data: memberData } = await supabase
        .from('chat_members')
        .select('chat_id')
        .eq('user_id', user.id)
      
      if (!memberData || memberData.length === 0) {
        setGlobalSearchResults([])
        setIsGlobalSearching(false)
        return
      }
      
      const chatIds = memberData.map(m => m.chat_id)
      
      // Search messages in all chats
      const { data: messages, error } = await supabase
        .from('messages')
        .select('*, sender:profiles(*), chats(id, name, type)')
        .in('chat_id', chatIds)
        .ilike('content', `%${query}%`)
        .order('created_at', { ascending: false })
        .limit(50)
      
      if (error) throw error
      
      // Group by chat and format results
      const results = (messages || []).map((msg: any) => ({
        message: msg,
        chat: msg.chats,
        sender: msg.sender
      }))
      
      setGlobalSearchResults(results)
    } catch (error) {
      console.error('Error searching messages:', error)
      setGlobalSearchResults([])
    } finally {
      setIsGlobalSearching(false)
    }
  }

  const createChat = async (otherUserId: string) => {
      if (!user) return

      try {
        // 1. Check for existing DM with this user
        // Get all chats where I am a member
        const { data: myChatMembers } = await supabase
            .from('chat_members')
            .select('chat_id')
            .eq('user_id', user.id)
        
        if (myChatMembers && myChatMembers.length > 0) {
            const myChatIds = myChatMembers.map(m => m.chat_id)
            
            // Check if other user is in any of these chats AND the chat is a DM
            const { data: commonChats } = await supabase
                .from('chat_members')
                .select('chat_id, chats!inner(type)')
                .eq('user_id', otherUserId)
                .in('chat_id', myChatIds)
                .eq('chats.type', 'dm')
                .limit(1)
            
            if (commonChats && commonChats.length > 0) {
                // Found existing DM
                const existingChatId = commonChats[0].chat_id
                router.push(`/chat/${existingChatId}`)
                setSearchQuery('')
                setUsers([])
                return
            }
        }
        
        // No existing chat found, create a new one
        // 1. Create Chat
        const { data: chatData, error: chatError } = await supabase
            .from('chats')
            .insert({ type: 'dm' })
            .select()
            .single()
        
        if (chatError) throw chatError
        if (!chatData) return

        // 2. Add Members
        const { error: memberError } = await supabase
            .from('chat_members')
            .insert([
                { chat_id: chatData.id, user_id: user.id },
                { chat_id: chatData.id, user_id: otherUserId }
            ])
        
        if (memberError) throw memberError

        // 3. Navigate
        router.push(`/chat/${chatData.id}`)
        setSearchQuery('')
        setUsers([])
        
        // Refresh list (silent)
        fetchChats(false)
      } catch (e) {
          console.error('Error creating chat:', e)
          alert('Ошибка при создании чата')
      }
  }

  const deleteChat = async (chatId: string, deleteForAll: boolean) => {
      if (!user) return
      
      try {
          if (deleteForAll) {
              // Delete chat completely (remove all members and messages)
              // First, remove all members
              const { error: membersError } = await supabase
                  .from('chat_members')
                  .delete()
                  .eq('chat_id', chatId)
              
              if (membersError) throw membersError
              
              // Then delete the chat
              const { error: chatError } = await supabase
                  .from('chats')
                  .delete()
                  .eq('id', chatId)
              
              if (membersError) throw chatError
          } else {
              // Remove only current user from chat
              const { error } = await supabase
                  .from('chat_members')
                  .delete()
                  .eq('chat_id', chatId)
                  .eq('user_id', user.id)
              
              if (error) throw error
          }
          
          // Refresh chat list (silent)
          fetchChats(false)
          
          // If we're currently in this chat, redirect to chat list
          if (window.location.pathname.includes(chatId)) {
              router.push('/chat')
          }
          
          setDeletingChatId(null)
      } catch (error) {
          console.error('Error deleting chat:', error)
          alert('Ошибка при удалении чата')
          setDeletingChatId(null)
      }
  }

  const fetchAvailableUsers = async () => {
    if (!user) return
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', user.id)
        .limit(50)
      
      if (error) throw error
      setAvailableUsers(data || [])
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  const createGroup = async () => {
    if (!user || !groupName.trim() || selectedUsers.length === 0) {
      alert('Введите название группы и выберите участников')
      return
    }

    try {
      // Create group chat
      const { data: chatData, error: chatError } = await supabase
        .from('chats')
        .insert({
          type: 'group',
          name: groupName.trim(),
          created_at: new Date().toISOString()
        })
        .select()
        .single()

      if (chatError) throw chatError

      // Add current user and selected users to group
      const members = [
        { chat_id: chatData.id, user_id: user.id, created_at: new Date().toISOString() },
        ...selectedUsers.map(userId => ({
          chat_id: chatData.id,
          user_id: userId,
          created_at: new Date().toISOString()
        }))
      ]

      const { error: membersError } = await supabase
        .from('chat_members')
        .insert(members)

      if (membersError) throw membersError

      setShowCreateGroup(false)
      setGroupName('')
      setSelectedUsers([])
      router.push(`/chat/${chatData.id}`)
    } catch (error: any) {
      console.error('Error creating group:', error)
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
                className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden hover:opacity-80 transition-opacity"
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
                onClick={() => {
                  setShowCreateGroup(true)
                  fetchAvailableUsers()
                }}
                className="w-10 h-10 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center transition-colors"
                title="Create Group"
            >
                <Plus className="w-5 h-5" />
            </button>
        </div>
      </div>

      {/* Search Bar - Always visible */}
      <div className="p-3 border-b border-gray-800 dark:border-gray-800 bg-[#17212B] dark:bg-[#17212B]">
        <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input 
                type="text" 
                placeholder="Поиск" 
                value={searchQuery}
                onChange={(e) => {
                    const value = e.target.value
                    setSearchQuery(value)
                    if (value.trim() && value.startsWith('@')) {
                        // Search users
                    } else if (value.trim()) {
                        // Search messages globally
                        setShowGlobalSearch(true)
                        searchAllMessages(value)
                    } else {
                        setShowGlobalSearch(false)
                        setGlobalSearchResults([])
                    }
                }}
                className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-transparent">
         {showGlobalSearch ? (
            <div className="p-2">
                <div className="px-2 mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Результаты поиска</h3>
                    <button
                        onClick={() => {
                            setShowGlobalSearch(false)
                            setGlobalSearchQuery('')
                            setGlobalSearchResults([])
                            setSearchQuery('')
                        }}
                        className="p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                
                {isGlobalSearching ? (
                    <div className="text-center py-4 text-gray-400 text-sm">Поиск...</div>
                ) : globalSearchResults.length > 0 ? (
                    <div className="space-y-2">
                        {globalSearchResults.map((result, idx) => (
                            <div
                                key={idx}
                                onClick={() => {
                                    router.push(`/chat/${result.chat.id}`)
                                    setShowGlobalSearch(false)
                                    setSearchQuery('')
                                }}
                                className="p-3 hover:bg-[#242F3D] dark:hover:bg-[#242F3D] rounded-lg cursor-pointer transition-colors flex items-start gap-3"
                            >
                                {/* Avatar */}
                                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 overflow-hidden bg-gray-200 dark:bg-gray-700">
                                    {result.sender?.avatar_url ? (
                                        <img 
                                            src={result.sender.avatar_url} 
                                            className="w-full h-full object-cover" 
                                            alt={result.sender.username || 'User'} 
                                        />
                                    ) : (
                                        <span className="text-gray-600 dark:text-gray-300 font-semibold text-sm">
                                            {(result.sender?.username?.[0] || result.sender?.full_name?.[0] || 'U').toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="text-xs font-semibold text-gray-900 dark:text-white">
                                            {result.chat.type === 'dm' 
                                                ? (result.sender?.full_name || result.sender?.username?.replace(/^@+/, '') || 'User')
                                                : (result.chat.name || 'Chat')
                                            }
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {new Date(result.message.created_at).toLocaleDateString('ru-RU', { 
                                                day: 'numeric', 
                                                month: 'short',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </div>
                                    </div>
                                    <div className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                                        {result.message.content}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : searchQuery ? (
                    <div className="text-center p-4 text-gray-400 text-sm">
                        Ничего не найдено
                    </div>
                ) : null}
            </div>
         ) : searchQuery && searchQuery.startsWith('@') ? (
            <div className="p-2">
                {isSearching ? (
                    <div className="text-center py-4 text-gray-400 text-sm">Поиск...</div>
                ) : users.length === 0 ? (
                    <div className="text-center p-4 text-gray-400 text-sm">
                        {searchQuery ? `Пользователь не найден для "@${searchQuery.replace(/^@+/, '')}"` : "Введите @username для поиска"}
                    </div>
                ) : (
                    <div className="space-y-1">
                        {users.map(u => {
                        const cleanUsername = u.username?.replace(/^@+/, '') || 'Anonymous'
                        return (
                        <div 
                           key={u.id} 
                           onClick={() => createChat(u.id)} 
                           className="p-3 hover:bg-[#242F3D] dark:hover:bg-[#242F3D] rounded-lg cursor-pointer flex items-center gap-3 transition-colors"
                        >
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center shrink-0 text-white font-bold">
                               {u.avatar_url ? (
                                   <img src={u.avatar_url} className="w-10 h-10 rounded-full object-cover" alt={cleanUsername} />
                               ) : (
                                   (cleanUsername[0] || u.full_name?.[0] || 'U').toUpperCase()
                               )}
                            </div>
                        <div className="min-w-0">
                           <div className="truncate font-medium text-gray-900 dark:text-gray-100">
                                {u.full_name || cleanUsername}
                           </div>
                           {u.full_name && (
                               <div className="text-xs text-gray-500 truncate">@{cleanUsername}</div>
                           )}
                        </div>
                        </div>
                        )
                        })}
                    </div>
                )}
            </div>
         ) : showGlobalSearch ? (
            <div className="p-2">
                <div className="px-2 mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Поиск</h3>
                        <button
                            onClick={() => {
                                setShowGlobalSearch(false)
                                setGlobalSearchQuery('')
                                setGlobalSearchResults([])
                            }}
                            className="p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Поиск" 
                            value={globalSearchQuery}
                            onChange={(e) => {
                                setGlobalSearchQuery(e.target.value)
                                searchAllMessages(e.target.value)
                            }}
                            className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                            autoFocus
                        />
                    </div>
                </div>
                
                {isGlobalSearching ? (
                    <div className="text-center py-4 text-gray-400 text-sm">Поиск...</div>
                ) : globalSearchResults.length > 0 ? (
                    <div className="space-y-2">
                        {globalSearchResults.map((result, idx) => (
                            <div
                                key={idx}
                                onClick={() => {
                                    router.push(`/chat/${result.chat.id}`)
                                    setShowGlobalSearch(false)
                                }}
                                className="p-3 hover:bg-[#242F3D] dark:hover:bg-[#242F3D] rounded-lg cursor-pointer transition-colors"
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="text-xs font-semibold text-gray-900 dark:text-white">
                                        {result.chat.type === 'dm' 
                                            ? (result.sender?.full_name || result.sender?.username?.replace(/^@+/, '') || 'User')
                                            : (result.chat.name || 'Chat')
                                        }
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {new Date(result.message.created_at).toLocaleDateString('ru-RU', { 
                                            day: 'numeric', 
                                            month: 'short',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </div>
                                </div>
                                <div className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                                    {result.message.content}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : globalSearchQuery ? (
                    <div className="text-center p-4 text-gray-400 text-sm">
                        Ничего не найдено
                    </div>
                ) : (
                    <div className="text-center p-4 text-gray-400 text-sm">
                        Введите запрос для поиска
                    </div>
                )}
            </div>
         ) : isLoadingChats ? (
                <div className="p-8 text-center text-gray-500">
                    <div className="animate-pulse flex flex-col items-center">
                        <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-full mb-4"></div>
                        <p>Загрузка чатов...</p>
                    </div>
                </div>
            ) : chats.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                    <p className="mb-2">No chats yet.</p>
                    <p className="text-sm">Начните поиск выше</p>
                </div>
            ) : (
                <div className="flex flex-col">
                    {chats.map((chat: any) => {
                        const displayName = chat.type === 'dm' 
                            ? (chat.name === 'Избранное' ? 'Избранное' : (chat.otherUser?.full_name || chat.otherUser?.username?.replace(/^@+/, '') || 'User'))
                            : (chat.name || 'Chat')
                        const avatarUrl = chat.type === 'dm' ? chat.otherUser?.avatar_url : null
                        const lastMsg = chat.lastMessage
                        const unreadCount = chat.unreadCount || 0
                        
                        // Format last message preview
                        let lastMsgPreview = 'No messages yet'
                        if (lastMsg) {
                            const isFromMe = lastMsg.sender_id === user?.id
                            let senderName = 'User'
                            if (isFromMe) {
                                senderName = 'Вы'
                            } else if (lastMsg.sender) {
                                // Use full_name first, or username without @
                                senderName = lastMsg.sender.full_name || (lastMsg.sender.username?.replace(/^@/, '') || 'User')
                            }
                            const content = lastMsg.attachments?.length > 0 
                                ? (lastMsg.attachments[0].type === 'voice' ? '🎤 Голосовое сообщение' : '📎 Вложение')
                                : lastMsg.content
                            lastMsgPreview = `${senderName}: ${content}`
                        }
                        
                        // Format time
                        let timeStr = ''
                        if (lastMsg?.created_at) {
                            const msgDate = new Date(lastMsg.created_at)
                            const now = new Date()
                            const diffMs = now.getTime() - msgDate.getTime()
                            const diffMins = Math.floor(diffMs / 60000)
                            const diffHours = Math.floor(diffMs / 3600000)
                            const diffDays = Math.floor(diffMs / 86400000)
                            
                            if (diffMins < 1) timeStr = 'только что'
                            else if (diffMins < 60) timeStr = `${diffMins}м`
                            else if (diffHours < 24) timeStr = `${diffHours}ч`
                            else if (diffDays < 7) timeStr = `${diffDays}д`
                            else timeStr = msgDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
                        }
                        
                        return (
                            <div 
                                key={chat.id} 
                                onContextMenu={(e) => handleContextMenu(e, chat.id)}
                                className="px-3 py-2.5 hover:bg-[#242F3D] dark:hover:bg-[#242F3D] cursor-pointer border-b border-gray-800 dark:border-gray-800 transition-colors flex items-center gap-3 relative group"
                            >
                                <div 
                                    onClick={() => router.push(`/chat/${chat.id}`)} 
                                    className="flex items-center gap-3 flex-1 min-w-0"
                                >
                                    {/* Avatar */}
                                    <div className="relative w-14 h-14 rounded-full flex items-center justify-center shrink-0 overflow-visible bg-gray-200 dark:bg-gray-700">
                                        <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center">
                                            {avatarUrl ? (
                                                <img src={avatarUrl} className="w-full h-full object-cover" alt={displayName} />
                                            ) : (
                                                <span className="text-gray-600 dark:text-gray-300 font-semibold text-lg flex items-center justify-center">
                                                    {displayName[0]?.toUpperCase() || '?'}
                                                </span>
                                            )}
                                        </div>
                                        {/* Online indicator - частично на аватаре, частично на фоне */}
                                        {chat.type === 'dm' && chat.otherUser && chat.otherUser.id !== user?.id && onlineUsers.has(chat.otherUser.id) && (
                                            <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full z-10" style={{ transform: 'translate(25%, 25%)' }}></div>
                                        )}
                                    </div>
                                    
                                    {/* Chat info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-0.5">
                                            <div className="font-medium text-gray-900 dark:text-gray-100 truncate text-[15px]">
                                                {displayName}
                                            </div>
                                            {timeStr && (
                                                <div className="text-xs text-gray-500 dark:text-gray-400 ml-2 shrink-0">{timeStr}</div>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="text-sm text-gray-500 dark:text-gray-400 truncate flex-1">
                                                {lastMsgPreview}
                                            </div>
                                            {unreadCount > 0 && (
                                                <div className="bg-blue-500 text-white text-xs font-semibold rounded-full px-1.5 py-0.5 min-w-[18px] h-[18px] text-center shrink-0 flex items-center justify-center">
                                                    {unreadCount > 99 ? '99+' : unreadCount}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Chat Context Menu */}
                                {contextMenu?.chatId === chat.id && contextMenu && (
                                    <div 
                                        className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]"
                                        style={{ top: contextMenu.y, left: contextMenu.x }}
                                    >
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setDeletingChatId(chat.id)
                                                setContextMenu(null)
                                            }}
                                            className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            Удалить чат
                                        </button>
                                    </div>
                                )}

                                {/* Delete Confirmation Modal */}
                                {deletingChatId === chat.id && (
                                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6">
                                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                                                Удалить чат?
                                            </h3>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                                Выберите способ удаления:
                                            </p>
                                            <div className="space-y-2">
                                                <button
                                                    onClick={() => deleteChat(chat.id, false)}
                                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                                >
                                                    Удалить только для меня
                                                </button>
                                                <button
                                                    onClick={() => deleteChat(chat.id, true)}
                                                    className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                                >
                                                    Удалить для всех
                                                </button>
                                                <button
                                                    onClick={() => setDeletingChatId(null)}
                                                    className="w-full px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                                >
                                                    Отмена
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
      </div>

      {/* Bottom Footer - Settings and Logout */}
      <div className="mt-auto p-4 border-t border-gray-800 dark:border-gray-800 bg-[#17212B] dark:bg-[#17212B] shrink-0">
        <div className="flex gap-2">
          <button 
            onClick={() => router.push('/chat/settings')} 
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Settings className="w-4 h-4" />
            <span>Настройки</span>
          </button>
          <button 
            onClick={() => { signOut(); router.push('/login') }} 
            className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Выход</span>
          </button>
        </div>
      </div>

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateGroup(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Создать группу</h2>
              <button onClick={() => setShowCreateGroup(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Название группы
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Введите название группы"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Участники ({selectedUsers.length})
                </label>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {availableUsers.map((userProfile) => (
                    <div
                      key={userProfile.id}
                      onClick={() => {
                        if (selectedUsers.includes(userProfile.id)) {
                          setSelectedUsers(selectedUsers.filter(id => id !== userProfile.id))
                        } else {
                          setSelectedUsers([...selectedUsers, userProfile.id])
                        }
                      }}
                      className={`p-3 rounded-lg cursor-pointer transition-colors flex items-center gap-3 ${
                        selectedUsers.includes(userProfile.id)
                          ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500'
                          : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                        {userProfile.avatar_url ? (
                          <img src={userProfile.avatar_url} className="w-full h-full object-cover" alt={userProfile.username || 'User'} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm font-bold text-gray-500">
                            {userProfile.username?.[1]?.toUpperCase() || userProfile.full_name?.[0]?.toUpperCase() || 'U'}
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {userProfile.full_name || userProfile.username?.replace(/^@+/, '') || 'User'}
                        </div>
                        {userProfile.username && (
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            @{userProfile.username.replace(/^@+/, '')}
                          </div>
                        )}
                      </div>
                      {selectedUsers.includes(userProfile.id) && (
                        <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
              <button
                onClick={() => {
                  setShowCreateGroup(false)
                  setGroupName('')
                  setSelectedUsers([])
                }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={createGroup}
                className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
