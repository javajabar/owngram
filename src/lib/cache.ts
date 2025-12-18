import { Profile } from '@/types'

class ProfileCache {
  private cache: Map<string, Profile> = new Map()
  private pending: Map<string, Promise<Profile | null>> = new Map()

  get(id: string): Profile | undefined {
    return this.cache.get(id)
  }

  set(id: string, profile: Profile) {
    this.cache.set(id, profile)
  }

  async fetch(id: string, supabase: any): Promise<Profile | null> {
    // 1. Check cache
    const cached = this.cache.get(id)
    if (cached) return cached

    // 2. Check if already fetching
    if (this.pending.has(id)) return this.pending.get(id)!

    // 3. Fetch from DB
    const fetchPromise = (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', id)
          .single()

        if (error) throw error
        if (data) {
          this.cache.set(id, data as Profile)
          return data as Profile
        }
        return null
      } catch (err) {
        console.error(`Error fetching profile ${id}:`, err)
        return null
      } finally {
        this.pending.delete(id)
      }
    })()

    this.pending.set(id, fetchPromise)
    return fetchPromise
  }
}

export const profileCache = new ProfileCache()

