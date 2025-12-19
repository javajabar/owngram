# Быстрый старт: Push-уведомления для iOS

## Что было сделано

✅ Создана система серверных push-уведомлений через Supabase Edge Functions  
✅ Реализована регистрация push-подписок на клиенте  
✅ Обновлен Service Worker для обработки push-событий  
✅ Созданы Edge Functions для отправки push  

## Что нужно сделать

### 1. Выполнить SQL миграции

В Supabase SQL Editor выполните по порядку:

1. `PUSH_NOTIFICATIONS_SETUP.sql` - создает таблицу подписок
2. `SETUP_WEBHOOK.sql` - создает триггер (⚠️ замените project-ref и service-key!)

### 2. Сгенерировать VAPID ключи

```bash
npm install -g web-push
web-push generate-vapid-keys
```

Сохраните оба ключа!

### 3. Настроить переменные окружения

**В Supabase Dashboard:**
- Project Settings → Edge Functions → Secrets
- Добавьте: `VAPID_PUBLIC_KEY` и `VAPID_PRIVATE_KEY`

**В вашем проекте (.env.local):**
```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=ваш-публичный-ключ
```

### 4. Развернуть Edge Functions

```bash
# Установите Supabase CLI
npm install -g supabase

# Войдите и свяжите проект
supabase login
supabase link --project-ref ваш-project-ref

# Разверните функции
supabase functions deploy send-push-notification
supabase functions deploy on-new-message
```

### 5. Обновить SETUP_WEBHOOK.sql

Откройте `SETUP_WEBHOOK.sql` и замените:
- `ваш-project-ref` → ваш реальный project ref
- `ваш-service-role-key` → ваш Service Role Key (из Project Settings → API)

Затем выполните этот SQL.

## Проверка

1. Откройте приложение на iOS (добавлено на главный экран)
2. Разрешите уведомления
3. Отправьте тестовое сообщение
4. Проверьте логи в Supabase Dashboard → Edge Functions

## Подробная инструкция

См. `PUSH_NOTIFICATIONS_GUIDE.md` для детальной настройки.

## Важно

- На iOS приложение **должно быть добавлено на главный экран** (PWA)
- Push работает **только через сервер**, не через Realtime
- VAPID ключи должны быть **одинаковыми** на клиенте и сервере

