# Руководство по настройке Push-уведомлений для iOS

## Проблема

На iOS веб-приложения не могут работать в фоне. Realtime соединения (WebSocket) закрываются, когда:
- Приложение сворачивается
- Экран гаснет
- Приложение переходит в фоновый режим

**Решение:** Использовать серверные push-уведомления через Supabase Edge Functions.

## Архитектура решения

```
Новое сообщение → Supabase Database Trigger → Edge Function → Push API → iOS Device
```

1. **Сообщение создается** в базе данных
2. **Database Trigger** вызывает Edge Function
3. **Edge Function** получает push-подписки получателей
4. **Edge Function** отправляет push через Web Push API
5. **Service Worker** на устройстве получает push
6. **iOS показывает уведомление**

## Шаг 1: Настройка базы данных

Выполните SQL миграцию из файла `PUSH_NOTIFICATIONS_SETUP.sql`:

1. Откройте Supabase Dashboard
2. Перейдите в SQL Editor
3. Скопируйте и выполните содержимое `PUSH_NOTIFICATIONS_SETUP.sql`

Это создаст:
- Таблицу `push_subscriptions` для хранения подписок
- Политики безопасности (RLS)
- Индексы для быстрого поиска

## Шаг 2: Генерация VAPID ключей

VAPID ключи нужны для Web Push API. Сгенерируйте их:

```bash
# Установите web-push (если еще не установлен)
npm install -g web-push

# Сгенерируйте ключи
web-push generate-vapid-keys
```

Вы получите что-то вроде:
```
Public Key: BKx... (длинная строка)
Private Key: 8Kx... (длинная строка)
```

## Шаг 3: Настройка переменных окружения

### В Supabase Dashboard:

1. Перейдите в **Project Settings** → **Edge Functions**
2. Добавьте секреты:
   - `VAPID_PUBLIC_KEY` - публичный VAPID ключ
   - `VAPID_PRIVATE_KEY` - приватный VAPID ключ

### В вашем Next.js проекте:

Добавьте в `.env.local`:
```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BKx... (ваш публичный ключ)
```

## Шаг 4: Развертывание Edge Functions

### Установите Supabase CLI (если еще не установлен):

```bash
npm install -g supabase
```

### Войдите в Supabase:

```bash
supabase login
```

### Свяжите проект:

```bash
supabase link --project-ref ваш-project-ref
```

### Разверните функции:

```bash
# Развернуть функцию отправки push
supabase functions deploy send-push-notification

# Развернуть функцию-триггер при новом сообщении
supabase functions deploy on-new-message
```

## Шаг 5: Настройка Database Webhook

Нужно настроить триггер, который будет вызывать Edge Function при новом сообщении.

### Вариант 1: Через Supabase Dashboard

1. Перейдите в **Database** → **Webhooks**
2. Создайте новый webhook:
   - **Name:** `on-new-message`
   - **Table:** `messages`
   - **Events:** `INSERT`
   - **HTTP Request:**
     - **URL:** `https://ваш-project-ref.supabase.co/functions/v1/on-new-message`
     - **HTTP Method:** `POST`
     - **HTTP Headers:**
       ```
       Authorization: Bearer ваш-service-role-key
       Content-Type: application/json
       ```

### Вариант 2: Через SQL (рекомендуется)

Создайте файл `setup-webhook.sql`:

```sql
-- Создаем функцию для вызова Edge Function
CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
BEGIN
  -- Формируем payload
  payload := jsonb_build_object(
    'record', row_to_json(NEW),
    'old_record', row_to_json(OLD)
  );

  -- Вызываем Edge Function через HTTP
  PERFORM
    net.http_post(
      url := 'https://ваш-project-ref.supabase.co/functions/v1/on-new-message',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ваш-service-role-key'
      ),
      body := payload::text
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создаем триггер
CREATE TRIGGER on_message_insert
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_message();
```

**Важно:** Замените:
- `ваш-project-ref` на ваш Supabase project ref
- `ваш-service-role-key` на ваш Service Role Key (из Project Settings → API)

## Шаг 6: Проверка работы

1. **Откройте приложение на iOS** (добавленное на главный экран)
2. **Разрешите уведомления** при запросе
3. **Отправьте тестовое сообщение** с другого устройства
4. **Проверьте логи:**
   - В консоли браузера должны быть: `[Push] ✅ Subscription registered`
   - В Supabase Dashboard → Edge Functions → Logs должны быть записи о вызове функций

## Отладка

### Проверка подписки в базе данных:

```sql
SELECT * FROM push_subscriptions WHERE user_id = 'ваш-user-id';
```

### Проверка логов Edge Functions:

1. Supabase Dashboard → Edge Functions
2. Выберите функцию → Logs
3. Проверьте ошибки

### Ручной тест отправки push:

В Supabase SQL Editor выполните:

```sql
-- Вызвать Edge Function вручную
SELECT net.http_post(
  url := 'https://ваш-project-ref.supabase.co/functions/v1/send-push-notification',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ваш-service-role-key'
  ),
  body := jsonb_build_object(
    'userId', 'ваш-user-id',
    'title', 'Тест',
    'body', 'Тестовое уведомление',
    'data', jsonb_build_object('chatId', 'test-chat-id')
  )::text
);
```

## Важные замечания

1. **VAPID ключи** должны быть одинаковыми на клиенте и сервере
2. **Service Worker** должен быть зарегистрирован до регистрации push-подписки
3. **На iOS** приложение должно быть добавлено на главный экран (PWA)
4. **Разрешения** должны быть даны в настройках устройства

## Альтернативные решения

Если Edge Functions не подходят, можно использовать:
- **OneSignal** - готовый сервис для push-уведомлений
- **Firebase Cloud Messaging** - для веб и мобильных приложений
- **Pusher Beams** - специализированный сервис для push

Но для Supabase Edge Functions - это нативное решение, которое хорошо интегрируется.

