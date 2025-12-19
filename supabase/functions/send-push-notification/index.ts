// Supabase Edge Function для отправки push-уведомлений
// Разместите этот файл в: supabase/functions/send-push-notification/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as webpush from 'https://esm.sh/web-push@3.6.6'

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')

// Настраиваем VAPID ключи для web-push
// Ключи берутся из Supabase Secrets (Project Settings → Edge Functions → Secrets)
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:your-email@example.com', // Замените на ваш email (любой валидный email)
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  )
  console.log('[Push] VAPID keys configured')
} else {
  console.error('[Push] ❌ VAPID keys not found! Add them in Supabase Secrets:')
  console.error('  - VAPID_PUBLIC_KEY')
  console.error('  - VAPID_PRIVATE_KEY')
}

serve(async (req) => {
  try {
    // CORS headers
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      })
    }

    const { userId, title, body, data } = await req.json()

    if (!userId || !title || !body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Создаем Supabase клиент
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Получаем все push-подписки пользователя
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId)

    if (error) {
      console.error('Error fetching subscriptions:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch subscriptions' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No subscriptions found', sent: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Отправляем push каждому устройству
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          // Формируем push subscription объект
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          }

          // Формируем payload для уведомления
          const payload = JSON.stringify({
            title,
            body,
            icon: data?.icon || '/icon-192x192.png',
            badge: data?.badge || '/icon-192x192.png',
            tag: data?.tag || 'message',
            data: data || {},
          })

          // Отправляем через web-push библиотеку
          await webpush.sendNotification(pushSubscription, payload)

          return { success: true, endpoint: sub.endpoint }
        } catch (error) {
          console.error('Error sending push:', error)
          
          // Если подписка невалидна, удаляем её из базы
          if (error.statusCode === 410 || error.statusCode === 404) {
            await supabase
              .from('push_subscriptions')
              .delete()
              .eq('endpoint', sub.endpoint)
            console.log(`Removed invalid subscription: ${sub.endpoint}`)
          }
          
          return { success: false, endpoint: sub.endpoint, error: error.message }
        }
      })
    )

    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length

    return new Response(
      JSON.stringify({
        message: 'Push notifications sent',
        sent: successful,
        total: subscriptions.length,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
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

