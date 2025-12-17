-- ============================================
-- SQL ЗАПРОС ДЛЯ ДОБАВЛЕНИЯ В SUPABASE
-- Скопируйте и выполните в Supabase SQL Editor
-- ============================================

-- Добавить колонку last_seen_at в таблицу profiles (для онлайн статуса)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Создать индекс для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at ON profiles(last_seen_at);
