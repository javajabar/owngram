-- Проверка и настройка политик для bucket chat-attachments
-- Выполните этот SQL в Supabase SQL Editor

-- 1. Проверьте текущие настройки bucket
SELECT 
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets 
WHERE name = 'chat-attachments';

-- 2. Убедитесь, что bucket публичный (если еще не настроено)
UPDATE storage.buckets 
SET public = true 
WHERE name = 'chat-attachments';

-- 3. Проверьте существующие политики на storage.objects
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND policyname LIKE '%chat-attachments%';

-- 4. Создайте политику для публичного чтения (SELECT) - если еще не создана
-- Это позволит любому пользователю читать файлы из bucket
DO $$
BEGIN
  -- Проверяем, существует ли уже такая политика
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public Read Access for chat-attachments'
  ) THEN
    -- Создаем политику для публичного чтения
    CREATE POLICY "Public Read Access for chat-attachments"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'chat-attachments');
  END IF;
END $$;

-- 5. Альтернативный способ: простая политика для всех публичных bucket'ов
-- Раскомментируйте, если нужна более общая политика
/*
CREATE POLICY "Public Read Access for public buckets"
ON storage.objects
FOR SELECT
USING (
  bucket_id IN (
    SELECT id FROM storage.buckets WHERE public = true
  )
);
*/

-- 6. Проверьте политики после создания
SELECT 
  policyname,
  cmd as operation,
  qual as definition,
  roles
FROM pg_policies
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND (policyname LIKE '%chat-attachments%' OR qual LIKE '%chat-attachments%');

