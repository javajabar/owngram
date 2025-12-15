'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // Validation and username formatting
  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') // only english letters, numbers, and _
    setUsername(val)
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (isLogin) {
        // --- LOGIN ---
        const loginPromise = supabase.auth.signInWithPassword({ email, password })
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout. Check your internet connection.')), 10000)
        )
        
        const { error } = await Promise.race([loginPromise, timeoutPromise]) as any
        if (error) throw error
        
        // Use window.location for more reliable navigation
        window.location.href = '/chat'
      } else {
        // --- REGISTRATION ---
        if (!username || !birthDate || !fullName) throw new Error('Заполните все поля')
        
        const signupPromise = supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: `@${username}`,
              full_name: fullName,
              birth_date: birthDate
            }
          }
        })
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout. Check your internet connection.')), 10000)
        )
        
        const { data: authData, error: authError } = await Promise.race([signupPromise, timeoutPromise]) as any
        if (authError) throw authError
        if (!authData?.user) throw new Error('Пользователь не создан')

        alert('Регистрация успешна! Выполняется вход...')
        window.location.href = '/chat'
      }
    } catch (err: any) {
      console.error('Auth error:', err)
      let errorMessage = 'Произошла ошибка. Проверьте подключение к интернету.'
      
      if (err.message?.includes('Invalid login credentials') || err.message?.includes('Invalid credentials')) {
        errorMessage = 'Неверный email или пароль. Проверьте данные и попробуйте снова.'
      } else if (err.message?.includes('timeout') || err.message?.includes('Failed to fetch') || err.message?.includes('ERR_CONNECTION_CLOSED')) {
        errorMessage = 'Ошибка подключения. Проверьте интернет и попробуйте снова.'
      } else if (err.message?.includes('User already registered')) {
        errorMessage = 'Пользователь с таким email уже зарегистрирован. Войдите в аккаунт.'
      } else if (err.message) {
        errorMessage = err.message
      }
      
      setError(errorMessage)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 font-sans">
      <div className="w-full max-w-md perspective-1000">
        
        {/* Card with animation */}
        <div className={cn(
            "relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden transition-all duration-500 ease-in-out",
            !isLogin ? "h-[650px]" : "h-[450px]" // Increase height for registration
        )}>
          
          <div className="p-8 h-full flex flex-col justify-center">
            {/* Header with switch animation */}
            <div className="relative h-10 mb-6 overflow-hidden">
                <h2 className={cn(
                    "absolute w-full text-2xl font-bold text-center text-gray-800 dark:text-white transition-all duration-500 transform",
                    isLogin ? "translate-y-0 opacity-100" : "-translate-y-10 opacity-0"
                )}>
                    С возвращением
                </h2>
                <h2 className={cn(
                    "absolute w-full text-2xl font-bold text-center text-gray-800 dark:text-white transition-all duration-500 transform",
                    !isLogin ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
                )}>
                    Создать аккаунт
                </h2>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              {/* Registration fields (appear smoothly) */}
              <div className={cn(
                  "space-y-4 overflow-hidden transition-all duration-500",
                  !isLogin ? "max-h-64 opacity-100" : "max-h-0 opacity-0"
              )}>
                 <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Имя пользователя</label>
                    <div className="relative">
                        <span className="absolute left-3 top-2 text-gray-400">@</span>
                        <input
                            type="text"
                            value={username}
                            onChange={handleUsernameChange}
                            className="w-full pl-7 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 dark:bg-gray-900 transition-all text-gray-900 dark:text-white"
                            placeholder="имя_пользователя"
                        />
                    </div>
                 </div>
                 <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Полное имя</label>
                    <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 dark:bg-gray-900 transition-all text-gray-900 dark:text-white"
                        placeholder="Иван Иванов"
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Дата рождения</label>
                    <input
                        type="date"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 dark:bg-gray-900 transition-all text-gray-900 dark:text-white"
                    />
                 </div>
              </div>

              {/* Main fields */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Электронная почта</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 dark:bg-gray-900 transition-all text-gray-900 dark:text-white"
                  placeholder="example@mail.ru"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Пароль</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 dark:bg-gray-900 transition-all text-gray-900 dark:text-white"
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>

              {error && (
                <div className="text-red-500 text-sm p-3 bg-red-50 dark:bg-red-900/20 rounded-xl animate-pulse">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Обработка...' : (isLogin ? 'Войти' : 'Зарегистрироваться')}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-sm text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
              >
                {isLogin ? (
                    <span>Новичок здесь? <span className="font-bold underline">Создать аккаунт</span></span>
                ) : (
                    <span>Уже есть аккаунт? <span className="font-bold underline">Войти</span></span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
