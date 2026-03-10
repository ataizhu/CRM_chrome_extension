# План рефакторинга sidepanel.js

## Текущее состояние
- Файл: `sidepanel.js` (2049 строк)
- Проблема: Все в одном файле, сложно поддерживать

## Предлагаемое разделение

### 1. `config.js` - Конфигурация и константы
- API_ENDPOINT
- Глобальные переменные состояния (authEndpoint, selectedGroup, groups, theme, etc.)
- Константы (DEFAULT_GROUPS, STORAGE_KEYS, STATS_COLORS)

### 2. `auth.js` - Авторизация
- `isAuthed()`, `checkAuth()`, `login()`, `logout()`
- `saveAuthToken()`, `saveVtigerCredentials()`, `clearAuth()`
- `showLoginModal()`, `hideLoginModal()`
- Работа с vtigerCredentials

### 3. `api.js` - API запросы
- `apiFetch()` - базовая функция для всех запросов
- `fetchTasksFromAPI()` - загрузка задач из CRM
- Обработка ошибок и debug логов

### 4. `storage.js` - Работа с хранилищем
- `loadPersonalTasks()`, `savePersonalTasks()`
- `loadDeletedCrmTasks()`, `saveDeletedCrmTasks()`, `markCrmTaskAsDeleted()`
- `loadGroups()`, `saveGroups()`
- `loadConfig()`, работа с chrome.storage

### 5. `tasks.js` - Управление задачами
- `loadTasks()`, `loadMergedTasks()` - загрузка и объединение
- `createTask()`, `updateTask()`, `deleteTask()`, `toggleTaskComplete()`
- `getTasksByPeriod()` - фильтрация по периоду

### 6. `render.js` - Рендеринг UI
- `renderTasks()`, `renderTaskGroup()`, `renderTaskItem()`
- `formatRemaining()`, `formatDateTime()`, `refreshTaskTimeBadges()`
- `escapeHtml()` - утилита

### 7. `ui.js` - UI компоненты и события
- `setupEventListeners()` - все обработчики событий
- `setupSettingsTab()`, `setupGroupDropdown()`, `setupFormGroupDropdown()`
- `showLoading()`, `hideLoading()`, `showError()`, `hideError()`
- `showSyncStatus()`, `updateSettingsUI()`

### 8. `datetime-picker.js` - Компонент выбора даты/времени
- Все функции dt* (dtFormatDate, dtBuildCalendar, etc.)
- `setupSingleDateTimePicker()`, `initDateTimePickers()`
- `getDateTimePickerValue()`, `setDateTimePickerValue()`

### 9. `stats.js` - Статистика
- `calculateStats()`, `renderStats()`
- Уже есть отдельный файл, но логика в sidepanel.js

### 10. `groups.js` - Управление группами
- `loadGroups()`, `saveGroups()`
- `renderGroupDropdownList()`, `renderFormGroupDropdownList()`
- `updateGroupTriggerLabel()`, `updateFormGroupTriggerLabel()`
- `isCrmGroup()`, `isCrmForm()`

### 11. `modals.js` - Модальные окна
- `openTaskFormModal()`, `closeTaskFormModal()`
- `showGroupSelectionModal()` - модалка выбора групп для очистки
- Работа с формами задач

### 12. `sidepanel.js` - Главный файл (остается)
- Инициализация (DOMContentLoaded)
- Импорты всех модулей
- Координация между модулями
- `checkPendingTask()` - проверка отложенных задач

## Порядок рефакторинга

1. Создать модули по порядку (config, storage, auth, api)
2. Перенести функции, сохраняя зависимости
3. Обновить sidepanel.js для импорта модулей
4. Обновить sidepanel.html для подключения всех скриптов
5. Протестировать функциональность

## Преимущества

- ✅ Легче найти нужный код
- ✅ Проще тестировать отдельные модули
- ✅ Меньше конфликтов при работе в команде
- ✅ Лучшая читаемость и поддержка
- ✅ Возможность переиспользования модулей

## Риски

- ⚠️ Нужно аккуратно обработать зависимости между модулями
- ⚠️ Глобальные переменные нужно правильно экспортировать/импортировать
- ⚠️ Нужно протестировать все функции после разделения

## Альтернатива (если не хотим разделять)

Можно просто добавить комментарии-разделители в sidepanel.js для лучшей навигации, но это не решит проблему размера файла.
