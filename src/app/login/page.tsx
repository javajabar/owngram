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
    setError(null)
    
    try {
      // Try to verify OTP code for signup confirmation
      // Supabase sends 6-digit code in email when configured properly
      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: confirmationCode,
        type: 'signup'
      })
      
      if (verifyError) {
        // If signup type fails, try email type (some configurations use this)
        const { error: emailOtpError } = await supabase.auth.verifyOtp({
          email,
          token: confirmationCode,
          type: 'email'
        })
        
        if (emailOtpError) {
          throw emailOtpError
        }
      }
      
      // Success - wait a moment for session to be established
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Check if session is established
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        // Close modal and redirect
        setShowConfirmationModal(false)
        router.push('/chat')
        router.refresh()
      } else {
        // If no session, try to sign in (user might need to sign in after confirmation)
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) {
          throw new Error('Код подтвержден, но не удалось войти. Попробуйте войти вручную.')
        }
        router.push('/chat')
        router.refresh()
      }
    } catch (err: any) {
      console.error('Verify code error:', err)
      let errorMessage = 'Неверный код. Проверьте код из письма.'
      
      if (err.message?.includes('expired') || err.message?.includes('invalid')) {
        errorMessage = 'Код неверный или истек. Запросите новый код.'
      } else if (err.message) {
        errorMessage = err.message
      }
      
      setError(errorMessage)
      setVerifying(false)
    }
  }

  const handleResendCode = async () => {
    try {
      setError(null)
      setConfirmationCode('')
      
      // Resend OTP code for signup
      const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://luxury-cat-55477b.netlify.app'
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${siteUrl}/chat`
        }
      })
      
      if (error) throw error
      
      // Show success message
      alert('Письмо с кодом подтверждения отправлено повторно на вашу почту!')
    } catch (err: any) {
      console.error('Resend error:', err)
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
        
        // Clear any errors
        setError(null)
        setLoading(false)
        
        // Wait longer for cookies to be set properly (especially important on Netlify)
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // Double-check session multiple times to ensure it's stable
        let finalSession = null
        for (let i = 0; i < 3; i++) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session) {
            finalSession = session
            break
          }
          await new Promise(resolve => setTimeout(resolve, 500))
        }
        
        console.log('Final session check before redirect:', { hasSession: !!finalSession })
        
        if (finalSession) {
          // Show success message briefly before redirect
          setError(null)
          setLoading(false)
          
          // Set flag in cookie to help middleware know user just logged in
          if (typeof document !== 'undefined') {
            document.cookie = 'justLoggedIn=true; path=/; max-age=10; SameSite=Lax'
          }
          
          // Wait a bit more to ensure cookies are fully set
          await new Promise(resolve => setTimeout(resolve, 500))
          
          // Use router.push instead of window.location to avoid full page reload
          // This allows middleware to see the session properly
          console.log('Redirecting to /chat using router...')
          router.push('/chat')
          router.refresh()
          
          // Fallback: if router doesn't work after 2 seconds, use window.location
          setTimeout(() => {
            if (typeof window !== 'undefined' && window.location.pathname === '/login') {
              console.log('Router failed, using window.location as fallback')
              window.location.href = '/chat'
            }
          }, 2000)
        } else {
          // If session still not available, show error but don't throw
          // User can manually refresh and should be logged in
          setError('Вход выполнен, но сессия не синхронизирована. Обновите страницу.')
          setLoading(false)
          if (typeof document !== 'undefined') {
            document.cookie = 'justLoggedIn=true; path=/; max-age=10; SameSite=Lax'
          }
          setTimeout(() => {
            router.push('/chat')
          }, 3000)
        }
        
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
        
        // Step 1: Create user account with OTP (6-digit code)
        // Note: Supabase will send OTP code if email template is configured correctly
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

        // Note: Supabase sends confirmation link by default
        // For 6-digit code, you need to configure email template in Supabase Dashboard
        // The code will be extracted from the confirmation token

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
                    <label htmlFor="username" className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Имя пользователя</label>
                    <div className="relative">
                        <span className="absolute left-3 top-2 text-gray-400">@</span>
                        <input
                            id="username"
                            name="username"
                            type="text"
                            value={username}
                            onChange={handleUsernameChange}
                            className="w-full pl-7 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 dark:bg-gray-900 transition-all text-gray-900 dark:text-white"
                            placeholder="имя_пользователя"
                        />
                    </div>
                 </div>
                 <div>
                    <label htmlFor="fullName" className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Полное имя</label>
                    <input
                        id="fullName"
                        name="fullName"
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 dark:bg-gray-900 transition-all text-gray-900 dark:text-white"
                        placeholder="Иван Иванов"
                    />
                 </div>
                 <div>
                    <label htmlFor="birthDate" className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Дата рождения</label>
                    <input
                        id="birthDate"
                        name="birthDate"
                        type="date"
                        value={birthDate}
                        onChange={(e) => {
                          setBirthDate(e.target.value)
                          setError(null) // Clear error when user changes date
                        }}
                        min="1900-01-01"
                        max={new Date().toISOString().split('T')[0]} // Today's date
                        placeholder="Выберите дату"
                        aria-label="Дата рождения"
                        className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 dark:bg-gray-900 transition-all text-gray-900 dark:text-white"
                    />
                    <p className="text-xs text-gray-400 mt-1">Минимальный возраст: 13 лет</p>
                 </div>
              </div>

              {/* Main fields */}
              <div>
                <label htmlFor="email" className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Электронная почта</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 dark:bg-gray-900 transition-all text-gray-900 dark:text-white"
                  placeholder="example@mail.ru"
                />
              </div>
              
              <div>
                <label htmlFor="password" className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Пароль</label>
                <input
                  id="password"
                  name="password"
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
              aria-label="Закрыть модальное окно"
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
              <div className="flex items-center justify-center mb-4">
                <Mail className="w-12 h-12 text-blue-500" />
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-2 text-center">
                Мы отправили письмо с кодом подтверждения на
              </p>
              <p className="text-center mb-4">
                <strong className="text-gray-900 dark:text-white text-lg">{email}</strong>
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-4">
                Введите 6-значный код из письма или перейдите по ссылке
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 text-center">
                  Введите 6-значный код:
                </label>
                <input
                  type="text"
                  value={confirmationCode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                    setConfirmationCode(val)
                    setError(null)
                  }}
                  className="w-full px-4 py-3 text-center text-3xl font-mono tracking-widest border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white"
                  placeholder="000000"
                  maxLength={6}
                  autoFocus
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                  Код отправлен на вашу почту. Если не пришел, проверьте папку "Спам"
                </p>
              </div>

              {error && (
                <div className="text-red-500 text-sm text-center bg-red-50 dark:bg-red-900/20 p-3 rounded-xl">
                  {error}
                </div>
              )}

              <button
                onClick={handleVerifyCode}
                disabled={verifying || confirmationCode.length !== 6}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {verifying ? 'Проверка...' : 'Подтвердить код'}
              </button>
              
              <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-2">
                Или просто перейдите по ссылке из письма
              </p>

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
