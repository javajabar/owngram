-- Добавить поля bio и birth_date в таблицу profiles
-- Выполните этот SQL в Supabase SQL Editor

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS birth_date DATE;

