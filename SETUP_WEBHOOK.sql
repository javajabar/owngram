-- SQL для настройки Database Webhook (триггера при новом сообщении)
-- Выполните этот SQL в Supabase SQL Editor после настройки Edge Functions

-- ВАЖНО: Замените 'ваш-project-ref' и 'ваш-service-role-key' на реальные значения!

-- Функция для вызова Edge Function через HTTP
CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
  project_ref TEXT := 'ваш-project-ref'; -- ЗАМЕНИТЕ на ваш Supabase project ref
  service_key TEXT := 'ваш-service-role-key'; -- ЗАМЕНИТЕ на Service Role Key
  function_url TEXT;
BEGIN
  -- Пропускаем удаленные сообщения
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Формируем URL Edge Function
  function_url := format('https://%s.supabase.co/functions/v1/on-new-message', project_ref);

  -- Формируем payload
  payload := jsonb_build_object(
    'record', row_to_json(NEW),
    'old_record', CASE WHEN OLD IS NULL THEN NULL ELSE row_to_json(OLD) END
  );

  -- Вызываем Edge Function асинхронно (не блокируем INSERT)
  -- Используем pg_net для HTTP запросов
  PERFORM
    net.http_post(
      url := function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', format('Bearer %s', service_key)
      ),
      body := payload::text
    );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Логируем ошибку, но не прерываем INSERT
    RAISE WARNING 'Failed to trigger push notification: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Создаем триггер
DROP TRIGGER IF EXISTS on_message_insert ON messages;
CREATE TRIGGER on_message_insert
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_message();

-- Проверка: убедитесь, что расширение pg_net установлено
-- Если нет, выполните: CREATE EXTENSION IF NOT EXISTS pg_net;

