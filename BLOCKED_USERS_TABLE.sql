-- Создание таблицы для блокированных пользователей
-- Выполните этот SQL в Supabase SQL Editor

CREATE TABLE IF NOT EXISTS blocked_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    blocked_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, blocked_user_id)
);

-- Создать индекс для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_blocked_users_user_id ON blocked_users(user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked_user_id ON blocked_users(blocked_user_id);

-- Включить RLS (Row Level Security)
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- Политика: пользователи могут видеть только свои блокировки
CREATE POLICY "Users can view their own blocks"
    ON blocked_users FOR SELECT
    USING (auth.uid() = user_id);

-- Политика: пользователи могут создавать свои блокировки
CREATE POLICY "Users can create their own blocks"
    ON blocked_users FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Политика: пользователи могут удалять свои блокировки
CREATE POLICY "Users can delete their own blocks"
    ON blocked_users FOR DELETE
    USING (auth.uid() = user_id);



