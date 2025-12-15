import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Debug logging
console.log('Supabase Config:', {
  url: supabaseUrl ? supabaseUrl.substring(0, 10) + '...' : 'MISSING',
  key: supabaseAnonKey ? 'PRESENT' : 'MISSING',
  NODE_ENV: process.env.NODE_ENV
})

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Check .env.local')
}

// Fallback to prevent crash during build/dev, but requests will fail
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
)

