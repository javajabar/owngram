'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/useAuthStore'
import { Profile } from '@/types'
import { ArrowLeft, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'

type Theme = 'light' | 'dark' | 'dark-blue'

export default function SettingsPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // Form state
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [isChangingEmail, setIsChangingEmail] = useState(false)
  const [emailChangeLoading, setEmailChangeLoading] = useState(false)
  const [theme, setTheme] = useState<Theme>('dark-blue')

  useEffect(() => {
    if (!user) return

    const fetchData = async () => {
      try {
        setLoading(true)
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (profileError) throw profileError

        if (profile) {
          setUsername(profile.username?.replace(/^@+/, '') || '')
        }

        // Get email from auth
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (authUser?.email) {
          setEmail(authUser.email)
        }

        // Load theme from localStorage
        const savedTheme = localStorage.getItem('theme') as Theme
        if (savedTheme) {
          setTheme(savedTheme)
          applyTheme(savedTheme)
        }
      } catch (error) {
        console.error('Error fetching data:', error)
        alert('Ошибка загрузки данных')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [user])

  const applyTheme = (selectedTheme: Theme) => {
    const root = document.documentElement
    root.classList.remove('light', 'dark', 'dark-blue')
    
    if (selectedTheme === 'light') {
      root.classList.add('light')
    } else if (selectedTheme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.add('dark-blue')
    }
    
    localStorage.setItem('theme', selectedTheme)
  }

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme)
    applyTheme(newTheme)
  }

  const handleSave = async () => {
    if (!user) return

    setSaving(true)
    try {
      // Validate username
      if (username && !/^[a-zA-Z0-9_]+$/.test(username)) {
        alert('Имя пользователя может содержать только английские буквы, цифры и подчеркивание')
        return
      }

      const cleanUsername = username.replace(/^@+/, '')

      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          username: cleanUsername ? '@' + cleanUsername : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)

      if (profileError) throw profileError

      alert('Настройки сохранены')
    } catch (error: any) {
      console.error('Error saving settings:', error)
      alert(`Ошибка при сохранении: ${error.message || 'Неизвестная ошибка'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleChangeEmail = async () => {
    if (!user || !newEmail.trim()) {
      alert('Введите новый email адрес')
      return
    }

    if (newEmail === email) {
      alert('Новый email должен отличаться от текущего')
      return
    }

    setEmailChangeLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({
        email: newEmail
      })

      if (error) throw error

      alert('Письмо с подтверждением отправлено на новый email адрес. Проверьте почту и подтвердите изменение.')
      setNewEmail('')
      setIsChangingEmail(false)
      
      // Refresh user data
      const { data: { user: updatedUser } } = await supabase.auth.getUser()
      if (updatedUser?.email) {
        setEmail(updatedUser.email)
      }
    } catch (error: any) {
      console.error('Error changing email:', error)
      alert(`Ошибка при изменении email: ${error.message || 'Неизвестная ошибка'}`)
    } finally {
      setEmailChangeLoading(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Загрузка...</div>

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 overflow-y-auto">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 p-4 shadow-sm flex items-center gap-4 sticky top-0 z-10">
        <button onClick={() => router.back()} className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
          <ArrowLeft className="w-6 h-6 text-gray-600 dark:text-gray-300" />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Настройки</h1>
      </div>

      <div className="max-w-md mx-auto w-full p-4 space-y-6">
        {/* Username */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Имя пользователя
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => {
              const value = e.target.value.replace(/[^a-zA-Z0-9_]/g, '')
              setUsername(value)
            }}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            placeholder="username"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Только английские буквы, цифры и подчеркивание
          </p>
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Email
          </label>
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={email}
              disabled
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-not-allowed"
            />
            <button
              onClick={() => setIsChangingEmail(!isChangingEmail)}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm"
            >
              Изменить
            </button>
          </div>
          
          {isChangingEmail && (
            <div className="mt-3 space-y-2">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Новый email"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleChangeEmail}
                  disabled={emailChangeLoading}
                  className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm disabled:opacity-50"
                >
                  {emailChangeLoading ? 'Отправка...' : 'Сохранить'}
                </button>
                <button
                  onClick={() => {
                    setIsChangingEmail(false)
                    setNewEmail('')
                  }}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors text-sm"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Theme */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Тема
          </label>
          <div className="space-y-2">
            <button
              onClick={() => handleThemeChange('light')}
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all ${
                theme === 'light'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-gray-900 dark:text-white font-medium">Светлая</span>
                {theme === 'light' && <span className="text-blue-500">✓</span>}
              </div>
            </button>
            <button
              onClick={() => handleThemeChange('dark')}
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all ${
                theme === 'dark'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-gray-900 dark:text-white font-medium">Темная</span>
                {theme === 'dark' && <span className="text-blue-500">✓</span>}
              </div>
            </button>
            <button
              onClick={() => handleThemeChange('dark-blue')}
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all ${
                theme === 'dark-blue'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-gray-900 dark:text-white font-medium">Темно-синяя</span>
                {theme === 'dark-blue' && <span className="text-blue-500">✓</span>}
              </div>
            </button>
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Save className="w-5 h-5" />
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}

