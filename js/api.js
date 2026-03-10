// api.js - API запросы

import { authEndpoint, authToken, vtigerCredentials, setAuthToken, setUser, setVtigerCredentials } from './config.js';
import { clearAuth } from './auth.js';

export async function apiFetch(url, init = {}, dependencies = {}) {
  const { updateSettingsUI } = dependencies;
  const headers = {};
  const h = init.headers;
  if (h) {
    if (h instanceof Headers) {
      h.forEach((v, k) => { headers[k] = v; });
    } else {
      Object.assign(headers, h);
    }
  }
  if (vtigerCredentials) {
    const password = vtigerCredentials.password || vtigerCredentials.accessKey || '';
    const b64 = btoa(unescape(encodeURIComponent(`${vtigerCredentials.username}:${password}`)));
    headers['Authorization'] = `Basic ${b64}`;
  } else if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  if (init.body && typeof init.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, { ...init, headers });
  const responseText = await res.clone().text().catch(() => '');
  let responseData = {};
  try {
    responseData = JSON.parse(responseText);
    if (responseData._debug && Array.isArray(responseData._debug) && !url.includes('action=tasks')) {
      // console.group('🔍 API Debug Logs');
      // responseData._debug.forEach(log => console.log(log));
      // console.groupEnd();
    }
  } catch (e) {
    // Не JSON ответ
  }
  if (!url.includes('action=tasks')) {
    // console.log('API response:', { url, method: init.method || 'GET', status: res.status, statusText: res.statusText, body: responseText.substring(0, 200) });
  }
  if (res.status === 401) {
    await clearAuth();
    setAuthToken(null);
    setUser(null);
    setVtigerCredentials(null);
    if (updateSettingsUI) await updateSettingsUI();
    throw new Error('Сессия истекла. Войдите снова.');
  }
  return res;
}

export async function fetchTasksFromAPI(period = 'all', dependencies = {}) {
  const { apiFetch: apiFetchFn, crmSyncActivityTypes = [], crmSyncEventStatuses = [], assigned_user_id: assignedUserId } = dependencies;
  if (!authEndpoint) throw new Error('Endpoint не настроен');

  let url = `${authEndpoint}?action=tasks&debug=1`;
  if (period && period !== 'all') {
    url += `&period=${encodeURIComponent(period)}`;
  }
  if (assignedUserId != null && assignedUserId !== '') {
    url += '&assigned_user_id=' + encodeURIComponent(String(assignedUserId));
  }
  if (Array.isArray(crmSyncActivityTypes) && crmSyncActivityTypes.length) {
    url += '&activitytypes=' + crmSyncActivityTypes.map(encodeURIComponent).join(',');
  }
  if (Array.isArray(crmSyncEventStatuses) && crmSyncEventStatuses.length) {
    url += '&eventstatuses=' + crmSyncEventStatuses.map(encodeURIComponent).join(',');
  }
  const response = await (apiFetchFn || apiFetch)(url, {}, dependencies);
  
  let data = {};
  let responseText = '';
  try {
    responseText = await response.text();
    if (responseText) {
      data = JSON.parse(responseText);
    }
  } catch (e) {
    // console.error('Failed to parse response:', e);
    // console.error('Response status:', response.status);
    // console.error('Response text:', responseText);
    if (!response.ok) {
      throw new Error(`Ошибка API: ${response.status}. Ответ сервера: ${responseText.substring(0, 200)}`);
    }
    throw new Error(`Ошибка парсинга ответа: ${response.status}`);
  }
  
  if (data._debug && Array.isArray(data._debug)) {
    // console.group('🔍 Tasks Debug Logs');
    // data._debug.forEach(log => console.log(log));
    // console.groupEnd();
  }
  
  if (!response.ok) {
    // console.error('API Error Response:', data);
    throw new Error(data.message || data.error || `Ошибка API: ${response.status}`);
  }
  
  const list = Array.isArray(data) ? data : (data.tasks || data.items || []);
  list.forEach((t) => { if (!t.createdAt) t.createdAt = new Date().toISOString(); });
  
  // getTasksByPeriod будет импортирован из tasks.js
  return list;
}

// Загрузка списка статусов
export async function fetchEventStatuses(dependencies = {}) {
  const { apiFetch: apiFetchFn } = dependencies;
  if (!authEndpoint) throw new Error('Endpoint не настроен');
  
  const url = `${authEndpoint}?action=eventstatuses`;
  const response = await (apiFetchFn || apiFetch)(url, {}, dependencies);
  
  if (!response.ok) {
    throw new Error(`Ошибка загрузки статусов: ${response.status}`);
  }
  
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

// Загрузка списка типов действий
export async function fetchActivityTypes(dependencies = {}) {
  const { apiFetch: apiFetchFn } = dependencies;
  if (!authEndpoint) throw new Error('Endpoint не настроен');

  const url = `${authEndpoint}?action=activitytypes`;
  const response = await (apiFetchFn || apiFetch)(url, {}, dependencies);

  if (!response.ok) {
    throw new Error(`Ошибка загрузки типов действий: ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

// Fallback при 400/сетевой ошибке (совпадает с API RELATED_MODULE_MAP)
export const FALLBACK_RELATED_MODULES = [
  { setype: 'Project', label: 'Проект' },
  { setype: 'Accounts', label: 'Контрагенты' },
  { setype: 'Contacts', label: 'Контакты' },
  { setype: 'Leads', label: 'Лиды' },
  { setype: 'HelpDesk', label: 'Обращения' },
  { setype: 'Potentials', label: 'Сделка' },
  { setype: 'Campaigns', label: 'Кампании' },
  { setype: 'Invoice', label: 'Счёт' },
  { setype: 'Quotes', label: 'Предложение' },
  { setype: 'SalesOrder', label: 'Заказ' },
  { setype: 'Assets', label: 'Актив' },
  { setype: 'ProjectTask', label: 'Проектные задачи' },
];

export async function fetchRelatedModules(dependencies = {}) {
  const { apiFetch: apiFetchFn } = dependencies;
  if (!authEndpoint) throw new Error('Endpoint не настроен');
  const url = `${authEndpoint}?action=related_modules`;
  try {
    const response = await (apiFetchFn || apiFetch)(url, {}, dependencies);
    if (!response.ok) throw new Error(`Ошибка загрузки модулей: ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data : FALLBACK_RELATED_MODULES;
  } catch (e) {
    return FALLBACK_RELATED_MODULES;
  }
}

// Загрузка списка активных пользователей
export async function fetchUsers(dependencies = {}) {
  const { apiFetch: apiFetchFn } = dependencies;
  if (!authEndpoint) throw new Error('Endpoint не настроен');
  const url = `${authEndpoint}?action=users`;
  const response = await (apiFetchFn || apiFetch)(url, {}, dependencies);
  if (!response.ok) throw new Error(`Ошибка загрузки пользователей: ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

// Заметки группы синхронизации (Supabase). groupId=null — все заметки из всех групп пользователя.
export async function fetchSyncNotes(groupId, dependencies = {}) {
  const { apiFetch: apiFetchFn } = dependencies;
  if (!authEndpoint) return [];
  const body = groupId ? { group_id: groupId } : {};
  const response = await (apiFetchFn || apiFetch)(
    `${authEndpoint}?action=sync-notes-list`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    dependencies
  );
  if (!response.ok) return [];
  const data = await response.json().catch(() => ({}));
  return Array.isArray(data.notes) ? data.notes : [];
}

// Поиск записей в модуле для привязки
export async function searchRelated(module, q, dependencies = {}) {
  const { apiFetch: apiFetchFn } = dependencies;
  if (!authEndpoint) throw new Error('Endpoint не настроен');
  const params = new URLSearchParams({ action: 'search_related', module, q: q || '' });
  const url = `${authEndpoint}?${params}`;
  const response = await (apiFetchFn || apiFetch)(url, {}, dependencies);
  if (!response.ok) throw new Error(`Ошибка поиска: ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}
