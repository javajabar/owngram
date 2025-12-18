-- Добавляем токен для приглашений в группы
ALTER TABLE chats ADD COLUMN IF NOT EXISTS invite_token TEXT UNIQUE;

-- Генерируем токены для существующих групп
UPDATE chats SET invite_token = encode(gen_random_bytes(12), 'base64') 
WHERE type = 'group' AND invite_token IS NULL;

-- Политика RLS для вступления по ссылке (нужна функция, так как это INSERT в chat_members)
-- Но для начала просто дадим возможность проверять токен
CREATE OR REPLACE FUNCTION join_group_by_token(token_val TEXT)
RETURNS UUID AS $$
DECLARE
    target_chat_id UUID;
BEGIN
    SELECT id INTO target_chat_id FROM chats WHERE invite_token = token_val AND type = 'group';
    
    IF target_chat_id IS NOT NULL THEN
        INSERT INTO chat_members (chat_id, user_id, role)
        VALUES (target_chat_id, auth.uid(), 'member')
        ON CONFLICT DO NOTHING;
        RETURN target_chat_id;
    ELSE
        RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

