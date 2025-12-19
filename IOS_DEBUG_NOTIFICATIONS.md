# Отладка уведомлений на iOS

## Шаги для проверки

### 1. Проверьте, что приложение добавлено на главный экран
- Откройте Safari на iPhone
- Перейдите на ваш сайт
- Нажмите "Поделиться" (квадрат со стрелкой) → "На экран «Домой»"
- **Важно:** Запускайте приложение ТОЛЬКО с главного экрана, не из Safari!

### 2. Проверьте разрешения
- Настройки → OwnGram → Уведомления
- Убедитесь, что уведомления включены

### 3. Откройте консоль разработчика (для отладки)

**На Mac:**
1. Подключите iPhone к Mac через USB
2. На iPhone: Настройки → Safari → Дополнения → Веб-инспектор (включить)
3. На Mac: Откройте Safari → Разработка → [Ваш iPhone] → [Ваш сайт]

**Или используйте удаленную отладку:**
- На iPhone откройте приложение
- В Safari на Mac вы увидите его в меню "Разработка"

### 4. Проверьте логи в консоли

Откройте консоль и проверьте наличие следующих сообщений:

✅ **Должны быть:**
```
[Notifications] Service Worker registered: ...
[Notifications] Service Worker ready
[Notifications] Permission: granted
[Sidebar] iOS detected: { isStandalone: true, hasSW: true, permission: "granted" }
```

❌ **Если видите ошибки:**
- `Service Worker not supported` - браузер не поддерживает SW
- `iOS requires app to be added to home screen` - приложение не в PWA режиме
- `Permission not granted` - разрешение не дано

### 5. Проверьте Service Worker

В консоли разработчика:
1. Перейдите на вкладку **Application** (или Приложение)
2. В левом меню найдите **Service Workers**
3. Должен быть зарегистрирован `/sw.js`
4. Статус должен быть **activated and running**

### 6. Тест уведомления

Отправьте тестовое сообщение и проверьте логи:

✅ **Должны быть:**
```
[Sidebar] Attempting to show notification: { senderName: "...", chatId: "..." }
[Notifications] Permission status: granted
[Notifications] Document hidden: true/false
[Notifications] Is iOS: true
[Notifications] Is standalone: true
[Notifications] Service Worker ready, showing notification
[Notifications] ✅ Notification shown via Service Worker
```

❌ **Если видите:**
- `Notification skipped` - проверьте условия (permission, standalone, etc.)
- `Failed to show notification via SW` - ошибка Service Worker
- `Service Worker not available` - SW не зарегистрирован

### 7. Частые проблемы

#### Проблема: Уведомления не появляются
**Решение:**
1. Убедитесь, что приложение запущено с главного экрана (не Safari)
2. Проверьте разрешения в Настройки → OwnGram → Уведомления
3. Перезапустите приложение (закройте полностью и откройте снова)
4. Проверьте консоль на наличие ошибок

#### Проблема: "iOS requires app to be added to home screen"
**Решение:**
- Приложение должно быть добавлено на главный экран
- Запускайте с главного экрана, не из Safari
- Проверьте `isStandalone()` в консоли - должно быть `true`

#### Проблема: "Permission not granted"
**Решение:**
1. Настройки → OwnGram → Уведомления → Включить
2. Или перезапустите приложение и дайте разрешение при запросе

#### Проблема: Service Worker не регистрируется
**Решение:**
1. Проверьте, что файл `/sw.js` доступен (откройте в браузере)
2. Проверьте консоль на ошибки загрузки SW
3. Очистите кеш и перезагрузите приложение

### 8. Ручная проверка в консоли

Откройте консоль в приложении и выполните:

```javascript
// Проверка iOS
navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')

// Проверка standalone
window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches

// Проверка Service Worker
'serviceWorker' in navigator

// Проверка разрешения
Notification.permission

// Проверка Service Worker ready
navigator.serviceWorker.ready.then(reg => console.log('SW ready:', reg))
```

### 9. Тест уведомления вручную

В консоли выполните:

```javascript
navigator.serviceWorker.ready.then(registration => {
  registration.showNotification('Тест', {
    body: 'Это тестовое уведомление',
    tag: 'test',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png'
  }).then(() => {
    console.log('✅ Уведомление показано!');
  }).catch(error => {
    console.error('❌ Ошибка:', error);
  });
});
```

Если это работает, значит проблема в логике приложения, а не в Service Worker.

## Отправьте логи

Если ничего не помогает, скопируйте все логи из консоли и отправьте разработчику.

