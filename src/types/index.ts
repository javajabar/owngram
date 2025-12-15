export interface Profile {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
  status: string | null
  last_seen_at: string | null
}

export interface Message {
  id: string
  chat_id: string
  sender_id: string
  content: string
  created_at: string
  attachments: any[] | null
  sender?: Profile
  read_at?: string | null // Timestamp when message was read
}

export interface Chat {
  id: string
  type: 'dm' | 'group'
  name: string | null
  created_at: string
}


