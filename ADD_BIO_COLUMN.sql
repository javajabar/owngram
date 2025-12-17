-- Добавить колонку bio в таблицу profiles
-- Выполните этот SQL в Supabase SQL Editor

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS bio TEXT;

