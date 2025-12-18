export interface Profile {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
  status: string | null
  last_seen_at: string | null
  bio?: string | null
  birth_date?: string | null
  default_reaction?: string
}

export interface Message {
  id: string
  chat_id: string
  sender_id: string
  content: string
  created_at: string
  updated_at?: string | null
  attachments: any[] | null
  sender?: Profile
  delivered_at?: string | null // Timestamp when message was delivered (1 галочка)
  read_at?: string | null // Timestamp when message was read (2 галочки)
  reply_to_id?: string | null // ID of message this is replying to
  reply_to?: Message | null // The message being replied to
  deleted_at?: string | null // Timestamp when message was deleted
  deleted_for_all?: boolean // Whether message was deleted for everyone
  status?: 'sending' | 'sent' | 'error' // For optimistic UI
  reactions?: Record<string, string[]> // emoji -> array of user_ids
  forwarded_from_id?: string | null
  forwarded_from?: Profile | null
  type?: 'text' | 'call' | 'system'
  call_info?: {
    duration: number // in seconds
    status: 'completed' | 'missed' | 'rejected' | 'cancelled'
  } | null
}

export interface Chat {
  lastMessage?: Message
  otherUser?: Profile
  unreadCount?: number
  id: string
  type: 'dm' | 'group'
  name: string | null
  avatar_url: string | null
  created_at: string
}


