# Настройка CORS для Supabase Storage

## Где найти настройки CORS в Supabase Dashboard

### Вариант 1: Через Storage → Buckets → Policies (Рекомендуется)

1. **Откройте Supabase Dashboard**
   - Перейдите на https://supabase.com/dashboard
   - Выберите ваш проект

2. **Перейдите в Storage**
   - В левом меню нажмите на **"Storage"**
   - Или перейдите по пути: `Storage` → `Buckets`

3. **Откройте ваш bucket**
   - Найдите bucket `chat-attachments`
   - Нажмите на него или на стрелку справа

4. **Перейдите в Policies**
   - В открывшемся окне перейдите на вкладку **"Policies"**
   - Здесь вы можете настроить политики доступа

5. **Настройте публичный доступ (если нужно)**
   - Убедитесь, что bucket помечен как **PUBLIC** (оранжевый тег)
   - Это позволяет получать файлы без аутентификации

### Вариант 2: Через SQL Editor (Для точной настройки CORS)

Если нужно настроить CORS заголовки напрямую, используйте SQL:

```sql
-- Проверьте текущие настройки bucket
SELECT * FROM storage.buckets WHERE name = 'chat-attachments';

-- Убедитесь, что bucket публичный
UPDATE storage.buckets 
SET public = true 
WHERE name = 'chat-attachments';

-- Создайте политику для публичного чтения (если еще не создана)
CREATE POLICY "Public Access" ON storage.objects
FOR SELECT
USING (bucket_id = 'chat-attachments');
```

### Вариант 3: Через Settings → API (Глобальные настройки)

1. **Settings → API**
   - В левом меню: `Settings` → `API`
   - Прокрутите до раздела **"CORS"** (если доступен)
   - Добавьте ваш домен в список разрешенных источников

## Проверка работы CORS

После настройки проверьте, что файлы доступны:

```javascript
// В консоли браузера
fetch('https://your-project.supabase.co/storage/v1/object/public/chat-attachments/path/to/file.docx')
  .then(r => r.blob())
  .then(blob => console.log('✅ CORS работает!', blob))
  .catch(err => console.error('❌ CORS ошибка:', err))
```

## Решение проблем

### Проблема: "CORS policy blocked"
**Решение:**
1. Убедитесь, что bucket помечен как PUBLIC
2. Проверьте политики доступа в разделе Policies
3. Убедитесь, что используете правильный URL: `/storage/v1/object/public/...`

### Проблема: Файлы не загружаются через fetch
**Решение:**
- Используйте `getPublicUrl()` из Supabase SDK вместо прямого fetch
- Или настройте прокси на вашем сервере

## Текущая настройка в коде

В вашем коде уже используется правильный метод:

```typescript
// В ChatWindow.tsx
const { data: { publicUrl } } = supabase.storage
  .from('chat-attachments')
  .getPublicUrl(filePath)
```

Этот метод автоматически генерирует правильный URL с учетом CORS настроек.

## Дополнительная информация

- **Документация Supabase Storage:** https://supabase.com/docs/guides/storage
- **Storage Policies:** https://supabase.com/docs/guides/storage/security/access-control

