-- Добавляем колонку для дефолтной реакции
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS default_reaction TEXT DEFAULT '❤️';

