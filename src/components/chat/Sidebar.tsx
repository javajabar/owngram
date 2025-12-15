'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Profile, Chat } from '@/types'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/useAuthStore'
import { Plus, LogOut, User as UserIcon, Search, X, Settings } from 'lucide-react'

export function Sidebar() {
    const [chats, setChats] = useState<Chat[]>([])
    const [myProfile, setMyProfile] = useState<Profile | null>(null)
    const [users, setUsers] = useState<Profile[]>([]) // Found users
  const [searchQuery, setSearchQuery] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const router = useRouter()
  const { user, signOut } = useAuthStore()

  useEffect(() => {
    if (!user) return

    const fetchChats = async () => {
        // Fetch my profile
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        if (profile) setMyProfile(profile as Profile)

        // Fetch my chats with last message and other user info
        const { data: memberData } = await supabase
            .from('chat_members')
            .select(`
                chat_id, 
                chats(*),
                profiles!chat_members_user_id_fkey(*)
            `)
            .eq('user_id', user.id)
        
        if (memberData) {
            // For each chat, fetch last message and other user (for DM)
            const chatsWithDetails = await Promise.all(
                memberData.map(async (m: any) => {
                    const chat = m.chats
                    if (!chat) return null
                    
                    // Get last message
                    const { data: lastMessageData } = await supabase
                        .from('messages')
                        .select('*, sender:profiles(*)')
                        .eq('chat_id', chat.id)
                        .order('created_at', { ascending: false })
                        .limit(1)
                    const lastMessage = lastMessageData && lastMessageData.length > 0 ? lastMessageData[0] : null
                    
                    // For DM, get other user
                    let otherUser = null
                    if (chat.type === 'dm') {
                        const { data: otherMember } = await supabase
                            .from('chat_members')
                            .select('profiles(*)')
                            .eq('chat_id', chat.id)
                            .neq('user_id', user.id)
                            .single()
                        if (otherMember?.profiles) {
                            otherUser = otherMember.profiles
                        }
                    }
                    
                    // Count unread messages
                    const { count: unreadCount } = await supabase
                        .from('messages')
                        .select('*', { count: 'exact', head: true })
                        .eq('chat_id', chat.id)
                        .neq('sender_id', user.id)
                        .is('read_at', null)
                    
                    return {
                        ...chat,
                        lastMessage: lastMessage || null,
                        otherUser: otherUser || null,
                        unreadCount: unreadCount || 0
                    }
                })
            )
            
            const validChats = chatsWithDetails.filter(Boolean) as any[]
            // Sort by last message time
            validChats.sort((a, b) => {
                const timeA = a.lastMessage?.created_at || a.created_at
                const timeB = b.lastMessage?.created_at || b.created_at
                return new Date(timeB).getTime() - new Date(timeA).getTime()
            })
            setChats(validChats)
        }
    }

    fetchChats()

    const channel = supabase.channel('sidebar_chats')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_members', filter: `user_id=eq.${user.id}` }, () => {
            fetchChats()
        })
        .subscribe()
        
    return () => { supabase.removeChannel(channel) }
  }, [user])

  // Search logic
  useEffect(() => {
      if (!showNewChat) {
          setUsers([])
          setSearchQuery('')
          return
      }

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
  }, [searchQuery, showNewChat, user])

  const createChat = async (otherUserId: string) => {
      if (!user) return

      try {
        // Check if DM already exists (Optimized for MVP: just create new for now to avoid complex query on client)
        // Ideally: call an RPC function 'get_or_create_dm(user_id)'
        
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
        setShowNewChat(false)
        setSearchQuery('')
        
        // Refresh list
        setChats(prev => [chatData, ...prev])
      } catch (e) {
          console.error('Error creating chat:', e)
          alert('Error creating chat')
      }
  }

  return (
    <div className="w-full md:w-80 flex flex-col h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
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
                onClick={() => setShowNewChat(!showNewChat)} 
                className={`p-2 rounded-full transition-colors ${showNewChat ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300' : 'hover:bg-gray-200 dark:hover:bg-gray-800'}`}
                title="New Chat"
            >
                <Plus className={`w-5 h-5 transition-transform ${showNewChat ? 'rotate-45' : ''}`} />
            </button>
            <button 
                onClick={() => { signOut(); router.push('/login') }} 
                className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full text-red-500 transition-colors"
                title="Sign Out"
            >
                <LogOut className="w-5 h-5" />
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
         {showNewChat ? (
            <div className="p-2 animate-in fade-in slide-in-from-top-4 duration-200">
                <div className="px-2 mb-4">
                    <h3 className="text-xs font-semibold mb-2 text-gray-500 uppercase tracking-wider">New Message</h3>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Search by @username..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                            autoFocus
                        />
                    </div>
                </div>

                {isSearching ? (
                    <div className="text-center py-4 text-gray-400 text-sm">Searching...</div>
                ) : users.length === 0 ? (
                    <div className="text-center p-4 text-gray-400 text-sm">
                        {searchQuery ? `No user found for "@${searchQuery}"` : "Type to search people"}
                    </div>
                ) : (
                    users.map(u => (
                    <div 
                       key={u.id} 
                       onClick={() => createChat(u.id)} 
                       className="p-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg cursor-pointer flex items-center gap-3 transition-colors"
                    >
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center shrink-0 text-white font-bold">
                           {u.avatar_url ? (
                               <img src={u.avatar_url} className="w-10 h-10 rounded-full object-cover" alt={u.username || 'User'} />
                           ) : (
                               (u.username?.[1] || u.full_name?.[0] || 'U').toUpperCase()
                           )}
                        </div>
                        <div className="min-w-0">
                           <div className="truncate font-medium text-gray-900 dark:text-gray-100">
                                {u.username || 'Anonymous'}
                           </div>
                           {u.full_name && u.full_name !== u.username && (
                               <div className="text-xs text-gray-500 truncate">{u.full_name}</div>
                           )}
                        </div>
                    </div>
                )))}
            </div>
         ) : (
            chats.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                    <p className="mb-2">No chats yet.</p>
                    <button onClick={() => setShowNewChat(true)} className="text-blue-500 hover:underline">Find friends</button>
                </div>
            ) : (
                <div className="flex flex-col">
                    {chats.map((chat: any) => {
                        const displayName = chat.type === 'dm' 
                            ? (chat.otherUser?.username || chat.otherUser?.full_name || 'User')
                            : (chat.name || 'Chat')
                        const avatarUrl = chat.type === 'dm' ? chat.otherUser?.avatar_url : null
                        const lastMsg = chat.lastMessage
                        const unreadCount = chat.unreadCount || 0
                        
                        // Format last message preview
                        let lastMsgPreview = 'No messages yet'
                        if (lastMsg) {
                            const isFromMe = lastMsg.sender_id === user?.id
                            const senderName = isFromMe ? 'Вы' : (lastMsg.sender?.username || lastMsg.sender?.full_name || 'User')
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
                                onClick={() => router.push(`/chat/${chat.id}`)} 
                                className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer border-b border-gray-100 dark:border-gray-800 transition-colors flex items-center gap-3 relative"
                            >
                                {/* Avatar */}
                                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 overflow-hidden bg-gradient-to-br from-blue-400 to-indigo-500">
                                    {avatarUrl ? (
                                        <img src={avatarUrl} className="w-full h-full object-cover" alt={displayName} />
                                    ) : (
                                        <span className="text-white font-bold text-lg">
                                            {displayName[0]?.toUpperCase() || '?'}
                                        </span>
                                    )}
                                </div>
                                
                                {/* Chat info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                                            {displayName}
                                        </div>
                                        {timeStr && (
                                            <div className="text-xs text-gray-400 ml-2 shrink-0">{timeStr}</div>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate flex-1">
                                            {lastMsgPreview}
                                        </div>
                                        {unreadCount > 0 && (
                                            <div className="ml-2 bg-blue-500 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center shrink-0">
                                                {unreadCount > 99 ? '99+' : unreadCount}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )
         )}
      </div>
    </div>
  )
}
