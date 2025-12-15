import { create } from 'zustand'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
  authListenerSet: boolean
  setUser: (user: User | null) => void
  checkUser: () => Promise<void>
  signOut: () => Promise<void>
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

// Global auth listener (set up only once)
let authListenerSet = false

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  error: null,
  authListenerSet: false,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  checkUser: async () => {
    try {
      set({ loading: true, error: null })
      const { data: { session }, error } = await supabase.auth.getSession()

      if (error) {
        set({ error: error.message, loading: false })
        return
      }

      set({ user: session?.user ?? null, loading: false })

      // Set up auth state listener only once globally
      if (!authListenerSet) {
        authListenerSet = true
        set({ authListenerSet: true })
        supabase.auth.onAuthStateChange((event, session) => {
          set({ user: session?.user ?? null, loading: false })
          if (event === 'SIGNED_OUT') {
            set({ user: null, error: null })
          }
        })
      }
    } catch (error) {
      set({ error: 'Failed to check authentication', loading: false })
    }
  },
  signOut: async () => {
    try {
      set({ loading: true, error: null })
      const { error } = await supabase.auth.signOut()
      if (error) {
        set({ error: error.message, loading: false })
      } else {
        set({ user: null, loading: false })
      }
    } catch (error) {
      set({ error: 'Failed to sign out', loading: false })
    }
  }
}))

