-- 1. Включаем RLS на всех таблицах
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 2. Политики для chat_members (кто может видеть участников)
-- Пользователь может видеть только участников тех чатов, в которых он сам состоит
CREATE POLICY "Users can see members of their own chats"
ON chat_members FOR SELECT
TO authenticated
USING (
  chat_id IN (
    SELECT cm.chat_id FROM chat_members cm WHERE cm.user_id = auth.uid()
  )
);

-- 3. Политики для chats (кто может видеть инфо о чате)
CREATE POLICY "Users can see chats they belong to"
ON chats FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT cm.chat_id FROM chat_members cm WHERE cm.user_id = auth.uid()
  )
);

-- 4. Политики для messages (Чтение)
-- Пользователь может читать сообщения только тех чатов, в которых состоит
CREATE POLICY "Users can read messages in their chats"
ON messages FOR SELECT
TO authenticated
USING (
  chat_id IN (
    SELECT cm.chat_id FROM chat_members cm WHERE cm.user_id = auth.uid()
  )
);

-- 5. Политики для messages (Отправка)
-- Пользователь может отправлять сообщения только в те чаты, в которых состоит
CREATE POLICY "Users can insert messages into their chats"
ON messages FOR INSERT
TO authenticated
WITH CHECK (
  chat_id IN (
    SELECT cm.chat_id FROM chat_members cm WHERE cm.user_id = auth.uid()
  ) AND sender_id = auth.uid()
);

-- 6. Добавляем колонку роли в chat_members
ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member'));

-- 7. Обновляем существующих участников (делаем их владельцами, если они создали чат - упрощенно)
-- В реальной системе это нужно делать при создании чата.
-- Пока просто дадим права всем текущим.



