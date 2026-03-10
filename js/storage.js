// storage.js - Работа с chrome.storage

import { STORAGE_KEY_PERSONAL, STORAGE_KEY_DELETED_CRM, STORAGE_KEY_CRM_CACHE, STORAGE_KEY_USER_HIDDEN_GROUPS, DEFAULT_GROUPS, CRM_GROUP_NAME, setGroups, setSelectedGroup, setVisibleGroups, setSyncPeriod, setAuthMode, setTheme, setAutoLoadEnabled, setAutoLoadIntervalMinutes, setTaskSortOrder, setExcludeCompleted, setExcludeCancelled, setCrmSyncActivityTypes, setCrmSyncEventStatuses, setSelectedSyncGroupId, setCrmSyncSourceGroupId, setCrmSyncOtherUsers, CRM_SYNC_ACTIVITY_VALUES, CRM_SYNC_STATUS_VALUES, isCrmGroup } from './config.js';
import { isAuthed } from './auth.js';

// Загрузка конфигурации
export async function loadConfig() {
  const result = await chrome.storage.sync.get(['theme', 'notifyEnabled', 'selectedGroup', 'syncPeriod', 'authMode', 'visibleGroups', 'autoLoadEnabled', 'autoLoadIntervalMinutes', 'taskSortOrder', 'crmSyncActivityTypes', 'crmSyncEventStatuses', 'selectedSyncGroupId', 'crmSyncSourceGroupId', 'crmSyncOtherUsers']);
  if (result.theme === 'dark' || result.theme === 'light') {
    await setTheme(result.theme);
  }
  if (result.selectedGroup !== undefined) setSelectedGroup(result.selectedGroup);
  const validPeriods = ['today', 'week', 'month', '3months', '6months', 'year'];
  const period = result.syncPeriod === 'all' ? 'month' : result.syncPeriod;
  if (period && validPeriods.includes(period)) setSyncPeriod(period);
  if (['bearer', 'vtiger', 'vtiger_password'].includes(result.authMode)) {
    setAuthMode(result.authMode);
  } else {
    setAuthMode('vtiger_password'); // По умолчанию для зашитого endpoint
  }
  setAutoLoadEnabled(result.autoLoadEnabled === true);
  const interval = parseInt(result.autoLoadIntervalMinutes, 10);
  if (interval >= 5 && interval <= 60) setAutoLoadIntervalMinutes(interval);
  if (result.taskSortOrder === 'date_desc' || result.taskSortOrder === 'date_asc') setTaskSortOrder(result.taskSortOrder);
  setExcludeCompleted(false);
  setExcludeCancelled(false);
  if (Array.isArray(result.crmSyncActivityTypes)) setCrmSyncActivityTypes(result.crmSyncActivityTypes);
  else setCrmSyncActivityTypes(CRM_SYNC_ACTIVITY_VALUES);
  if (Array.isArray(result.crmSyncEventStatuses)) setCrmSyncEventStatuses(result.crmSyncEventStatuses);
  else setCrmSyncEventStatuses(CRM_SYNC_STATUS_VALUES);
  if (result.selectedSyncGroupId !== undefined) setSelectedSyncGroupId(result.selectedSyncGroupId);
  if (result.crmSyncSourceGroupId !== undefined) setCrmSyncSourceGroupId(result.crmSyncSourceGroupId);
  if (result.crmSyncOtherUsers !== undefined && typeof result.crmSyncOtherUsers === 'object') setCrmSyncOtherUsers(result.crmSyncOtherUsers);
}

export async function saveSelectedSyncGroupId(groupId) {
  await chrome.storage.sync.set({ selectedSyncGroupId: groupId || '' });
  setSelectedSyncGroupId(groupId || '');
}

// Личные задачи и Заметки — chrome.storage.sync для синхронизации профиля
// (подтягиваются при открытии в новом браузере/устройстве с тем же Google-аккаунтом)
export async function loadPersonalTasks() {
  const r = await chrome.storage.sync.get([STORAGE_KEY_PERSONAL, 'tasks']);
  let personal = r[STORAGE_KEY_PERSONAL];
  if (personal && personal.length) return personal;
  const legacy = r.tasks || [];
  const nonCrm = legacy.filter((t) => t.group !== 'CRM');
  if (nonCrm.length) {
    await savePersonalTasks(nonCrm);
    return nonCrm;
  }
  return [];
}

export async function savePersonalTasks(tasks) {
  await chrome.storage.sync.set({ [STORAGE_KEY_PERSONAL]: tasks });
}

export async function savePersonalTask(task) {
  const tasks = await loadPersonalTasks();
  tasks.push(task);
  await savePersonalTasks(tasks);
}

export async function updatePersonalTask(updatedTask) {
  const tasks = await loadPersonalTasks();
  const i = tasks.findIndex(t => t.id === updatedTask.id);
  if (i !== -1) {
    tasks[i] = updatedTask;
    await savePersonalTasks(tasks);
  }
}

/** Обновить таймер заметки: старт/пауза */
export async function updateNoteTimer(noteId, running, elapsedSeconds, startedAt, timerSegments) {
  const tasks = await loadPersonalTasks();
  const task = tasks.find(t => t.id == noteId && t.group === 'Заметки');
  if (!task) return;
  task.timerElapsedSeconds = elapsedSeconds ?? task.timerElapsedSeconds ?? 0;
  task.timerRunning = !!running;
  task.timerStartedAt = startedAt ?? null;
  if (timerSegments !== undefined) task.timerSegments = timerSegments;
  await savePersonalTasks(tasks);
}

export async function clearAllPersonalTasks() {
  await savePersonalTasks([]);
}

export async function deletePersonalTasksByGroup(groupName) {
  const tasks = await loadPersonalTasks();
  const filtered = tasks.filter((t) => t.group !== groupName);
  await savePersonalTasks(filtered);
}

export async function renamePersonalTasksGroup(oldName, newName) {
  const tasks = await loadPersonalTasks();
  const updated = tasks.map((t) => (t.group === oldName ? { ...t, group: newName } : t));
  await savePersonalTasks(updated);
}

// Удаленные CRM задачи
// Используем chrome.storage.local вместо sync, так как:
// 1. Лимит sync: 8KB на ключ, local: 10MB
// 2. Удаленные задачи не нужно синхронизировать между устройствами
export async function loadDeletedCrmTasks() {
  // Сначала проверяем local
  const localResult = await chrome.storage.local.get([STORAGE_KEY_DELETED_CRM]);
  if (localResult[STORAGE_KEY_DELETED_CRM]) {
    return localResult[STORAGE_KEY_DELETED_CRM];
  }
  
  // Если нет в local, проверяем sync (миграция со старой версии)
  const syncResult = await chrome.storage.sync.get([STORAGE_KEY_DELETED_CRM]);
  if (syncResult[STORAGE_KEY_DELETED_CRM]) {
    // Мигрируем данные из sync в local
    const deletedIds = syncResult[STORAGE_KEY_DELETED_CRM];
    await chrome.storage.local.set({ [STORAGE_KEY_DELETED_CRM]: deletedIds });
    // Удаляем из sync
    await chrome.storage.sync.remove([STORAGE_KEY_DELETED_CRM]);
    // console.log('[Миграция] Перенесено удаленных CRM задач из sync в local:', deletedIds.length);
    return deletedIds;
  }
  
  return [];
}

export async function saveDeletedCrmTasks(deletedIds) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_DELETED_CRM]: deletedIds });
  } catch (err) {
    // Если все еще превышен лимит, ограничиваем размер массива
    if (err.message && err.message.includes('quota')) {
      // console.warn('[saveDeletedCrmTasks] Превышен лимит local storage, ограничиваем до последних 10000 ID');
      // Оставляем только последние 10000 ID
      const limited = deletedIds.slice(-10000);
      await chrome.storage.local.set({ [STORAGE_KEY_DELETED_CRM]: limited });
    } else {
      throw err;
    }
  }
}

export async function markCrmTaskAsDeleted(taskId) {
  const deleted = await loadDeletedCrmTasks();
  // Убираем префикс crm_ если есть и приводим к строке для единообразия
  const id = taskId.toString().replace(/^crm_/, '');
  // Проверяем, что ID еще не в списке удаленных (сравниваем как строки)
  const idStr = id.toString();
  if (!deleted.some(d => d.toString() === idStr)) {
    deleted.push(idStr);
    await saveDeletedCrmTasks(deleted);
    // console.log('CRM задача помечена как удаленная:', idStr, 'Всего удаленных:', deleted.length);
  }
}

// Группы
export async function loadGroups() {
  const result = await chrome.storage.sync.get(['groups', 'selectedGroup', 'visibleGroups', STORAGE_KEY_USER_HIDDEN_GROUPS, 'crmSyncOtherUsers']);
  let loadedGroups = result.groups || [];
  if (!loadedGroups.length) {
    loadedGroups = [...DEFAULT_GROUPS];
    await saveGroups(loadedGroups);
  }
  if (!loadedGroups.includes('Заметки')) {
    loadedGroups = [...loadedGroups, 'Заметки'];
    await saveGroups(loadedGroups);
  }
  const authed = isAuthed();
  if (authed && !loadedGroups.includes(CRM_GROUP_NAME)) {
    loadedGroups = [...loadedGroups, CRM_GROUP_NAME];
    await saveGroups(loadedGroups);
  }
  const hidden = Array.isArray(result[STORAGE_KEY_USER_HIDDEN_GROUPS]) ? result[STORAGE_KEY_USER_HIDDEN_GROUPS] : [];
  loadedGroups = loadedGroups.filter((g) => !hidden.includes(g));
  if (!loadedGroups.length) loadedGroups = ['Личные'];
  setGroups(loadedGroups);

  const availableGroups = loadedGroups.filter(g => authed || !isCrmGroup(g) || g === 'Заметки');
  
  const stored = result.selectedGroup;
  // Если сохраненная группа недоступна (например, CRM без авторизации), выбираем первую доступную
  if (!stored || !loadedGroups.includes(stored) || (isCrmGroup(stored) && !authed)) {
    const defaultGroup = availableGroups.length > 0 ? availableGroups[0] : 'Личные';
    setSelectedGroup(defaultGroup);
    await chrome.storage.sync.set({ selectedGroup: defaultGroup });
  } else {
    setSelectedGroup(stored);
  }
  
  const defaultVisibleAll = availableGroups.length > 0 ? [...availableGroups] : ['Личные'];
  if (result.visibleGroups && Array.isArray(result.visibleGroups) && result.visibleGroups.length > 0) {
    const filtered = result.visibleGroups.filter(g => loadedGroups.includes(g) && (authed || !isCrmGroup(g) || g === 'Заметки'));
    if (filtered.length === 0) {
      setVisibleGroups(defaultVisibleAll);
      await chrome.storage.sync.set({ visibleGroups: defaultVisibleAll });
    } else {
      setVisibleGroups(filtered);
    }
  } else {
    setVisibleGroups(defaultVisibleAll);
    await chrome.storage.sync.set({ visibleGroups: defaultVisibleAll });
  }
}

export async function saveGroups(groupsToSave) {
  await chrome.storage.sync.set({ groups: groupsToSave });
}

export async function loadUserHiddenGroups() {
  const r = await chrome.storage.sync.get([STORAGE_KEY_USER_HIDDEN_GROUPS]);
  const arr = r[STORAGE_KEY_USER_HIDDEN_GROUPS];
  return Array.isArray(arr) ? arr : [];
}

export async function saveUserHiddenGroups(arr) {
  await chrome.storage.sync.set({ [STORAGE_KEY_USER_HIDDEN_GROUPS]: arr });
}

// Авторизация — в chrome.storage.sync, чтобы подтягивалась в профиль Chrome на других устройствах
export async function loadAuth() {
  const result = await chrome.storage.sync.get(['authToken', 'user', 'vtigerCredentials']);
  const hasInSync = result.authToken || result.user || result.vtigerCredentials;
  if (!hasInSync) {
    const localResult = await chrome.storage.local.get(['authToken', 'user', 'vtigerCredentials']);
    if (localResult.authToken || localResult.user || localResult.vtigerCredentials) {
      await chrome.storage.sync.set({
        authToken: localResult.authToken ?? null,
        user: localResult.user ?? null,
        vtigerCredentials: localResult.vtigerCredentials ?? null
      });
      await chrome.storage.local.remove(['authToken', 'user', 'vtigerCredentials']);
      return {
        authToken: localResult.authToken || null,
        user: localResult.user || null,
        vtigerCredentials: localResult.vtigerCredentials || null
      };
    }
  }
  return {
    authToken: result.authToken || null,
    user: result.user || null,
    vtigerCredentials: result.vtigerCredentials || null
  };
}

export async function saveAuth(data) {
  await chrome.storage.sync.set(data);
}

export async function clearAuth() {
  await chrome.storage.sync.remove(['authToken', 'user', 'vtigerCredentials']);
}

// Кэш CRM задач в chrome.storage.local
export async function loadCrmTasksCache() {
  const r = await chrome.storage.local.get([STORAGE_KEY_CRM_CACHE]);
  const arr = r[STORAGE_KEY_CRM_CACHE];
  return Array.isArray(arr) ? arr : [];
}

export async function saveCrmTasksCache(tasks) {
  await chrome.storage.local.set({ [STORAGE_KEY_CRM_CACHE]: tasks });
}

function _normalizeTaskId(id) {
  return String(id).replace(/^crm_/, '');
}

/** Обновить или добавить задачу в кэше (partial merge) */
export async function updateCrmTaskInCache(task) {
  const tasks = await loadCrmTasksCache();
  const idNorm = _normalizeTaskId(task.id);
  const idx = tasks.findIndex((t) => _normalizeTaskId(t.id) === idNorm);
  const toSave = { ...task, group: 'CRM' };
  if (!toSave.createdAt) toSave.createdAt = new Date().toISOString();
  if (idx >= 0) {
    tasks[idx] = { ...tasks[idx], ...toSave };
  } else {
    tasks.push(toSave);
  }
  await saveCrmTasksCache(tasks);
}

/** Удалить задачу из кэша (при локальном «удалении») */
export async function removeCrmTaskFromCache(taskId) {
  const tasks = await loadCrmTasksCache();
  const idNorm = _normalizeTaskId(taskId);
  const filtered = tasks.filter((t) => _normalizeTaskId(t.id) !== idNorm);
  if (filtered.length !== tasks.length) {
    await saveCrmTasksCache(filtered);
  }
}

/**
 * Оценка размера массива задач в байтах (UTF-8) для хранения в chrome.storage.
 * Используется для планирования кэширования CRM задач в local storage.
 * @param {Array} tasks - массив задач
 * @returns {{ bytes: number, formatted: string }} размер в байтах и форматированная строка
 */
export function estimateStorageSize(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { bytes: 0, formatted: '0 B' };
  }
  const json = JSON.stringify(tasks);
  const bytes = new TextEncoder().encode(json).length;
  let formatted;
  if (bytes < 1024) {
    formatted = `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    formatted = `${(bytes / 1024).toFixed(1)} KB`;
  } else {
    formatted = `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return { bytes, formatted };
}
