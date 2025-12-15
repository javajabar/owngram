'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/useAuthStore'
import { Profile } from '@/types'
import { X, Camera, Save, ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function ProfilePage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // Form state
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [status, setStatus] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')

  useEffect(() => {
    if (!user) return

    const fetchProfile = async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()

        if (error) {
          console.error('Error fetching profile:', error)
          alert('Ошибка загрузки профиля')
          return
        }

        if (data) {
          if (data.id !== user.id) {
            console.error('CRITICAL ERROR: Fetched wrong profile!', { expected: user.id, got: data.id })
            alert('Ошибка безопасности: загружен чужой профиль!')
            return
          }
          setProfile(data as Profile)
          setUsername(data.username?.replace('@', '') || '') // Remove @ for input
          setFullName(data.full_name || '')
          setStatus(data.status || '')
          setAvatarUrl(data.avatar_url || '')
        }
      } catch (error) {
        console.error('Unexpected error:', error)
        alert('Неожиданная ошибка при загрузке профиля')
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [user])

  const handleSave = async () => {
      if (!user) return
      setSaving(true)

      try {
          const updates = {
              username: `@${username.replace('@', '')}`, // Ensure @ is present
              full_name: fullName,
              status: status,
              avatar_url: avatarUrl,
              updated_at: new Date().toISOString()
          }

          const { error } = await supabase
              .from('profiles')
              .update(updates)
              .eq('id', user.id)

          if (error) {
              console.error('Error saving profile:', error)
              alert(`Ошибка сохранения профиля: ${error.message}`)
          } else {
              alert('Профиль обновлен!')
              // Refresh profile data
              const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
              if (data) {
                  setProfile(data as Profile)
              }
          }
      } catch (error) {
          console.error('Unexpected error:', error)
          alert('Неожиданная ошибка при сохранении профиля')
      } finally {
          setSaving(false)
      }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Loading profile...</div>

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 overflow-y-auto">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 p-4 shadow-sm flex items-center gap-4 sticky top-0 z-10">
            <button onClick={() => router.back()} className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                <ArrowLeft className="w-6 h-6 text-gray-600 dark:text-gray-300" />
            </button>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Edit Profile</h1>
        </div>

        <div className="max-w-md mx-auto w-full p-4 space-y-6">
            {/* Avatar */}
            <div className="flex flex-col items-center">
                <div className="w-24 h-24 rounded-full bg-gray-200 dark:bg-gray-700 relative overflow-hidden group">
                    {avatarUrl ? (
                        <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-gray-400">
                            {username?.[0]?.toUpperCase() || 'U'}
                        </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                        <Camera className="w-8 h-8 text-white" />
                        <input
                            type="file"
                            accept="image/*"
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={async (e) => {
                                const file = e.target.files?.[0]
                                if (!file || !user) return

                                try {
                                    // 1. Upload to Supabase
                                    const fileExt = file.name.split('.').pop()
                                    const fileName = `${user.id}-${Date.now()}.${fileExt}`
                                    const { error: uploadError } = await supabase.storage
                                        .from('chat-attachments') // We can reuse this bucket or create 'avatars'
                                        .upload(`avatars/${fileName}`, file)

                                    if (uploadError) {
                                        console.error('Upload error:', uploadError)
                                        alert('Error uploading avatar')
                                        return
                                    }

                                    // 2. Get Public URL
                                    const { data: { publicUrl } } = supabase.storage
                                        .from('chat-attachments')
                                        .getPublicUrl(`avatars/${fileName}`)

                                    // 3. Update state
                                    setAvatarUrl(publicUrl)
                                } catch (err) {
                                    console.error('Error handling file:', err)
                                    alert('Error updating avatar')
                                }
                            }}
                        />
                    </div>
                </div>
                <div className="mt-2 text-sm text-blue-500 cursor-pointer text-center" onClick={() => {
                     document.querySelector<HTMLInputElement>('input[type="file"]')?.click()
                }}>Change Photo</div>
            </div>

            {/* Fields */}
            <div className="space-y-4 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Username</label>
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-gray-400">@</span>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value.replace(/[^a-z0-9_]/g, '').toLowerCase())}
                            className="w-full pl-7 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">People can find you by this username.</p>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Display Name</label>
                    <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="John Doe"
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bio / Status</label>
                    <textarea
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        rows={3}
                        className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        placeholder="About me..."
                    />
                </div>
            </div>

            <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/30 active:scale-[0.98]"
            >
                {saving ? 'Saving...' : <><Save className="w-5 h-5" /> Save Changes</>}
            </button>
        </div>
    </div>
  )
}

