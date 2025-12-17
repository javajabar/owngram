import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Fallback to prevent crash during build/dev, but requests will fail
if (typeof window !== 'undefined') {
  // Only log in browser
  console.log('Supabase Config:', {
    url: supabaseUrl ? supabaseUrl.substring(0, 20) + '...' : 'MISSING',
    key: supabaseAnonKey ? 'PRESENT' : 'MISSING',
    NODE_ENV: process.env.NODE_ENV
  })
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Missing Supabase environment variables!')
    console.error('Please check Vercel environment variables:')
    console.error('- NEXT_PUBLIC_SUPABASE_URL')
    console.error('- NEXT_PUBLIC_SUPABASE_ANON_KEY')
  } else {
    console.log('✅ Supabase configured correctly')
  }
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
)

