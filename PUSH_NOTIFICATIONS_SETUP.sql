-- Миграция для поддержки push-уведомлений на iOS
-- Выполните этот SQL в Supabase SQL Editor

-- 1. Создаем таблицу для хранения push-подписок пользователей
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

-- 2. Включаем RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 3. Политики безопасности
CREATE POLICY "Users can view own push subscriptions" 
  ON push_subscriptions FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own push subscriptions" 
  ON push_subscriptions FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own push subscriptions" 
  ON push_subscriptions FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own push subscriptions" 
  ON push_subscriptions FOR DELETE 
  USING (auth.uid() = user_id);

-- 4. Индекс для быстрого поиска подписок пользователя
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id 
  ON push_subscriptions(user_id);

-- 5. Функция для обновления updated_at
CREATE OR REPLACE FUNCTION update_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Триггер для автоматического обновления updated_at
CREATE TRIGGER update_push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_push_subscriptions_updated_at();

-- 7. Функция для отправки push-уведомлений (вызывается из Edge Function)
-- Эта функция будет использоваться Edge Function для получения подписок
-- Edge Function сама будет отправлять push через Web Push API

