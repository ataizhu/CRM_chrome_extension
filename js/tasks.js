// tasks.js - Управление задачами

import { authEndpoint, syncPeriod, setLastRenderedTasks, excludeCompleted, excludeCancelled, crmSyncActivityTypes, crmSyncEventStatuses, crmSyncOtherUsers, selectedSyncGroupId, CRM_GROUP_NAME, CRM_SYNC_ACTIVITY_VALUES, CRM_SYNC_STATUS_VALUES } from './config.js';
import { isAuthed } from './auth.js';
import { apiFetch, fetchTasksFromAPI, fetchSyncNotes } from './api.js';
import { loadPersonalTasks, savePersonalTasks, savePersonalTask, updatePersonalTask, loadDeletedCrmTasks, saveDeletedCrmTasks, markCrmTaskAsDeleted, estimateStorageSize, loadCrmTasksCache, saveCrmTasksCache, updateCrmTaskInCache, removeCrmTaskFromCache } from './storage.js';
import { isCrmGroup, isNotesGroup } from './groups.js';
import { showError, hideError, showLoading, hideLoading } from './utils.js';

const MS_DAY = 24 * 60 * 60 * 1000;

export function getTasksByPeriod(tasks, period) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  return tasks.filter((t) => {
    const created = t.createdAt ? new Date(t.createdAt).getTime() : 0;
    if (!created && period !== 'all') return false;
    if (period === 'all') return true;
    if (period === 'today') return created >= today;
    if (period === 'week') return created >= today - 7 * MS_DAY;
    if (period === 'month') return created >= today - 30 * MS_DAY;
    if (period === '3months') return created >= today - 90 * MS_DAY;
    if (period === '6months') return created >= today - 180 * MS_DAY;
    if (period === 'year') return created >= today - 365 * MS_DAY;
    return true;
  });
}

function _applyDeletedFilter(crm, deletedIds) {
  const deletedSet = new Set(deletedIds.map((id) => id.toString()));
  return crm.filter((task) => {
    const taskId = task.id.toString().replace(/^crm_/, '');
    return !deletedSet.has(taskId);
  });
}

let _cachedSyncNotes = null;
let _syncNotesPollingId = null;
const SYNC_NOTES_POLL_INTERVAL = 15000; // 15 секунд

export function invalidateSyncNotesCache() {
  _cachedSyncNotes = null;
}

export function startSyncNotesPolling(dependencies = {}) {
  stopSyncNotesPolling();
  _syncNotesPollingId = setInterval(async () => {
    if (!isAuthed()) return;
    try {
      const fresh = await fetchSyncNotes(null, dependencies);
      const prev = _cachedSyncNotes;
      // Сравниваем по JSON — если изменилось, перерендериваем
      if (prev && JSON.stringify(fresh) === JSON.stringify(prev)) return;
      _cachedSyncNotes = fresh;
      // Тихо перезагружаем список без спиннера
      const { loadTasks: loadTasksFn } = dependencies;
      if (loadTasksFn) {
        await loadTasksFn(dependencies, { useCacheOnly: true });
      }
    } catch (e) {
      // Тихо — polling не должен ронять UI
    }
  }, SYNC_NOTES_POLL_INTERVAL);
}

export function stopSyncNotesPolling() {
  if (_syncNotesPollingId) {
    clearInterval(_syncNotesPollingId);
    _syncNotesPollingId = null;
  }
}

function _normalizeCrmTasks(tasks) {
  tasks.forEach((t) => {
    t.group = 'CRM';
    if (!t.createdAt) t.createdAt = new Date().toISOString();
  });
  return tasks;
}

function _normalizeCrmGroupTasks(tasks) {
  tasks.forEach((t) => {
    t.group = CRM_GROUP_NAME;
    if (!t.createdAt) t.createdAt = new Date().toISOString();
  });
  return tasks;
}

export async function loadMergedTasks(dependencies = {}, options = {}) {
  const { fetchTasksFromAPI: fetchTasks, loadDeletedCrmTasks: loadDeleted } = dependencies;
  const useCacheOnly = options.useCacheOnly === true;
  let crm = [];
  if (authEndpoint && isAuthed()) {
    const deletedIds = await (loadDeleted || loadDeletedCrmTasks)();
    if (useCacheOnly) {
      const cached = await loadCrmTasksCache();
      crm = _applyDeletedFilter(cached, deletedIds);
    } else {
      try {
        const fetchDeps = { ...dependencies, crmSyncActivityTypes, crmSyncEventStatuses };
        let myCrm = await (fetchTasks || fetchTasksFromAPI)(syncPeriod, fetchDeps);
        myCrm = _applyDeletedFilter(myCrm, deletedIds);
        myCrm = _normalizeCrmTasks([...myCrm]);
        crm = [...myCrm];
        // Задачи других пользователей (админ): для каждого включённого участника — свой запрос с его настройками
        const otherUsers = crmSyncOtherUsers && typeof crmSyncOtherUsers === 'object' ? crmSyncOtherUsers : {};
        for (const [userId, opts] of Object.entries(otherUsers)) {
          if (!opts || !opts.enabled) continue;
          const period = opts.period || syncPeriod;
          const types = Array.isArray(opts.activityTypes) && opts.activityTypes.length ? opts.activityTypes : CRM_SYNC_ACTIVITY_VALUES;
          const statuses = Array.isArray(opts.eventStatuses) && opts.eventStatuses.length ? opts.eventStatuses : CRM_SYNC_STATUS_VALUES;
          try {
            const otherDeps = { ...dependencies, assigned_user_id: userId, crmSyncActivityTypes: types, crmSyncEventStatuses: statuses };
            const otherList = await (fetchTasks || fetchTasksFromAPI)(period, otherDeps);
            const filtered = _applyDeletedFilter(otherList || [], deletedIds);
            crm = crm.concat(_normalizeCrmGroupTasks([...filtered]));
          } catch (err) {
            // console.warn('API CRM (other user ' + userId + '):', err);
          }
        }
        await saveCrmTasksCache(crm);
      } catch (e) {
        // console.warn('API CRM:', e);
        const cached = await loadCrmTasksCache();
        crm = _applyDeletedFilter(cached, deletedIds);
      }
    }
  }
  const personal = await loadPersonalTasks();
  let notes = [];
  if (isAuthed()) {
    if (useCacheOnly && _cachedSyncNotes) {
      notes = _cachedSyncNotes;
    } else {
      try {
        notes = await fetchSyncNotes(null, dependencies);
        _cachedSyncNotes = notes;
      } catch (e) {
        // console.warn('Sync notes:', e);
        if (_cachedSyncNotes) notes = _cachedSyncNotes;
      }
    }
  }
  const personalWithoutNotes = isAuthed() ? personal.filter((t) => t.group !== 'Заметки') : personal;
  const combined = [...crm, ...personalWithoutNotes, ...notes];
  const seen = new Set();
  let out = [];
  for (const t of combined) {
    const k = String(t.id);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  if (excludeCompleted) {
    out = out.filter((t) => {
      if (t.completed) return false;
      const s = String(t.eventstatus || '').trim();
      return !/^(Held|Выполнено)$/i.test(s);
    });
  }
  if (excludeCancelled) {
    out = out.filter((t) => {
      const s = String(t.eventstatus || '').trim();
      return !/^(Not Held|Отменено)$/i.test(s);
    });
  }
  return out;
}

export async function loadTasks(dependencies = {}, options = {}) {
  const { loadMergedTasks: loadMerged, renderTasks } = dependencies;
  const useCacheOnly = options.useCacheOnly === true;
  let merged = [];
  try {
    hideError();
    if (!useCacheOnly) showLoading();
    merged = await (loadMerged || loadMergedTasks)(dependencies, { useCacheOnly });
    // console.log('loadTasks: загружено задач:', merged.length);
    const wasPlaying = dependencies.isRecordingPlaying && dependencies.isRecordingPlaying();
    const savedRecordingState = wasPlaying && dependencies.getActiveRecordingState ? dependencies.getActiveRecordingState() : null;
    if (renderTasks) {
      // console.log('Вызываем renderTasks из зависимостей');
      renderTasks(merged);
    } else {
      // Если renderTasks не передан, импортируем и вызываем напрямую
      // console.log('Импортируем renderTasks напрямую');
      const { renderTasks: renderTasksFn } = await import('./render.js');
      renderTasksFn(merged);
    }
    if (savedRecordingState && dependencies.restoreRecordingPlayback) {
      dependencies.restoreRecordingPlayback(savedRecordingState);
    }
  } catch (err) {
    // console.error('Ошибка при загрузке задач:', err);
    showError(err.message || 'Ошибка при загрузке задач');
    merged = await (loadMerged || loadMergedTasks)(dependencies, { useCacheOnly });
    const wasPlaying = dependencies.isRecordingPlaying && dependencies.isRecordingPlaying();
    const savedRecordingState = wasPlaying && dependencies.getActiveRecordingState ? dependencies.getActiveRecordingState() : null;
    if (renderTasks) {
      renderTasks(merged);
    } else {
      const { renderTasks: renderTasksFn } = await import('./render.js');
      renderTasksFn(merged);
    }
    if (savedRecordingState && dependencies.restoreRecordingPlayback) {
      dependencies.restoreRecordingPlayback(savedRecordingState);
    }
  } finally {
    hideLoading();
    // Оценка размера CRM задач для кэширования (chrome.storage.local ~10MB)
    const crmTasks = merged.filter((t) => t.group === 'CRM');
    if (crmTasks.length > 0) {
      const { bytes, formatted } = estimateStorageSize(crmTasks);
      // console.log(`[CRM кэш] ${crmTasks.length} задач, ~${formatted} (${bytes} байт)`);
    }
  }
  const crmTasks = merged.filter((t) => t.group === 'CRM');
  const crmEstimate = crmTasks.length > 0 ? estimateStorageSize(crmTasks) : null;
  return {
    crmCount: crmTasks.length,
    crmStorageBytes: crmEstimate?.bytes ?? 0,
    crmStorageFormatted: crmEstimate?.formatted ?? '0 B',
  };
}

export async function createTask(text, group = null, start = null, end = null, desc = null, dependencies = {}) {
  const { apiFetch: apiFetchFn, isAuthed: isAuthedFn, authEndpoint: authEndpointVal } = dependencies;
  // В API создаём только при выборе группы «CRM»; «CRM группа» — только просмотр
  const useApi = (group === 'CRM') && !!authEndpoint && (isAuthedFn || isAuthed)();
  if (group === 'CRM' && !(isAuthedFn || isAuthed)()) {
    throw new Error('Для работы с CRM необходимо авторизоваться в настройках');
  }

  const syncGid = dependencies.syncGroupId || selectedSyncGroupId;
  if (isNotesGroup(group) && syncGid && (authEndpoint && (dependencies.isAuthed || isAuthed)())) {
    const res = await (dependencies.apiFetch || apiFetch)(`${dependencies.authEndpoint || authEndpoint}?action=sync-note-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: syncGid, title: text || '', description: desc || null }),
    }, dependencies);
    if (res.ok) {
      invalidateSyncNotesCache();
      const data = await res.json().catch(() => ({}));
      if (data.id) return data;
    }
  }

  if (!useApi) {
    const isNote = isNotesGroup(group);
    const task = {
      id: Date.now().toString(),
      text,
      completed: false,
      group: group || null,
      start: start ? start.toISOString() : null,
      end: end ? end.toISOString() : null,
      description: desc || null,
      createdAt: new Date().toISOString(),
      ...(isNote && { timerElapsedSeconds: 0, timerRunning: false, timerStartedAt: null }),
    };
    await savePersonalTask(task);
    return task;
  }

  const payload = { text, completed: false, group: group || null };
  if (start) payload.start = start.toISOString();
  if (end) payload.end = end.toISOString();
  if (desc) payload.description = desc;
  if (dependencies.relatedCrmid) payload.related_crmid = dependencies.relatedCrmid;
  if (dependencies.assigned_user_id) payload.assigned_user_id = dependencies.assigned_user_id;
  if (dependencies.eventstatus) payload.eventstatus = dependencies.eventstatus;
  if (dependencies.activitytype) payload.activitytype = dependencies.activitytype;
  if (dependencies.priority_task !== undefined) payload.priority_task = dependencies.priority_task;
  if (dependencies.task_result) payload.task_result = dependencies.task_result;
  const response = await (apiFetchFn || apiFetch)(`${authEndpointVal || authEndpoint}?action=create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, dependencies);

  const responseText = await response.text();
  let errMsg = `Ошибка API: ${response.status}`;
  if (!response.ok) {
    let data = {};
    try {
      data = responseText ? JSON.parse(responseText) : {};
      errMsg = data.error || data.message || data.error_message || errMsg;
      if (data.file) errMsg += ` (${data.file}:${data.line || ''})`;
    } catch (_) {
      if (responseText && responseText.length < 200) errMsg = responseText;
    }
    if (response.status >= 500 && !responseText) {
      errMsg = 'Сервер вернул 500 без описания. Проверьте error_log на сервере (extensionAPI_v1.php, создание задачи).';
    }
    // console.error('[API create]', response.status, data.error || data.message || errMsg, data.file ? `at ${data.file}:${data.line}` : '');
    throw new Error(errMsg);
  }
  const task = responseText ? JSON.parse(responseText) : {};
  if (!task.createdAt) task.createdAt = new Date().toISOString();
  await updateCrmTaskInCache(task);
  return task;
}

function _isDeps(o) {
  return typeof o === 'object' && o !== null && !Array.isArray(o) && 'apiFetch' in o;
}

export async function updateTask(id, text, group = null, start = null, end = null, desc = null, relatedCrmidOrDeps = null, responsibleUserIdOrDeps = null, eventstatusOrDeps = null, activitytypeOrDeps = null, priorityOrDeps = null, taskResultOrDeps = null, dependencies = {}) {
  let relatedCrmid = null;
  let responsibleUserId = null;
  let eventstatus = null;
  let activitytype = null;
  let priority = null;
  let taskResult = null;
  if (_isDeps(relatedCrmidOrDeps)) {
    dependencies = relatedCrmidOrDeps;
  } else {
    relatedCrmid = relatedCrmidOrDeps != null && relatedCrmidOrDeps !== '' ? relatedCrmidOrDeps : null;
    if (_isDeps(responsibleUserIdOrDeps)) {
      dependencies = responsibleUserIdOrDeps;
    } else {
      responsibleUserId = responsibleUserIdOrDeps != null && responsibleUserIdOrDeps !== '' ? responsibleUserIdOrDeps : null;
      if (_isDeps(eventstatusOrDeps)) {
        dependencies = eventstatusOrDeps;
      } else {
        eventstatus = eventstatusOrDeps != null && eventstatusOrDeps !== '' ? eventstatusOrDeps : null;
        if (_isDeps(activitytypeOrDeps)) {
          dependencies = activitytypeOrDeps;
        } else {
          activitytype = activitytypeOrDeps != null && activitytypeOrDeps !== '' ? activitytypeOrDeps : null;
          if (_isDeps(priorityOrDeps)) {
            dependencies = priorityOrDeps;
          } else {
            priority = priorityOrDeps !== undefined ? (priorityOrDeps ? 1 : 0) : null;
            if (_isDeps(taskResultOrDeps)) {
              dependencies = taskResultOrDeps;
            } else {
              taskResult = taskResultOrDeps != null && taskResultOrDeps !== '' ? taskResultOrDeps : null;
            }
          }
        }
      }
    }
  }
  const { apiFetch: apiFetchFn, isAuthed: isAuthedFn, authEndpoint: authEndpointVal } = dependencies;
  const useApi = isCrmGroup(group) && !!authEndpoint && (isAuthedFn || isAuthed)();
  if (isCrmGroup(group) && !(isAuthedFn || isAuthed)()) {
    throw new Error('Для работы с CRM необходимо авторизоваться в настройках');
  }

  if (isNotesGroup(group) && authEndpoint && (dependencies.isAuthed || isAuthed)()) {
    const res = await (dependencies.apiFetch || apiFetch)(`${dependencies.authEndpoint || authEndpoint}?action=sync-note-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note_id: id, title: text || '', description: desc != null ? desc : undefined }),
    }, dependencies);
    if (res.ok) {
      invalidateSyncNotesCache();
      return { id, text, group, start, end, description: desc };
    }
  }

  if (!useApi) {
    const tasks = await loadPersonalTasks();
    const task = tasks.find(t => t.id == id);
    if (!task) throw new Error('Задача не найдена');
    task.text = text;
    task.group = group || null;
    task.start = start ? start.toISOString() : null;
    task.end = end ? end.toISOString() : null;
    task.description = desc || null;
    await savePersonalTasks(tasks);
    return task;
  }

  const payload = { id, text, group: group || null };
  if (start) payload.start = start.toISOString();
  if (end) payload.end = end.toISOString();
  if (desc != null) payload.description = desc;
  if (relatedCrmid != null && relatedCrmid !== '') payload.related_crmid = relatedCrmid;
  if (responsibleUserId != null && responsibleUserId !== '') payload.assigned_user_id = responsibleUserId;
  if (eventstatus != null && eventstatus !== '') payload.eventstatus = eventstatus;
  if (activitytype != null && activitytype !== '') payload.activitytype = activitytype;
  if (priority !== undefined) payload.priority_task = priority;
  if (taskResult !== null) payload.task_result = taskResult;
  const response = await (apiFetchFn || apiFetch)(`${authEndpointVal || authEndpoint}?action=update`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, dependencies);
  if (!response.ok) throw new Error(`Ошибка API: ${response.status}`);
  const task = await response.json();
  // API returns minimal { ok, id } — merge sent payload for accurate cache
  Object.assign(task, payload);
  // Sync completed flag with eventstatus
  if (eventstatus != null && eventstatus !== '') {
    const isNowHeld = /^(Held|Выполнено)$/i.test(eventstatus);
    task.completed = isNowHeld;
  }
  await updateCrmTaskInCache(task);
  return task;
}

export async function deleteTask(id, dependencies = {}) {
  const { loadMergedTasks: loadMerged, markCrmTaskAsDeleted: markDeleted, deletePersonalTask, loadTasks: loadTasksFn, renderTasks } = dependencies;
  if (!confirm('Удалить задачу?')) return;

  try {
    const merged = await (loadMerged || loadMergedTasks)(dependencies);
    const task = merged.find(t => t.id == id);

    if (!task) {
      // console.warn('Задача не найдена для удаления:', id);
      return;
    }

    // console.log('Удаление задачи:', { id, taskId: task.id, group: task.group, isCrm: isCrmGroup(task.group) });

    if (task && isCrmGroup(task.group)) {
      // Для CRM задач помечаем как удаленные локально
      const taskId = task.id.toString().replace(/^crm_/, '');
      // console.log('Помечаем CRM задачу как удаленную:', taskId);
      await (markDeleted || markCrmTaskAsDeleted)(taskId);
      await removeCrmTaskFromCache(taskId);

      // Обновляем список из кэша (без полной перезагрузки с API)
      if (loadTasksFn) {
        await loadTasksFn(dependencies, { useCacheOnly: true });
      } else {
        const updatedMerged = await (loadMerged || loadMergedTasks)(dependencies, { useCacheOnly: true });
        // console.log('Обновлено задач после удаления:', updatedMerged.length);
        if (renderTasks) {
          renderTasks(updatedMerged);
        } else {
          const { renderTasks: renderTasksFn } = await import('./render.js');
          renderTasksFn(updatedMerged);
        }
      }
      return;
    }

    if (task.group === 'Заметки' && authEndpoint) {
      try {
        await (dependencies.apiFetch || apiFetch)(`${dependencies.authEndpoint || authEndpoint}?action=sync-note-delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note_id: String(id) }),
        }, dependencies);
      } catch (e) {
        // console.warn('Sync note delete:', e);
      }
      invalidateSyncNotesCache();
      if (loadTasksFn) await loadTasksFn(dependencies, { useCacheOnly: true });
      else {
        const updatedMerged = await (loadMerged || loadMergedTasks)(dependencies, { useCacheOnly: true });
        if (renderTasks) renderTasks(updatedMerged);
        else {
          const { renderTasks: renderTasksFn } = await import('./render.js');
          renderTasksFn(updatedMerged);
        }
      }
      return;
    }

    // Для личных задач удаляем из storage
    if (deletePersonalTask) {
      await deletePersonalTask(id);
    } else {
      const tasks = await loadPersonalTasks();
      const filtered = tasks.filter(t => t.id !== id);
      await savePersonalTasks(filtered);
    }

    // Обновляем список задач
    // console.log('Обновляем список задач после удаления личной задачи');
    if (loadTasksFn) {
      await loadTasksFn(dependencies);
    } else {
      const updatedMerged = await (loadMerged || loadMergedTasks)(dependencies);
      if (renderTasks) {
        renderTasks(updatedMerged);
      } else {
        const { renderTasks: renderTasksFn } = await import('./render.js');
        renderTasksFn(updatedMerged);
      }
    }
  } catch (err) {
    // console.error('Ошибка при удалении задачи:', err);
    showError(err.message || 'Ошибка при удалении задачи');
  }
}

export async function toggleTaskComplete(id, dependencies = {}) {
  const { loadMergedTasks: loadMerged, apiFetch: apiFetchFn, authEndpoint: authEndpointVal, isAuthed: isAuthedFn, updatePersonalTask: updatePersonal, loadTasks: loadTasksFn } = dependencies;
  try {
    const merged = await (loadMerged || loadMergedTasks)(dependencies);
    const task = merged.find(t => t.id == id);
    if (!task) return;

    task.completed = !task.completed;

    if (isCrmGroup(task.group) && authEndpoint && (isAuthedFn || isAuthed)()) {
      if (task.completed) task.eventstatus = 'Held';
      else if (task.eventstatus === 'Held') task.eventstatus = 'Planned';
      try {
        await (apiFetchFn || apiFetch)(`${authEndpointVal || authEndpoint}?action=toggle`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: task.id, completed: task.completed }),
        }, dependencies);
        await updateCrmTaskInCache(task);
      } catch (err) {
        if (err.message && err.message.includes('Сессия истекла')) { showError(err.message); return; }
        // console.warn('API toggle:', err);
      }
      if (loadTasksFn) await loadTasksFn(dependencies, { useCacheOnly: true });
      return;
    }

    await (updatePersonal || updatePersonalTask)(task);
    if (loadTasksFn) await loadTasksFn(dependencies, { useCacheOnly: true });
  } catch (err) {
    showError(err.message || 'Ошибка при обновлении задачи');
  }
}

export async function completeCrmTaskWithDescription(id, taskResult, dependencies = {}, opts = {}) {
  const { apiFetch: apiFetchFn, authEndpoint: authEndpointVal, loadTasks: loadTasksFn } = dependencies;
  const payload = { id, completed: true, task_result: String(taskResult || '').trim() };
  if (opts.completed_start) payload.completed_start = opts.completed_start;
  if (opts.completed_end) payload.completed_end = opts.completed_end;
  try {
    await (apiFetchFn || apiFetch)(`${authEndpointVal || authEndpoint}?action=toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, dependencies);
    await updateCrmTaskInCache({ id, completed: true, task_result: payload.task_result, eventstatus: 'Held' });
    if (loadTasksFn) await loadTasksFn(dependencies, { useCacheOnly: true });
  } catch (err) {
    if (err.message && err.message.includes('Сессия истекла')) showError(err.message);
    else showError(err.message || 'Ошибка при выполнении задачи');
  }
}

export async function setTaskStatus(id, eventstatus, dependencies = {}) {
  const { apiFetch: apiFetchFn, authEndpoint: authEndpointVal, loadTasks: loadTasksFn, loadMergedTasks: loadMerged, isAuthed: isAuthedFn } = dependencies;
  const merged = await (loadMerged || loadMergedTasks)(dependencies);
  const task = merged.find(t => t.id == id);
  if (!task || !isCrmGroup(task.group) || !authEndpoint || !(isAuthedFn || isAuthed)()) return;
  try {
    await (apiFetchFn || apiFetch)(`${authEndpointVal || authEndpoint}?action=setstatus`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, eventstatus }),
    }, dependencies);
    await updateCrmTaskInCache({ id, eventstatus });
    if (loadTasksFn) await loadTasksFn(dependencies, { useCacheOnly: true });
  } catch (err) {
    if (err.message && err.message.includes('Сессия истекла')) showError(err.message);
    else showError(err.message || 'Ошибка при смене статуса');
    throw err;
  }
}

export async function deletePersonalTask(id) {
  const tasks = await loadPersonalTasks();
  const filtered = tasks.filter(t => t.id !== id);
  await savePersonalTasks(filtered);
}
