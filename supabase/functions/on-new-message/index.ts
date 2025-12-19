// Supabase Edge Function - триггер при новом сообщении
// Разместите этот файл в: supabase/functions/on-new-message/index.ts
// Эта функция вызывается через Database Webhook при INSERT в таблицу messages

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const { record, old_record } = await req.json()
    
    // record - новое сообщение
    const message = record
    const chatId = message.chat_id
    const senderId = message.sender_id
    const content = message.content

    // Пропускаем удаленные сообщения
    if (message.deleted_at) {
      return new Response(JSON.stringify({ message: 'Message deleted, skipping' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Получаем информацию о чате и участниках
    const { data: chatMembers, error: membersError } = await supabase
      .from('chat_members')
      .select('user_id, profiles!inner(full_name, avatar_url)')
      .eq('chat_id', chatId)
      .neq('user_id', senderId) // Исключаем отправителя

    if (membersError) {
      console.error('Error fetching chat members:', membersError)
      return new Response(JSON.stringify({ error: 'Failed to fetch members' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!chatMembers || chatMembers.length === 0) {
      return new Response(JSON.stringify({ message: 'No recipients found' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Получаем информацию об отправителе
    const { data: sender } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', senderId)
      .single()

    const senderName = sender?.full_name || 'Собеседник'
    const senderAvatar = sender?.avatar_url

    // Отправляем push каждому получателю
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    
    const results = await Promise.allSettled(
      chatMembers.map(async (member) => {
        try {
          // Вызываем Edge Function через HTTP
          const functionUrl = `${supabaseUrl}/functions/v1/send-push-notification`
          const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({
              userId: member.user_id,
              title: senderName,
              body: content,
              data: {
                chatId: chatId,
                messageId: message.id,
                senderId: senderId,
                icon: senderAvatar,
                badge: senderAvatar,
                tag: chatId,
              },
            }),
          })

          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Push failed: ${response.status} - ${errorText}`)
          }

          const result = await response.json()
          return { success: true, userId: member.user_id, result }
        } catch (error) {
          console.error(`Error sending push to ${member.user_id}:`, error)
          return { success: false, userId: member.user_id, error: error.message }
        }
      })
    )

    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length

    return new Response(
      JSON.stringify({
        message: 'Push notifications processed',
        sent: successful,
        total: chatMembers.length,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

