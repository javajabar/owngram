-- Миграция: добавление колонок для статуса прочтения сообщений
-- Выполнить в Supabase SQL Editor

-- Добавляем колонку delivered_at (когда сообщение доставлено)
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Добавляем колонку read_at (когда сообщение прочитано)
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Для существующих сообщений устанавливаем delivered_at = created_at (они уже доставлены)
UPDATE messages 
SET delivered_at = created_at 
WHERE delivered_at IS NULL;

-- Создаём индексы для быстрого поиска непрочитанных сообщений
CREATE INDEX IF NOT EXISTS idx_messages_read_at ON messages(read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_delivered_at ON messages(delivered_at) WHERE delivered_at IS NULL;

