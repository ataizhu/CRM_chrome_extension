// ============================================================
// Кросс-браузерная совместимость (Chrome/Edge vs Firefox)
// ============================================================

const isFirefox = typeof browser !== 'undefined' && browser.runtime && browser.runtime.id;

/** Открыть боковую панель (sidePanel в Chrome/Edge, sidebarAction в Firefox) */
async function openSidePanel(tabId) {
  if (chrome.sidePanel && chrome.sidePanel.open) {
    return chrome.sidePanel.open({ tabId });
  }
  if (isFirefox && browser.sidebarAction) {
    return browser.sidebarAction.open();
  }
}

// ============================================================
// Контекстное меню
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'addTask',
    title: 'Добавить задачу: "%s"',
    contexts: ['selection']
  });
  // При установке/обновлении — проверить, нужен ли alarm для уведомлений
  initAlarm();
});

// Обработка клика по контекстному меню
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'addTask') {
    const selectedText = info.selectionText;
    
    // Сохраняем задачу в storage для side panel
    await chrome.storage.local.set({ 
      pendingTask: { text: selectedText, group: null }
    });
    
    // Открываем боковую панель
    try {
      await openSidePanel(tab.id);
    } catch (err) {
      console.error('Ошибка открытия боковой панели:', err);
    }
  }
});

// Обработка клика по иконке расширения
chrome.action.onClicked.addListener(async (tab) => {
  await openSidePanel(tab.id);
});

// Обработка сообщений от side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getPendingTask') {
    chrome.storage.local.get(['pendingTask'], (result) => {
      if (result.pendingTask) {
        sendResponse(result.pendingTask);
        chrome.storage.local.remove(['pendingTask']);
      } else {
        sendResponse(null);
      }
    });
    return true;
  }
  if (message.action === 'openSettings') {
    chrome.windows.create({
      url: chrome.runtime.getURL('settings.html'),
      type: 'popup',
      width: 440,
      height: 620
    });
    sendResponse({ ok: true });
    return false;
  }
  if (message.action === 'openStats') {
    chrome.windows.create({
      url: chrome.runtime.getURL('stats.html'),
      type: 'popup',
      width: 560,
      height: 640
    });
    sendResponse({ ok: true });
    return false;
  }
});

// ============================================================
// Фоновое обновление кэша задач и уведомления
// ============================================================

const ALARM_NAME = 'checkTasks';
const API_ENDPOINT = 'https://vtiger.crm.kg/api-for-chrome-extension/extensionAPI_v1.php';
const DEADLINE_HOURS = 24; // уведомлять за 24 часа до дедлайна
const STORAGE_KEY_CRM_CACHE = 'crmTasksCache';

/** Аутентифицированный fetch (аналог js/api.js apiFetch) */
async function bgApiFetch(url) {
  const { vtigerCredentials, authToken } = await chrome.storage.sync.get(['vtigerCredentials', 'authToken']);
  const headers = {};
  if (vtigerCredentials && vtigerCredentials.username) {
    const password = vtigerCredentials.password || vtigerCredentials.accessKey || '';
    const b64 = btoa(unescape(encodeURIComponent(`${vtigerCredentials.username}:${password}`)));
    headers['Authorization'] = `Basic ${b64}`;
  } else if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  } else {
    return null; // не авторизован
  }
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    return res;
  } catch (err) {
    console.warn('bgApiFetch error:', err.message);
    return null;
  }
}

/** Рассчитать date_from из периода (дублирует логику tasks.js для background контекста) */
function bgPeriodToDateFrom(period, exact = {}) {
  const MS_DAY = 24 * 60 * 60 * 1000;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'today') return today.toISOString().slice(0, 10);

  if (period === 'week') {
    if (exact.week) {
      const day = today.getDay();
      const diff = day === 0 ? 6 : day - 1;
      return new Date(today.getTime() - diff * MS_DAY).toISOString().slice(0, 10);
    }
    return new Date(today.getTime() - 7 * MS_DAY).toISOString().slice(0, 10);
  }
  if (period === 'month') {
    if (exact.month) return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    return new Date(today.getTime() - 30 * MS_DAY).toISOString().slice(0, 10);
  }
  if (period === '3months') {
    if (exact['3months']) return new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10);
    return new Date(today.getTime() - 90 * MS_DAY).toISOString().slice(0, 10);
  }
  if (period === '6months') {
    if (exact['6months']) return new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10);
    return new Date(today.getTime() - 180 * MS_DAY).toISOString().slice(0, 10);
  }
  if (period === 'year') {
    if (exact.year) return new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
    return new Date(today.getTime() - 365 * MS_DAY).toISOString().slice(0, 10);
  }
  return null;
}

/** Загрузить задачи из API */
async function bgFetchTasks() {
  const { syncPeriod, periodExactStart } = await chrome.storage.sync.get(['syncPeriod', 'periodExactStart']);
  const period = syncPeriod || 'month';
  const exact = periodExactStart && typeof periodExactStart === 'object' ? periodExactStart : {};
  let url = `${API_ENDPOINT}?action=tasks&period=${encodeURIComponent(period)}`;
  const dateFrom = bgPeriodToDateFrom(period, exact);
  if (dateFrom) {
    url += `&date_from=${encodeURIComponent(dateFrom)}`;
  }
  url += '&collapse_recurring=1';
  const res = await bgApiFetch(url);
  if (!res) return null;
  try {
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.tasks || data.items || []);
    return list;
  } catch {
    return null;
  }
}

/** Нормализовать задачи для кэша (аналог tasks.js _normalizeCrmTasks) */
function normalizeTasks(tasks) {
  return tasks.map(t => {
    const task = { ...t, group: 'CRM' };
    if (!task.createdAt) task.createdAt = new Date().toISOString();
    return task;
  });
}

/** Показать Chrome-уведомление */
function showNotification(id, title, message) {
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'assets/icon.png',
    title,
    message,
    priority: 1
  });
}

/** Основная проверка: обновление кэша + уведомления */
async function bgCheckTasks() {
  const tasks = await bgFetchTasks();
  if (!tasks) return;

  // Сохраняем задачи в кэш (тот же ключ что использует storage.js)
  const normalized = normalizeTasks(tasks);
  await chrome.storage.local.set({ [STORAGE_KEY_CRM_CACHE]: normalized });

  // Уведомления (только если включены)
  const { notifyEnabled } = await chrome.storage.sync.get(['notifyEnabled']);
  if (!notifyEnabled || tasks.length === 0) return;

  const { knownTaskIds = [], notifiedDeadlineIds = [] } = await chrome.storage.local.get(['knownTaskIds', 'notifiedDeadlineIds']);
  const knownSet = new Set(knownTaskIds);
  const deadlineSet = new Set(notifiedDeadlineIds);
  const now = Date.now();

  // — Новые задачи —
  const currentIds = tasks.map(t => String(t.id));
  if (knownTaskIds.length > 0) {
    const newTasks = tasks.filter(t => !knownSet.has(String(t.id)));
    for (const task of newTasks) {
      const subject = task.subject || task.text || 'Без темы';
      showNotification(`new-${task.id}`, 'Новая задача', subject);
    }
  }

  // — Дедлайн через 24 часа —
  const activeTasks = tasks.filter(t => {
    const status = String(t.eventstatus || '').trim();
    return !t.completed && !/^(Held|Выполнено|Not Held|Отменено)$/i.test(status);
  });
  for (const task of activeTasks) {
    const end = task.due_date_raw || task.end;
    if (!end) continue;
    const deadlineMs = new Date(end).getTime();
    if (isNaN(deadlineMs)) continue;
    const hoursLeft = (deadlineMs - now) / (1000 * 60 * 60);
    if (hoursLeft > 0 && hoursLeft <= DEADLINE_HOURS && !deadlineSet.has(String(task.id))) {
      const subject = task.subject || task.text || 'Без темы';
      const hoursRounded = Math.round(hoursLeft);
      const timeLeft = hoursRounded >= 1 ? `${hoursRounded} ч.` : `${Math.round(hoursLeft * 60)} мин.`;
      showNotification(`deadline-${task.id}`, 'Скоро дедлайн', `${subject} — осталось ${timeLeft}`);
      deadlineSet.add(String(task.id));
    }
  }

  // Обновляем хранилище уведомлений
  const currentIdSet = new Set(currentIds);
  const cleanedDeadlineIds = [...deadlineSet].filter(id => currentIdSet.has(id));
  await chrome.storage.local.set({
    knownTaskIds: currentIds,
    notifiedDeadlineIds: cleanedDeadlineIds
  });
}

/** Инициализация alarm (работает когда включено автообновление ИЛИ уведомления) */
async function initAlarm() {
  const { autoLoadEnabled, autoLoadIntervalMinutes, notifyEnabled } = await chrome.storage.sync.get([
    'autoLoadEnabled', 'autoLoadIntervalMinutes', 'notifyEnabled'
  ]);
  const needAlarm = autoLoadEnabled === true || notifyEnabled === true;
  if (needAlarm) {
    const minutes = Math.max(5, Math.min(60, parseInt(autoLoadIntervalMinutes, 10) || 15));
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: minutes });
  } else {
    chrome.alarms.clear(ALARM_NAME);
  }
}

// Обработка alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    bgCheckTasks();
  }
});

// Реакция на изменение настроек
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.notifyEnabled || changes.autoLoadEnabled || changes.autoLoadIntervalMinutes)) {
    initAlarm();
    // При включении уведомлений — проверить сразу
    if (changes.notifyEnabled && changes.notifyEnabled.newValue) {
      bgCheckTasks();
    }
  }
});

// Клик по уведомлению — открыть боковую панель
chrome.notifications.onClicked.addListener(async (notificationId) => {
  chrome.notifications.clear(notificationId);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    try {
      await openSidePanel(tab.id);
    } catch {}
  }
});

// При запуске service worker — инициализировать alarm
initAlarm();

// ============================================================
// Автоконтроль таймера заметок
// ============================================================

const TIMER_TICK_ALARM = 'timerTick';         // каждую 1 мин — lastTick
const TIMER_HOURLY_ALARM = 'timerHourly';     // каждые 60 мин — напоминание
const TIMER_IDLE_THRESHOLD = 30 * 60;         // 30 мин в секундах
const TIMER_IDLE_AUTOPAUSE_DELAY = 5 * 60000; // 5 мин в мс — ждём ответ на уведомление
const STORAGE_KEY_PERSONAL = 'personalTasks';

/** Получить все заметки с running таймером (локальные + sync) */
async function getRunningTimerNotes() {
  const running = [];

  // Локальные заметки
  const { [STORAGE_KEY_PERSONAL]: personal = [] } = await chrome.storage.sync.get([STORAGE_KEY_PERSONAL]);
  for (const note of personal) {
    if (note.group === 'Заметки' && note.timerRunning && note.timerStartedAt) {
      running.push({ source: 'local', note });
    }
  }

  // Sync заметки (кэш)
  const { syncNotesCache = [] } = await chrome.storage.local.get(['syncNotesCache']);
  for (const note of syncNotesCache) {
    if (note.timerRunning && note.timerStartedAt) {
      running.push({ source: 'sync', note });
    }
  }

  return running;
}

/** Поставить таймер на паузу и обрезать сегмент по cutoffTime */
async function autoPauseTimer(noteInfo, cutoffIso) {
  const { source, note } = noteInfo;
  const startedAt = new Date(note.timerStartedAt).getTime();
  const cutoff = new Date(cutoffIso).getTime();
  const sessionSeconds = Math.max(0, Math.floor((cutoff - startedAt) / 1000));

  // Если сессия < 60 сек — удаляем сегмент (как в ui.js)
  const segments = Array.isArray(note.timerSegments) ? [...note.timerSegments] : [];
  if (sessionSeconds < 60 && segments.length > 0) {
    segments.pop();
  } else if (segments.length > 0) {
    segments[segments.length - 1].end = cutoffIso;
  }

  const newElapsed = sessionSeconds < 60
    ? (note.timerElapsedSeconds || 0)
    : (note.timerElapsedSeconds || 0) + sessionSeconds;

  if (source === 'local') {
    const { [STORAGE_KEY_PERSONAL]: tasks = [] } = await chrome.storage.sync.get([STORAGE_KEY_PERSONAL]);
    const task = tasks.find(t => String(t.id) === String(note.id));
    if (task) {
      task.timerRunning = false;
      task.timerStartedAt = null;
      task.timerElapsedSeconds = newElapsed;
      task.timerSegments = segments;
      await chrome.storage.sync.set({ [STORAGE_KEY_PERSONAL]: tasks });
    }
  } else if (source === 'sync') {
    // Для sync-заметок — отправляем обновление через API
    try {
      const { vtigerCredentials, authToken } = await chrome.storage.sync.get(['vtigerCredentials', 'authToken']);
      const headers = { 'Content-Type': 'application/json' };
      if (vtigerCredentials && vtigerCredentials.username) {
        const password = vtigerCredentials.password || vtigerCredentials.accessKey || '';
        const b64 = btoa(unescape(encodeURIComponent(`${vtigerCredentials.username}:${password}`)));
        headers['Authorization'] = `Basic ${b64}`;
      } else if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      await fetch(`${API_ENDPOINT}?action=sync-note-update`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          note_id: note.id,
          payload: {
            timerElapsedSeconds: newElapsed,
            timerRunning: false,
            timerStartedAt: null,
            timerSegments: segments
          }
        })
      });
    } catch (err) {
      console.error('Ошибка автопаузы sync-заметки:', err);
    }

    // Обновляем локальный кэш
    const { syncNotesCache = [] } = await chrome.storage.local.get(['syncNotesCache']);
    const cached = syncNotesCache.find(n => String(n.id) === String(note.id));
    if (cached) {
      cached.timerRunning = false;
      cached.timerStartedAt = null;
      cached.timerElapsedSeconds = newElapsed;
      cached.timerSegments = segments;
      await chrome.storage.local.set({ syncNotesCache });
    }
  }
}

/** Форматирование длительности для уведомлений */
function formatDurationHM(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}ч ${m}мин`;
  return `${m}мин`;
}

// --- lastTick: каждую минуту записываем timestamp ---
chrome.alarms.create(TIMER_TICK_ALARM, { periodInMinutes: 1 });

// --- Hourly напоминание ---
chrome.alarms.create(TIMER_HOURLY_ALARM, { periodInMinutes: 60 });

// Расширяем обработчик alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === TIMER_TICK_ALARM) {
    await chrome.storage.local.set({ timerLastTick: Date.now() });
  }

  if (alarm.name === TIMER_HOURLY_ALARM) {
    const running = await getRunningTimerNotes();
    for (const { note } of running) {
      const elapsed = (note.timerElapsedSeconds || 0) +
        Math.floor((Date.now() - new Date(note.timerStartedAt).getTime()) / 1000);
      const name = note.text || note.subject || 'Заметка';
      showNotification(
        `timer-hourly-${note.id}`,
        `Таймер активен: ${formatDurationHM(elapsed)}`,
        `«${name}» — продолжить?`
      );
    }
  }

  if (alarm.name === 'timerIdleAutopause') {
    // 5 мин прошло — если всё ещё idle, автопауза
    const running = await getRunningTimerNotes();
    if (running.length === 0) return;

    const idleState = await chrome.idle.queryState(TIMER_IDLE_THRESHOLD);
    if (idleState !== 'active') {
      const { timerIdleStart } = await chrome.storage.local.get(['timerIdleStart']);
      const cutoffIso = timerIdleStart
        ? new Date(timerIdleStart).toISOString()
        : new Date().toISOString();

      for (const noteInfo of running) {
        await autoPauseTimer(noteInfo, cutoffIso);
        const name = noteInfo.note.text || noteInfo.note.subject || 'Заметка';
        chrome.notifications.clear(`timer-idle-${noteInfo.note.id}`);
        showNotification(
          `timer-paused-${noteInfo.note.id}`,
          'Таймер на паузе',
          `«${name}» — автопауза из-за неактивности`
        );
      }
    }
  }
});

// --- chrome.idle: отслеживание бездействия (30 мин) ---
chrome.idle.setDetectionInterval(TIMER_IDLE_THRESHOLD);

chrome.idle.onStateChanged.addListener(async (state) => {
  const running = await getRunningTimerNotes();
  if (running.length === 0) return;

  if (state === 'idle' || state === 'locked') {
    // Пользователь неактивен — уведомление + запуск 5-мин таймера
    const idleStartTime = Date.now();
    await chrome.storage.local.set({ timerIdleStart: idleStartTime });

    for (const { note } of running) {
      const name = note.text || note.subject || 'Заметка';
      showNotification(
        `timer-idle-${note.id}`,
        'Таймер работает',
        `«${name}» — вы неактивны. Нажмите чтобы продолжить.`
      );
    }

    // Через 5 мин — автопауза если не ответил
    chrome.alarms.create('timerIdleAutopause', { delayInMinutes: 5 });
  }

  if (state === 'active') {
    // Пользователь вернулся — проверяем разрыв по lastTick
    chrome.alarms.clear('timerIdleAutopause');
    const { timerLastTick } = await chrome.storage.local.get(['timerLastTick']);

    if (timerLastTick) {
      const gapMinutes = (Date.now() - timerLastTick) / 60000;

      if (gapMinutes > 30) {
        // Большой разрыв (сон/выключение) — обрезаем по lastTick
        const cutoffIso = new Date(timerLastTick).toISOString();
        for (const noteInfo of running) {
          await autoPauseTimer(noteInfo, cutoffIso);
          const name = noteInfo.note.text || noteInfo.note.subject || 'Заметка';
          showNotification(
            `timer-paused-${noteInfo.note.id}`,
            'Таймер на паузе',
            `«${name}» — время обрезано, компьютер был неактивен`
          );
        }
        await chrome.storage.local.remove(['timerIdleStart']);
        return;
      }
    }

    // Обычный возврат из idle — очищаем ожидание
    await chrome.storage.local.remove(['timerIdleStart']);
  }
});

// Клик по уведомлению таймера — "Продолжить"
chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId.startsWith('timer-idle-') || notificationId.startsWith('timer-hourly-')) {
    chrome.notifications.clear(notificationId);
    chrome.alarms.clear('timerIdleAutopause');
    await chrome.storage.local.remove(['timerIdleStart']);
  }
});
