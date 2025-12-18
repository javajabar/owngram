-- Добавляем колонку для реакций
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb;

-- Добавляем колонку для пересланных сообщений
ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

