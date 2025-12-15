'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { X, Mail, CheckCircle } from 'lucide-react'

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConfirmationModal, setShowConfirmationModal] = useState(false)
  const [confirmationCode, setConfirmationCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const router = useRouter()

  // Validation and username formatting
  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') // only english letters, numbers, and _
    setUsername(val)
  }

  const handleVerifyCode = async () => {
    if (confirmationCode.length !== 6) {
      setError('Введите 6-значный код')
      return
    }
    
    setVerifying(true)
    try {
      // Try to verify OTP code
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: confirmationCode,
        type: 'email'
      })
      
      if (verifyError) {
        // If OTP verification fails, try to sign in (user might have clicked link)
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw verifyError
      }
      
      // Success - redirect to chat
      window.location.href = '/chat'
    } catch (err: any) {
      setError('Неверный код или ссылка еще не подтверждена. Проверьте почту и перейдите по ссылке или введите код.')
      setVerifying(false)
    }
  }

  const handleResendCode = async () => {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email
      })
      if (error) throw error
      setError(null)
      setConfirmationCode('')
      alert('Письмо с подтверждением отправлено повторно на вашу почту!')
    } catch (err: any) {
      setError('Ошибка при отправке письма. Попробуйте позже.')
    }
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    console.log('Form submitted, isLogin:', isLogin)
    setLoading(true)
    setError(null)

    try {
      if (isLogin) {
        // --- LOGIN ---
        console.log('Attempting login for:', email)
        const loginPromise = supabase.auth.signInWithPassword({ email, password })
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout. Check your internet connection.')), 10000)
        )
        
        const { data, error } = await Promise.race([loginPromise, timeoutPromise]) as any
        console.log('Login result:', { hasData: !!data, hasError: !!error, hasSession: !!data?.session })
        
        if (error) {
          console.error('Login error:', error)
          throw error
        }
        
        if (!data?.session) {
          // Wait a bit and check again
          console.log('No session in response, checking again...')
          await new Promise(resolve => setTimeout(resolve, 1000))
          const { data: { session } } = await supabase.auth.getSession()
          console.log('Session check result:', { hasSession: !!session })
          if (!session) {
            throw new Error('Сессия не создана. Попробуйте снова.')
          }
        }
        
        console.log('Login successful, redirecting...')
        // Clear any errors and redirect
        setError(null)
        setLoading(false)
        
        // Force navigation
        window.location.href = '/chat'
        return // Prevent further execution
      } else {
        // --- REGISTRATION ---
        if (!username || !birthDate || !fullName) throw new Error('Заполните все поля')
        
        // Validate birth date
        const birth = new Date(birthDate)
        const today = new Date()
        const minDate = new Date('1900-01-01')
        const maxAge = 150 // Maximum reasonable age
        const minAge = 13 // Minimum age to register
        
        if (isNaN(birth.getTime())) {
          throw new Error('Некорректная дата рождения')
        }
        
        if (birth > today) {
          throw new Error('Дата рождения не может быть в будущем')
        }
        
        if (birth < minDate) {
          throw new Error('Дата рождения не может быть раньше 1900 года')
        }
        
        const age = Math.floor((today.getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        
        if (age < minAge) {
          throw new Error(`Вам должно быть минимум ${minAge} лет для регистрации`)
        }
        
        if (age > maxAge) {
          throw new Error('Проверьте правильность даты рождения')
        }
        
        // Get current site URL for email confirmation redirect
        const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://luxury-cat-55477b.netlify.app'
        
        const signupPromise = supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${siteUrl}/chat`,
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

        // Show confirmation modal
        setShowConfirmationModal(true)
        setLoading(false)
      }
    } catch (err: any) {
      console.error('Auth error:', err)
      console.error('Error details:', {
        message: err.message,
        status: err.status,
        name: err.name
      })
      
      let errorMessage = 'Произошла ошибка. Проверьте подключение к интернету.'
      
      if (err.message?.includes('Invalid login credentials') || err.message?.includes('Invalid credentials')) {
        errorMessage = 'Неверный email или пароль. Проверьте данные и попробуйте снова.'
      } else if (err.message?.includes('timeout') || err.message?.includes('Failed to fetch') || err.message?.includes('ERR_CONNECTION_CLOSED')) {
        errorMessage = 'Ошибка подключения. Проверьте интернет и попробуйте снова.'
      } else if (err.message?.includes('User already registered')) {
        errorMessage = 'Пользователь с таким email уже зарегистрирован. Войдите в аккаунт.'
      } else if (err.message?.includes('Сессия не создана')) {
        errorMessage = err.message
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
                        onChange={(e) => {
                          setBirthDate(e.target.value)
                          setError(null) // Clear error when user changes date
                        }}
                        min="1900-01-01"
                        max={new Date().toISOString().split('T')[0]} // Today's date
                        className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 dark:bg-gray-900 transition-all text-gray-900 dark:text-white"
                    />
                    <p className="text-xs text-gray-400 mt-1">Минимальный возраст: 13 лет</p>
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

      {/* Confirmation Modal */}
      {showConfirmationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6 relative">
            <button
              onClick={() => setShowConfirmationModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Успешная регистрация!
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-2">
                Мы отправили письмо с подтверждением на <strong className="text-gray-900 dark:text-white">{email}</strong>
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Перейдите по ссылке в письме или введите 6-значный код (если настроен OTP)
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Введите 6-значный код из письма (опционально):
                </label>
                <input
                  type="text"
                  value={confirmationCode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                    setConfirmationCode(val)
                    setError(null)
                  }}
                  className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white"
                  placeholder="000000"
                  maxLength={6}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                  Или просто перейдите по ссылке из письма
                </p>
              </div>

              {error && (
                <div className="text-red-500 text-sm text-center bg-red-50 dark:bg-red-900/20 p-3 rounded-xl">
                  {error}
                </div>
              )}

              <button
                onClick={handleVerifyCode}
                disabled={verifying || (confirmationCode.length > 0 && confirmationCode.length !== 6)}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {verifying ? 'Проверка...' : confirmationCode.length > 0 ? 'Подтвердить код' : 'Я перешел по ссылке'}
              </button>

              <button
                onClick={handleResendCode}
                className="w-full py-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Отправить код повторно
              </button>

              <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                После подтверждения почты вы сможете войти в аккаунт
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
