-- Добавить колонку last_seen_at в таблицу profiles
-- Выполните этот SQL в Supabase SQL Editor

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Создать индекс для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at ON profiles(last_seen_at);

