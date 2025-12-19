# Куда девать VAPID ключи - Пошаговая инструкция

## Шаг 1: Генерация ключей

Выполните в терминале:

```bash
npm install -g web-push
web-push generate-vapid-keys
```

Вы получите два ключа:
```
Public Key: BKx... (длинная строка ~87 символов)
Private Key: 8Kx... (длинная строка ~43 символа)
```

**Сохраните оба ключа!**

---

## Шаг 2: Добавить в Supabase Dashboard (для Edge Function)

### Где именно:

1. Откройте **Supabase Dashboard**
2. Выберите ваш проект
3. Перейдите в **Project Settings** (шестеренка слева)
4. В меню слева выберите **Edge Functions**
5. Найдите секцию **Secrets** (или **Environment Variables**)
6. Нажмите **Add new secret** (или **+ New secret**)

### Что добавить:

**Секрет 1:**
- **Name:** `VAPID_PUBLIC_KEY`
- **Value:** ваш публичный ключ (BKx...)

**Секрет 2:**
- **Name:** `VAPID_PRIVATE_KEY`  
- **Value:** ваш приватный ключ (8Kx...)

### Как это выглядит в коде:

В Edge Function (`supabase/functions/send-push-notification/index.ts`) ключи читаются так:

```typescript
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')  // ← из Supabase Secrets
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')  // ← из Supabase Secrets
```

**Эти ключи используются на СЕРВЕРЕ (Edge Function) для отправки push.**

---

## Шаг 3: Добавить публичный ключ в Next.js (для клиента)

### Где именно:

Создайте или откройте файл `.env.local` в корне вашего проекта:

```
c:\probiv4ik\.env.local
```

### Что добавить:

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BKx... (ваш публичный ключ, тот же что в Supabase)
```

**Важно:** 
- Используйте **ТОТ ЖЕ** публичный ключ, что добавили в Supabase
- Префикс `NEXT_PUBLIC_` обязателен, чтобы переменная была доступна в браузере

### Как это выглядит в коде:

В клиентском коде (`src/lib/push-subscription.ts`) ключ используется так:

```typescript
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY  // ← из .env.local
```

**Этот ключ используется на КЛИЕНТЕ для создания push-подписки.**

---

## Визуальная схема:

```
┌─────────────────────────────────────┐
│  1. Генерация ключей                │
│  web-push generate-vapid-keys       │
│                                     │
│  Public Key:  BKx...                │
│  Private Key: 8Kx...                │
└─────────────────────────────────────┘
           │
           ├─────────────────┬─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
┌──────────────────┐  ┌──────────────┐  ┌──────────────┐
│ Supabase Secrets │  │ .env.local   │  │ Edge Function│
│                  │  │              │  │              │
│ VAPID_PUBLIC_KEY │  │ NEXT_PUBLIC_ │  │ Читает из    │
│ VAPID_PRIVATE_KEY│  │ VAPID_PUBLIC │  │ Deno.env.get │
│                  │  │ _KEY         │  │              │
└──────────────────┘  └──────────────┘  └──────────────┘
         │                    │                 │
         │                    │                 │
         └────────────────────┴─────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Push работает!  │
                    └──────────────────┘
```

---

## Проверка настройки

### Проверить в Supabase:

1. Project Settings → Edge Functions → Secrets
2. Должны быть видны оба ключа: `VAPID_PUBLIC_KEY` и `VAPID_PRIVATE_KEY`

### Проверить в проекте:

1. Откройте `.env.local`
2. Должна быть строка: `NEXT_PUBLIC_VAPID_PUBLIC_KEY=...`

### Проверить в коде:

После развертывания Edge Function, проверьте логи:
- Supabase Dashboard → Edge Functions → send-push-notification → Logs
- Не должно быть ошибок про отсутствие VAPID ключей

---

## Важные моменты

1. **Публичный ключ** - безопасно хранить на клиенте (в .env.local)
2. **Приватный ключ** - ТОЛЬКО на сервере (в Supabase Secrets), никогда не коммитьте в git!
3. **Оба ключа** должны быть из одной пары (сгенерированы вместе)
4. **Публичный ключ** должен быть одинаковым в Supabase Secrets и .env.local

---

## Если что-то не работает

### Ошибка: "VAPID keys are not set"
- Проверьте, что добавили оба ключа в Supabase Secrets
- Перезапустите Edge Function после добавления секретов

### Ошибка: "Invalid VAPID key"
- Убедитесь, что публичный ключ одинаковый в Supabase и .env.local
- Проверьте, что не перепутали публичный и приватный ключи

### Уведомления не приходят
- Проверьте логи Edge Function
- Убедитесь, что push-подписка зарегистрирована (см. таблицу push_subscriptions)

