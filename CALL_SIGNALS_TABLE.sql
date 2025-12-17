-- Создать таблицу для сигналов звонков
-- Выполните этот SQL в Supabase SQL Editor

CREATE TABLE IF NOT EXISTS call_signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE NOT NULL,
  from_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  to_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice-candidate', 'call-request', 'call-accept', 'call-reject', 'call-end')),
  signal_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Создать индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_call_signals_chat_id ON call_signals(chat_id);
CREATE INDEX IF NOT EXISTS idx_call_signals_from_user ON call_signals(from_user_id);
CREATE INDEX IF NOT EXISTS idx_call_signals_to_user ON call_signals(to_user_id);
CREATE INDEX IF NOT EXISTS idx_call_signals_created_at ON call_signals(created_at DESC);

-- Включить RLS
ALTER TABLE call_signals ENABLE ROW LEVEL SECURITY;

-- Политики безопасности
CREATE POLICY "Users can insert their own call signals" ON call_signals
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Users can view call signals for their chats" ON call_signals
  FOR SELECT USING (
    auth.uid() = from_user_id OR 
    auth.uid() = to_user_id
  );

-- Автоматически удалять старые сигналы (старше 1 часа)
CREATE OR REPLACE FUNCTION cleanup_old_call_signals()
RETURNS void AS $$
BEGIN
  DELETE FROM call_signals
  WHERE created_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- ВАЖНО: Включить Realtime для таблицы call_signals
-- Выполните эту команду после создания таблицы:
ALTER PUBLICATION supabase_realtime ADD TABLE call_signals;

