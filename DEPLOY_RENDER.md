# Инструкция по деплою на Render (БЕСПЛАТНО)

## Шаги для деплоя:

### 1. Создайте аккаунт на Render
- Перейдите на https://render.com
- Нажмите "Get Started for Free"
- Войдите через GitHub (рекомендуется)

### 2. Создайте новый Web Service
- В Dashboard нажмите "New +"
- Выберите "Web Service"
- Подключите ваш GitHub репозиторий `OwnGram`

### 3. Настройте проект
- **Name**: `owngram` (или любое другое)
- **Environment**: `Node`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm run start`
- **Plan**: `Free` (бесплатный)

### 4. Добавьте Environment Variables
В разделе "Environment" добавьте:
- `NODE_ENV` = `production`
- `NEXT_PUBLIC_SUPABASE_URL` = ваш Supabase URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = ваш Supabase anon key

### 5. Деплой
- Нажмите "Create Web Service"
- Render автоматически соберет и задеплоит проект
- Первый деплой займет 5-10 минут
- После деплоя вы получите URL вида: `your-project.onrender.com`

## ⚠️ Важно про бесплатный план:
- **Сервис засыпает** после 15 минут бездействия
- **Первый запрос** после пробуждения может быть медленным (30-60 секунд)
- Для чата это может быть проблемой, но для начала сойдет

## Альтернатива: Railway (если Render не подойдет)
Railway тоже простой вариант:
1. Зайдите на https://railway.app
2. Войдите через GitHub
3. Создайте новый проект из репозитория
4. Добавьте переменные окружения
5. Railway автоматически определит Next.js

## Если нужен постоянный uptime:
Рассмотрите платные планы или VPS, но для тестирования Render/Railway сойдут.







