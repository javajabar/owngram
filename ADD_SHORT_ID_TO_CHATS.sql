-- Добавление поля short_id в таблицу chats
-- Это позволит использовать короткие числовые ID вместо UUID в URL

-- 1. Добавить поле short_id
ALTER TABLE chats ADD COLUMN IF NOT EXISTS short_id BIGINT UNIQUE;

-- 2. Создать функцию для генерации уникального короткого ID
CREATE OR REPLACE FUNCTION generate_short_id()
RETURNS BIGINT AS $$
DECLARE
  new_id BIGINT;
  exists_check BOOLEAN;
BEGIN
  LOOP
    -- Генерируем случайное число от 1000000 до 9999999 (7 цифр)
    new_id := floor(random() * (9999999 - 1000000 + 1) + 1000000)::BIGINT;
    
    -- Проверяем, существует ли такой ID
    SELECT EXISTS(SELECT 1 FROM chats WHERE short_id = new_id) INTO exists_check;
    
    -- Если ID уникален, возвращаем его
    IF NOT exists_check THEN
      RETURN new_id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 3. Создать триггер для автоматической генерации short_id при создании нового чата
CREATE OR REPLACE FUNCTION set_chat_short_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.short_id IS NULL THEN
    NEW.short_id := generate_short_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_chat_short_id ON chats;
CREATE TRIGGER trigger_set_chat_short_id
  BEFORE INSERT ON chats
  FOR EACH ROW
  EXECUTE FUNCTION set_chat_short_id();

-- 4. Заполнить short_id для существующих чатов
DO $$
DECLARE
  chat_record RECORD;
  new_short_id BIGINT;
BEGIN
  FOR chat_record IN SELECT id FROM chats WHERE short_id IS NULL LOOP
    LOOP
      new_short_id := generate_short_id();
      BEGIN
        UPDATE chats SET short_id = new_short_id WHERE id = chat_record.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- Если ID уже существует, попробуем снова
        CONTINUE;
      END;
    END LOOP;
  END LOOP;
END $$;

-- 5. Создать индекс для быстрого поиска по short_id
CREATE INDEX IF NOT EXISTS idx_chats_short_id ON chats(short_id);

-- 6. Убедиться, что short_id не может быть NULL для новых записей
ALTER TABLE chats ALTER COLUMN short_id SET NOT NULL;

