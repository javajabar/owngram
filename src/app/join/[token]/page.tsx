'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/useAuthStore'
import { Users, CheckCircle2, AlertCircle } from 'lucide-react'

export default function JoinGroupPage() {
    const params = useParams()
    const router = useRouter()
    const { user, loading, checkUser } = useAuthStore()
    const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'already_member'>('loading')
    const [groupInfo, setGroupInfo] = useState<{ name: string, avatar_url: string | null } | null>(null)
    const [errorMsg, setErrorMsg] = useState('')

    useEffect(() => {
        checkUser()
    }, [checkUser])

    useEffect(() => {
        if (loading) return
        if (!user) {
            router.push(`/login?returnTo=/join/${params.token}`)
            return
        }

        const joinGroup = async () => {
            try {
                // 1. Fetch group info by token
                const { data: chat, error: fetchError } = await supabase
                    .from('chats')
                    .select('id, name, avatar_url')
                    .eq('invite_token', params.token as string)
                    .single()

                if (fetchError || !chat) {
                    setStatus('error')
                    setErrorMsg('Группа не найдена или ссылка недействительна')
                    return
                }

                setGroupInfo(chat)

                // 2. Check if already a member
                const { data: membership } = await supabase
                    .from('chat_members')
                    .select('id')
                    .eq('chat_id', chat.id)
                    .eq('user_id', user.id)
                    .maybeSingle()

                if (membership) {
                    setStatus('already_member')
                    setTimeout(() => router.push(`/chat/${chat.id}`), 2000)
                    return
                }

                // 3. Join the group using the RPC function
                const { data: chatId, error: joinError } = await supabase
                    .rpc('join_group_by_token', { token_val: params.token as string })

                if (joinError || !chatId) {
                    throw joinError || new Error('Failed to join')
                }

                setStatus('success')
                setTimeout(() => router.push(`/chat/${chatId}`), 2000)
            } catch (err: any) {
                console.error('Join error:', err)
                setStatus('error')
                setErrorMsg(err.message || 'Ошибка при вступлении в группу')
            }
        }

        joinGroup()
    }, [user, loading, params.token, router])

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#0E1621] flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-8 text-center border border-gray-100 dark:border-gray-800 animate-in fade-in zoom-in duration-300">
                {status === 'loading' && (
                    <div className="flex flex-col items-center">
                        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6" />
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Вступление в группу...</h2>
                    </div>
                )}

                {status === 'success' && (
                    <div className="flex flex-col items-center">
                        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center text-green-500 mb-6">
                            <CheckCircle2 className="w-12 h-12" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Вы вступили в группу!</h2>
                        <p className="text-gray-500 dark:text-gray-400 font-medium">{groupInfo?.name}</p>
                        <p className="text-sm text-gray-400 mt-4">Перенаправление в чат...</p>
                    </div>
                )}

                {status === 'already_member' && (
                    <div className="flex flex-col items-center">
                        <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center text-blue-500 mb-6">
                            <Users className="w-12 h-12" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Вы уже в этой группе</h2>
                        <p className="text-gray-500 dark:text-gray-400 font-medium">{groupInfo?.name}</p>
                        <p className="text-sm text-gray-400 mt-4">Перенаправление в чат...</p>
                    </div>
                )}

                {status === 'error' && (
                    <div className="flex flex-col items-center">
                        <div className="w-20 h-20 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center text-red-500 mb-6">
                            <AlertCircle className="w-12 h-12" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Ошибка</h2>
                        <p className="text-gray-600 dark:text-gray-400 mb-8">{errorMsg}</p>
                        <button 
                            onClick={() => router.push('/chat')}
                            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-all active:scale-95 shadow-lg shadow-blue-500/25"
                        >
                            Вернуться к чатам
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

