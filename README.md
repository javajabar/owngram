# OwnGram - Чат приложение

Современное веб-приложение для обмена сообщениями, построенное на Next.js и Supabase.

## 🚀 Быстрый старт

### 1. Настройка Supabase

1. Создайте проект на [supabase.com](https://supabase.com)
2. Перейдите в Settings → API
3. Скопируйте `Project URL` и `anon public` key

### 2. Настройка переменных окружения

Создайте файл `.env.local` в корне проекта:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Настройка базы данных

Создайте следующие таблицы в Supabase SQL Editor:

```sql
-- Таблица профилей пользователей
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  status TEXT,
  birth_date DATE,
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица чатов
CREATE TABLE chats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT CHECK (type IN ('dm', 'group')) DEFAULT 'dm',
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица участников чатов
CREATE TABLE chat_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(chat_id, user_id)
);

-- Таблица сообщений
CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_for_all BOOLEAN DEFAULT false,
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  attachments JSONB DEFAULT '[]'::jsonb,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- Если таблица messages уже существует, выполните эти команды для добавления новых полей:
-- ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL;
-- ALTER TABLE messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;
-- ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
-- ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_for_all BOOLEAN DEFAULT false;

-- Включение RLS (Row Level Security)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Политики безопасности
CREATE POLICY "Users can view all profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view chats they are members of" ON chats FOR SELECT USING (
  EXISTS (SELECT 1 FROM chat_members WHERE chat_id = chats.id AND user_id = auth.uid())
);

CREATE POLICY "Users can view chat members of chats they are in" ON chat_members FOR SELECT USING (
  EXISTS (SELECT 1 FROM chat_members cm WHERE cm.chat_id = chat_members.chat_id AND cm.user_id = auth.uid())
);

CREATE POLICY "Users can insert chat members for chats they are in" ON chat_members FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM chat_members cm WHERE cm.chat_id = chat_members.chat_id AND cm.user_id = auth.uid())
);

CREATE POLICY "Users can view messages from chats they are in" ON messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM chat_members WHERE chat_id = messages.chat_id AND user_id = auth.uid())
);

CREATE POLICY "Users can insert messages to chats they are in" ON messages FOR INSERT WITH CHECK (
  chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update own messages" ON messages FOR UPDATE USING (
  sender_id = auth.uid() AND
  chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete own messages" ON messages FOR UPDATE USING (
  sender_id = auth.uid() AND
  chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = auth.uid())
);

-- Триггер для автоматического создания профиля при регистрации
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name)
  VALUES (NEW.id, '@' || split_part(NEW.email, '@', 1), split_part(NEW.email, '@', 1));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 4. Установка зависимостей и запуск

```bash
npm install
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000) в браузере.

## 🔧 Основные исправления

### Исправлены критические ошибки:

1. **✅ Сохранение профиля** - исправлена логика обновления данных
2. **✅ Поиск друзей** - теперь ищет по username и full_name
3. **✅ Авторизация** - добавлен middleware для защиты маршрутов
4. **✅ Регистрация** - убраны хаки, улучшена обработка ошибок
5. **✅ Обработка ошибок** - добавлены состояния загрузки и ошибки

## 📱 Функционал

- 🔐 Аутентификация (вход/регистрация)
- 👤 Управление профилем
- 🔍 Поиск пользователей
- 💬 Создание чатов
- 📨 Отправка сообщений
- 🎨 Современный UI с темной темой

## 🛠 Технологии

- **Next.js 16** - React фреймворк
- **Supabase** - Backend-as-a-Service
- **Tailwind CSS** - Стилизация
- **Zustand** - Управление состоянием
- **Lucide React** - Иконки

## 📝 Скрипты

- `npm run dev` - запуск в режиме разработки
- `npm run build` - сборка для продакшена
- `npm run start` - запуск продакшена
- `npm run lint` - проверка кода
