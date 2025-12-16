'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/useAuthStore'

type Step = 'email' | 'code'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [step, setStep] = useState<Step>('email')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(0)
  
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([])
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

  // Handle sending OTP code
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
        }
      })

      if (error) throw error

      setStep('code')
      setSuccess('Код отправлен на вашу почту')
      setCountdown(60) // 60 seconds cooldown
      
      // Focus first code input
      setTimeout(() => {
        codeInputRefs.current[0]?.focus()
      }, 100)
    } catch (err: any) {
      setError(err.message || 'Ошибка отправки кода')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle verifying OTP code
  const handleVerifyCode = async () => {
    const fullCode = code.join('')
    if (fullCode.length !== 6) {
      setError('Введите 6-значный код')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: fullCode,
        type: 'email',
      })

      if (error) throw error

      if (data.user) {
        // Check if profile exists, create if not
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', data.user.id)
          .single()

        if (!profile) {
          await supabase
            .from('profiles')
            .insert({
              id: data.user.id,
              username: '@' + email.split('@')[0],
              full_name: email.split('@')[0],
              updated_at: new Date().toISOString()
            })
        }

        document.cookie = 'justLoggedIn=true; path=/; max-age=60'
        await checkUser()
        router.push('/chat')
      }
    } catch (err: any) {
      setError(err.message || 'Неверный код')
      setCode(['', '', '', '', '', ''])
      codeInputRefs.current[0]?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  // Handle code input change
  const handleCodeChange = (index: number, value: string) => {
    // Only allow numbers
    if (value && !/^\d$/.test(value)) return

    const newCode = [...code]
    newCode[index] = value
    setCode(newCode)

    // Auto-focus next input
    if (value && index < 5) {
      codeInputRefs.current[index + 1]?.focus()
    }

    // Auto-submit when all digits entered
    if (value && index === 5) {
      const fullCode = newCode.join('')
      if (fullCode.length === 6) {
        setTimeout(() => handleVerifyCode(), 100)
      }
    }
  }

  // Handle backspace
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus()
    }
  }

  // Handle paste
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pastedData) {
      const newCode = [...code]
      for (let i = 0; i < 6; i++) {
        newCode[i] = pastedData[i] || ''
      }
      setCode(newCode)
      
      // Focus appropriate input
      const focusIndex = Math.min(pastedData.length, 5)
      codeInputRefs.current[focusIndex]?.focus()

      // Auto-submit if full code pasted
      if (pastedData.length === 6) {
        setTimeout(() => handleVerifyCode(), 100)
      }
    }
  }

  // Resend code
  const handleResend = async () => {
    if (countdown > 0) return
    
    setIsLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
        }
      })

      if (error) throw error

      setSuccess('Новый код отправлен')
      setCountdown(60)
      setCode(['', '', '', '', '', ''])
      codeInputRefs.current[0]?.focus()
    } catch (err: any) {
      setError(err.message || 'Ошибка отправки кода')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-blue-600 mb-2">OwnGram</h1>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {step === 'email' ? 'Вход в аккаунт' : 'Введите код'}
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {step === 'email' 
              ? 'Введите email, мы отправим код подтверждения' 
              : `Код отправлен на ${email}`}
          </p>
        </div>

        {step === 'email' ? (
          <form className="mt-8 space-y-6" onSubmit={handleSendCode}>
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                placeholder="your@email.com"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !email}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Отправка...' : 'Получить код'}
            </button>
          </form>
        ) : (
          <div className="mt-8 space-y-6">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 px-4 py-3 rounded-lg text-sm">
                {success}
              </div>
            )}

            {/* Code input boxes */}
            <div className="flex justify-center gap-2" onPaste={handlePaste}>
              {code.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => { codeInputRefs.current[index] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleCodeChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  className="w-12 h-14 text-center text-2xl font-bold border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                />
              ))}
            </div>

            <button
              onClick={handleVerifyCode}
              disabled={isLoading || code.join('').length !== 6}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Проверка...' : 'Подтвердить'}
            </button>

            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={handleResend}
                disabled={countdown > 0 || isLoading}
                className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {countdown > 0 
                  ? `Отправить повторно через ${countdown}с` 
                  : 'Отправить код повторно'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('email')
                  setCode(['', '', '', '', '', ''])
                  setError(null)
                  setSuccess(null)
                }}
                className="text-sm text-gray-500 hover:text-gray-400"
              >
                Изменить email
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
