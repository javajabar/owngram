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

        // Fetch my chats
        // Ideally: Fetch chats and their members to show names
        const { data: memberData } = await supabase
            .from('chat_members')
            .select('chat_id, chats(*)')
            .eq('user_id', user.id)
        
        if (memberData) {
            const myChats = memberData.map((m: any) => m.chats).filter(Boolean)
            setChats(myChats)
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
          setIsSearching(true)
          
          let query = supabase.from('profiles').select('*').neq('id', user.id)

          if (searchQuery.trim()) {
              // Search by username or full_name (ilike = case insensitive)
              // We remove @ if user typed it for username search
              const cleanQuery = searchQuery.trim().replace('@', '')
              query = query.or(`username.ilike.%${cleanQuery}%,full_name.ilike.%${cleanQuery}%`)
          } else {
              // By default show recent 10 users to not show empty
              query = query.limit(10).order('updated_at', { ascending: false })
          }

          const { data } = await query
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
                    {chats.map(chat => (
                        <div 
                            key={chat.id} 
                            onClick={() => router.push(`/chat/${chat.id}`)} 
                            className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer border-b border-gray-100 dark:border-gray-800 transition-colors flex items-center gap-3"
                        >
                            <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center shrink-0">
                                <UserIcon className="w-6 h-6 text-gray-400" />
                            </div>
                            <div>
                                <div className="font-medium text-gray-900 dark:text-gray-100">{chat.name || 'Chat'}</div>
                                <div className="text-sm text-gray-500 dark:text-gray-400 truncate">Select to view messages</div>
                            </div>
                        </div>
                    ))}
                </div>
            )
         )}
      </div>
    </div>
  )
}
