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
    
    // Открываем side panel
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (err) {
      console.error('Ошибка открытия side panel:', err);
    }
  }
});

// Обработка клика по иконке расширения
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
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
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  return res;
}

/** Загрузить задачи из API */
async function bgFetchTasks() {
  const { syncPeriod } = await chrome.storage.sync.get(['syncPeriod']);
  const period = syncPeriod || 'month';
  const url = `${API_ENDPOINT}?action=tasks&period=${encodeURIComponent(period)}`;
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

// Клик по уведомлению — открыть side panel
chrome.notifications.onClicked.addListener(async (notificationId) => {
  chrome.notifications.clear(notificationId);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch {}
  }
});

// При запуске service worker — инициализировать alarm
initAlarm();
