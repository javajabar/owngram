-- Добавляем флаг канала в таблицу чатов
ALTER TABLE chats ADD COLUMN IF NOT EXISTS is_channel BOOLEAN DEFAULT FALSE;

-- Обновляем существующие чаты (по умолчанию не каналы)
-- Пользователь может переключить это в настройках группы

