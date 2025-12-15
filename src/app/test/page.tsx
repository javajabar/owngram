'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function TestPage() {
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)

  const testAuth = async () => {
    setLoading(true)
    setResult('Тестирую аутентификацию...')

    try {
      // Тест 1: Проверка подключения
      const { data: connectionTest, error: connectionError } = await supabase
        .from('profiles')
        .select('count', { count: 'exact', head: true })

      if (connectionError) {
        setResult(`❌ Ошибка подключения: ${connectionError.message}`)
        return
      }

      setResult('✅ Подключение работает. Тестирую регистрацию...')

      // Тест 2: Попытка регистрации тестового пользователя
      const testEmail = `test${Date.now()}@example.com`
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: testEmail,
        password: 'testpassword123'
      })

      if (authError) {
        setResult(`❌ Ошибка аутентификации: ${authError.message}`)
        return
      }

      setResult(`✅ Регистрация успешна! Email: ${testEmail}`)

    } catch (error: any) {
      setResult(`❌ Неожиданная ошибка: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <h1 className="text-2xl font-bold text-center mb-6 text-gray-900 dark:text-white">
          Тест Supabase
        </h1>

        <button
          onClick={testAuth}
          disabled={loading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all disabled:opacity-50"
        >
          {loading ? 'Тестирую...' : 'Запустить тест'}
        </button>

        {result && (
          <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-xl">
            <pre className="whitespace-pre-wrap text-sm text-gray-900 dark:text-white">
              {result}
            </pre>
          </div>
        )}

        <div className="mt-4 text-center">
          <a href="/" className="text-blue-500 hover:underline">
            ← Вернуться на главную
          </a>
        </div>
      </div>
    </div>
  )
}




