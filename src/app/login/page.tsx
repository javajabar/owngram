'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/useAuthStore'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSignUp, setIsSignUp] = useState(false)
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  
  // OTP Modal state
  const [showOtpModal, setShowOtpModal] = useState(false)
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '', '', ''])
  const [otpError, setOtpError] = useState<string | null>(null)
  const [otpLoading, setOtpLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [pendingEmail, setPendingEmail] = useState('')
  
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([])
  const router = useRouter()
  const { user, checkUser } = useAuthStore()

  useEffect(() => {
    if (user) {
      router.push('/chat')
    }
  }, [user, router])

  // Countdown timer for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      if (isSignUp) {
        // Send OTP code for registration
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: true,
            data: {
              username: username || email.split('@')[0],
              full_name: fullName || '',
            }
          }
        })

        if (otpError) throw otpError

        // Show OTP modal
        setPendingEmail(email)
        setShowOtpModal(true)
        setCountdown(60)
        setTimeout(() => {
          otpInputRefs.current[0]?.focus()
        }, 100)
      } else {
        // Sign in with password
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signInError) throw signInError

        document.cookie = 'justLoggedIn=true; path=/; max-age=60'
        await checkUser()
        router.push('/chat')
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка авторизации')
    } finally {
      setIsLoading(false)
    }
  }

  // Verify OTP code
  const handleVerifyOtp = async () => {
    const fullCode = otpCode.join('')
    if (fullCode.length !== 8) {
      setOtpError('Введите 8-значный код')
      return
    }

    setOtpLoading(true)
    setOtpError(null)

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: pendingEmail,
        token: fullCode,
        type: 'email',
      })

      if (error) throw error

      if (data.user) {
        // Create profile
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: data.user.id,
            username: username || '@' + pendingEmail.split('@')[0],
            full_name: fullName || pendingEmail.split('@')[0],
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'id'
          })

        if (profileError) {
          console.error('Profile creation error:', profileError)
        }

        document.cookie = 'justLoggedIn=true; path=/; max-age=60'
        await checkUser()
        router.push('/chat')
      }
    } catch (err: any) {
      setOtpError(err.message || 'Неверный код')
      setOtpCode(['', '', '', '', '', '', '', ''])
      otpInputRefs.current[0]?.focus()
    } finally {
      setOtpLoading(false)
    }
  }

  // Handle OTP input change
  const handleOtpChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) return

    const newCode = [...otpCode]
    newCode[index] = value
    setOtpCode(newCode)

    if (value && index < 7) {
      otpInputRefs.current[index + 1]?.focus()
    }

    if (value && index === 7) {
      const fullCode = newCode.join('')
      if (fullCode.length === 8) {
        setTimeout(() => handleVerifyOtp(), 100)
      }
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus()
    }
    if (e.key === 'Escape') {
      setShowOtpModal(false)
    }
  }

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 8)
    if (pastedData) {
      const newCode = [...otpCode]
      for (let i = 0; i < 8; i++) {
        newCode[i] = pastedData[i] || ''
      }
      setOtpCode(newCode)
      
      const focusIndex = Math.min(pastedData.length, 7)
      otpInputRefs.current[focusIndex]?.focus()

      if (pastedData.length === 8) {
        setTimeout(() => handleVerifyOtp(), 100)
      }
    }
  }

  const handleResendOtp = async () => {
    if (countdown > 0) return
    
    setOtpLoading(true)
    setOtpError(null)

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: pendingEmail,
        options: {
          shouldCreateUser: true,
        }
      })

      if (error) throw error

      setCountdown(60)
      setOtpCode(['', '', '', '', '', '', '', ''])
      otpInputRefs.current[0]?.focus()
    } catch (err: any) {
      setOtpError(err.message || 'Ошибка отправки кода')
    } finally {
      setOtpLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-blue-600 mb-2">OwnGram</h1>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {isSignUp ? 'Создать аккаунт' : 'Войти'}
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {isSignUp 
              ? 'Заполните форму для регистрации' 
              : 'Введите данные для входа'}
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {isSignUp && (
              <>
                <div>
                  <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Имя
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                    placeholder="Ваше имя"
                  />
                </div>
                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Имя пользователя (необязательно)
                  </label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                    placeholder="@username"
                  />
                </div>
              </>
            )}
            
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                placeholder="your@email.com"
              />
            </div>

            {!isSignUp && (
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Пароль
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>
            )}
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Загрузка...' : (isSignUp ? 'Зарегистрироваться' : 'Войти')}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp)
                setError(null)
              }}
              className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {isSignUp 
                ? 'Уже есть аккаунт? Войти' 
                : 'Нет аккаунта? Зарегистрироваться'}
            </button>
          </div>
        </form>
      </div>

      {/* OTP Modal */}
      {showOtpModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="text-center mb-6">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Подтверждение email
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Введите 8-значный код, отправленный на<br />
                <span className="font-medium text-gray-900 dark:text-white">{pendingEmail}</span>
              </p>
            </div>

            {otpError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
                {otpError}
              </div>
            )}

            {/* Code input boxes */}
            <div className="flex justify-center gap-1.5 mb-6" onPaste={handleOtpPaste}>
              {otpCode.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => { otpInputRefs.current[index] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(index, e)}
                  className="w-10 h-12 text-center text-xl font-bold border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                />
              ))}
            </div>

            <button
              onClick={handleVerifyOtp}
              disabled={otpLoading || otpCode.join('').length !== 8}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mb-4"
            >
              {otpLoading ? 'Проверка...' : 'Подтвердить'}
            </button>

            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={countdown > 0 || otpLoading}
                className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {countdown > 0 
                  ? `Отправить повторно через ${countdown}с` 
                  : 'Отправить код повторно'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowOtpModal(false)
                  setOtpCode(['', '', '', '', '', '', '', ''])
                  setOtpError(null)
                }}
                className="text-sm text-gray-500 hover:text-gray-400"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
