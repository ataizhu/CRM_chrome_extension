// render.js - Рендеринг UI задач

import { visibleGroups, groups, setLastRenderedTasks, taskSortOrder, vtigerUsersMap, CRM_GROUP_NAME } from './config.js';
import { tasksContainer, escapeHtml } from './utils.js';

export function formatRemaining(iso) {
  if (!iso) return null;
  const now = new Date();
  const end = new Date(iso);
  const diffMs = end - now;
  if (diffMs < 0) return 'overdue';
  const mins = Math.floor(diffMs / 60000);
  const hrs = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (days > 0) return `${days} дн`;
  if (hrs > 0) return `${hrs} ч`;
  if (mins > 0) return `${mins} мин`;
  return null;
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatTaskTimeShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Формат для value у input[type="datetime-local"]: YYYY-MM-DDTHH:mm (локальное время) */
function formatDateTimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

function eventStatusKind(s) {
  if (!s) return null;
  const t = String(s).trim();
  if (/^(Held|Выполнено)$/i.test(t)) return 'held';
  if (/^(Not Held|Отменено)$/i.test(t)) return 'not_held';
  if (/^В работе$/i.test(t) || /^In\s*progress$/i.test(t)) return 'in_work';
  return null;
}

export function refreshNoteTimerDisplays() {
  document.querySelectorAll('.note-timer-badge[data-running="true"]').forEach((badge) => {
    const valEl = badge.querySelector('.note-timer-value');
    const elapsed = parseInt(badge.dataset.elapsed || '0', 10);
    const started = badge.dataset.started;
    if (!valEl || !started) return;
    const total = elapsed + Math.floor((Date.now() - new Date(started).getTime()) / 1000);
    valEl.textContent = formatDuration(total);
  });
}

export function refreshTaskTimeBadges() {
  const items = document.querySelectorAll('.task-item');
  if (!items.length) return;
  items.forEach((item) => {
    if (item.classList.contains('task-type-simple')) return;
    const statusKind = eventStatusKind(item.dataset.eventstatus || '');
    if (statusKind === 'held' || statusKind === 'not_held') return;
    const end = item.dataset.end || '';
    const completed = item.dataset.completed === '1';
    const badge = item.querySelector('.task-time-badge');
    const valueEl = item.querySelector('.task-time-value');
    const statusIcon = item.querySelector('.task-status-icon');

    if (!end) {
      if (statusIcon) {
        statusIcon.className = 'task-status-icon status-icon-no-deadline';
        statusIcon.setAttribute('data-tooltip', 'Без срока');
        statusIcon.style.display = 'flex';
      }
      if (badge) badge.style.display = 'none';
      return;
    }

    if (completed) {
      if (statusIcon) {
        statusIcon.className = 'task-status-icon status-icon-completed';
        statusIcon.setAttribute('data-tooltip', 'Выполнено');
        statusIcon.style.display = 'flex';
      }
      if (badge) badge.style.display = 'none';
      return;
    }

    const endDate = new Date(end);
    const isOverdue = endDate < new Date();

    if (isOverdue) {
      if (statusIcon) {
        statusIcon.className = 'task-status-icon status-icon-overdue';
        statusIcon.setAttribute('data-tooltip', 'Просрочено');
        statusIcon.style.display = 'flex';
      }
      if (badge) badge.style.display = 'none';
      return;
    }

    const remaining = formatRemaining(end);
    if (remaining && remaining !== 'overdue') {
      if (valueEl) valueEl.textContent = remaining;
      if (badge) badge.style.display = 'flex';
      if (statusIcon) statusIcon.style.display = 'none';
    } else {
      if (badge) badge.style.display = 'none';
      if (statusIcon) statusIcon.style.display = 'none';
    }
  });
}

export function renderTasks(tasks) {
  // console.log('renderTasks вызван с', tasks.length, 'задачами');
  if (tasks.length === 0) {
    setLastRenderedTasks([]);
    tasksContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div>Нет задач</div>
      </div>
    `;
    return;
  }

  const filteredTasks = visibleGroups.length > 0
    ? tasks.filter(t => visibleGroups.includes(t.group))
    : tasks;

  // console.log('Отфильтровано задач по видимым группам:', filteredTasks.length, 'из', tasks.length);

  const grouped = {};
  filteredTasks.forEach((task) => {
    const g = task.group && groups.includes(task.group) ? task.group : null;
    if (!g || !visibleGroups.includes(g)) return;
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(task);
  });

  const taskSortKeyByDate = (t) => {
    const end = t.end ? new Date(t.end).getTime() : null;
    const start = t.start ? new Date(t.start).getTime() : null;
    const created = t.createdAt ? new Date(t.createdAt).getTime() : null;
    return end ?? start ?? created ?? Infinity;
  };
  const taskSortKeyByCreated = (t) => t.createdAt ? new Date(t.createdAt).getTime() : 0;
  const isInWorkTask = (t) => eventStatusKind(t.eventstatus) === 'in_work';
  const isNoteTimerRunning = (t) => t.group === 'Заметки' && !!t.timerRunning;
  const isDesc = taskSortOrder === 'date_desc';
  Object.keys(grouped).forEach((g) => {
    grouped[g].sort((a, b) => {
      const aNoteRunning = isNoteTimerRunning(a);
      const bNoteRunning = isNoteTimerRunning(b);
      if (aNoteRunning && !bNoteRunning) return -1;
      if (!aNoteRunning && bNoteRunning) return 1;
      const aInWork = isInWorkTask(a);
      const bInWork = isInWorkTask(b);
      if (aInWork && !bInWork) return -1;
      if (!aInWork && bInWork) return 1;
      const keyA = isDesc ? taskSortKeyByCreated(a) : taskSortKeyByDate(a);
      const keyB = isDesc ? taskSortKeyByCreated(b) : taskSortKeyByDate(b);
      return isDesc ? keyB - keyA : keyA - keyB;
    });
  });

  const keys = Object.keys(grouped).sort((a, b) => {
    const ia = groups.indexOf(a);
    const ib = groups.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return (a || '').localeCompare(b || '');
  });
  let html = '';
  if (keys.length === 0) {
    html = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div>Нет задач в выбранных группах</div>
      </div>
    `;
  } else {
    keys.forEach((groupName, i) => {
      html += renderTaskGroup(groupName, grouped[groupName], i);
    });
  }

  setLastRenderedTasks(filteredTasks);
  const collapsedGroupIds = new Set();
  tasksContainer.querySelectorAll('.task-group').forEach((tg) => {
    const gid = tg.dataset.groupId;
    const tasksEl = gid ? document.getElementById(gid) : null;
    if (tasksEl && tasksEl.classList.contains('collapsed')) collapsedGroupIds.add(gid);
  });
  tasksContainer.innerHTML = html;
  collapsedGroupIds.forEach((gid) => {
    const tasksEl = document.getElementById(gid);
    const toggle = tasksContainer.querySelector(`[data-group-id="${gid}"] .group-toggle`);
    if (tasksEl) tasksEl.classList.add('collapsed');
    if (toggle) toggle.classList.add('collapsed');
  });
  // console.log('renderTasks завершен, отрендерено групп:', keys.length);

  refreshTaskTimeBadges();
  refreshNoteTimerDisplays();
  tasksContainer.dispatchEvent(new CustomEvent('tasksRendered'));
}

function getGroupChartClass(groupName, index) {
  if (groupName === 'CRM') return 'group-dot-chart-1';
  if (groupName === CRM_GROUP_NAME) return 'group-dot-chart-crm-group';
  if (groupName === 'Личные') return 'group-dot-chart-2';
  if (groupName === 'Заметки') return 'group-dot-chart-notes';
  return ['group-dot-chart-3', 'group-dot-chart-4', 'group-dot-chart-5'][index % 3];
}

function getModuleLabel(setype) {
  if (!setype) return '';
  const labels = { Project: 'Проект', Accounts: 'Контрагент', Contacts: 'Контакт', Leads: 'Лид', HelpDesk: 'Обращение', Potentials: 'Сделка', Campaigns: 'Кампания', Invoice: 'Счёт', Quotes: 'Предложение', SalesOrder: 'Заказ', Assets: 'Актив', ProjectTask: 'Задача проекта', __none__: 'Без привязки' };
  return labels[setype] || setype;
}

const _groupModuleFilterState = new Map();
const _groupUserFilterState = new Map();

export function getGroupModuleFilterState() {
  return _groupModuleFilterState;
}

export function getGroupUserFilterState() {
  return _groupUserFilterState;
}

/** Из recording_url формата "id|https://...|number" или "..|id|url|id|url" извлекает все URL для прослушивания */
export function getRecordingPlayUrls(recordingUrl) {
  if (!recordingUrl || typeof recordingUrl !== 'string') return [];
  const parts = recordingUrl.trim().split('|');
  return parts
    .map((p) => p.trim())
    .filter((p) => p.startsWith('http://') || p.startsWith('https://'));
}

/** Первый URL (для обратной совместимости) */
export function getRecordingPlayUrl(recordingUrl) {
  const urls = getRecordingPlayUrls(recordingUrl);
  return urls.length > 0 ? urls[0] : null;
}

/** Секунды в mm:ss */
export function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds) || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Дата в DD.MM.YYYY HH:mm */
function fmtDT(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()} ${hh}:${mi}`;
}

/** Форматирует timerSegments и общее время для поля "Результат выполненных работ" */
export function formatTimerSegmentsForTaskResult(segments, totalSeconds) {
  const lines = [];
  if (Array.isArray(segments)) {
    for (const seg of segments) {
      if (!seg.start) continue;
      const s = fmtDT(seg.start);
      const e = seg.end ? fmtDT(seg.end) : 'в процессе';
      lines.push(`${s} - ${e}`);
    }
  }
  const total = totalSeconds || 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const timeStr = h > 0 ? `${h}ч ${m}мин` : `${m}мин`;
  if (lines.length > 0) lines.push('', `Общее время: ${timeStr}`);
  else if (total > 0) lines.push(`Общее время: ${timeStr}`);
  return lines.join('\n');
}

export function renderTaskGroup(groupName, tasks, index = 0) {
  const groupId = `group-${groupName}`;
  const displayName = groupName;
  const chartClass = getGroupChartClass(groupName, index);
  const isCrmGroup = groupName === CRM_GROUP_NAME;
  const selectedUserSet = isCrmGroup ? (_groupUserFilterState.get(groupId) || new Set()) : null;
  const uniqueUserKeys = isCrmGroup ? [...new Set(tasks.map(t => String(t.user_id ?? '')).filter(Boolean))] : [];
  // Только ключи, которые реально есть в задачах (устаревший выбор после отключения пользователя в настройках — сбрасываем)
  const effectiveUserSet = isCrmGroup && selectedUserSet
    ? new Set([...selectedUserSet].filter((k) => uniqueUserKeys.includes(k)))
    : null;
  if (isCrmGroup && selectedUserSet && effectiveUserSet && selectedUserSet.size !== effectiveUserSet.size) {
    _groupUserFilterState.set(groupId, effectiveUserSet);
  }
  const filteredByUser = isCrmGroup && effectiveUserSet && effectiveUserSet.size > 0
    ? tasks.filter(t => effectiveUserSet.has(String(t.user_id ?? '')))
    : tasks;

  const uniqueSetypes = [...new Set(filteredByUser.map(t => t.related_setype || '__none__'))].filter(Boolean);
  const selectedSet = _groupModuleFilterState.get(groupId) || new Set();

  let moduleBadgesHtml = '';
  if (isCrmGroup && uniqueUserKeys.length > 0) {
    moduleBadgesHtml = uniqueUserKeys.map(userKey => {
      const label = tasks.find(t => String(t.user_id ?? '') === userKey)?.user_display_name || userKey || '—';
      const isActive = effectiveUserSet ? effectiveUserSet.has(userKey) : false;
      return `<button type="button" class="group-user-badge group-module-badge ${isActive ? 'active' : ''}" data-group-id="${groupId}" data-user-key="${escapeHtml(userKey)}">${escapeHtml(label)}</button>`;
    }).join('');
  } else if (uniqueSetypes.length > 0) {
    moduleBadgesHtml = uniqueSetypes.map(setype => {
      const label = getModuleLabel(setype);
      const isActive = selectedSet.has(setype);
      return `<button type="button" class="group-module-badge ${isActive ? 'active' : ''}" data-group-id="${groupId}" data-setype="${escapeHtml(setype)}">${escapeHtml(label)}</button>`;
    }).join('');
  }

  const filteredTasks = isCrmGroup
    ? filteredByUser
    : (selectedSet.size === 0 ? tasks : tasks.filter(t => selectedSet.has(t.related_setype || '__none__')));

  return `
    <div class="task-group" data-group-id="${groupId}" data-group-name="${escapeHtml(groupName)}" draggable="true">
      <div class="group-header" data-group-id="${groupId}">
        <span class="group-drag-handle" title="Перетащите для изменения порядка">⋮⋮</span>
        <div class="group-title">
          <span class="group-dot ${chartClass}"></span>
          <span>${escapeHtml(displayName)}</span>
          <span class="group-module-badges">${moduleBadgesHtml}</span>
          <span class="group-count">${filteredTasks.length}</span>
        </div>
        <button class="group-toggle" data-group-id="${groupId}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>
      <div class="group-tasks" id="${groupId}">
        ${filteredTasks.map(task => renderTaskItem(task)).join('')}
      </div>
    </div>
  `;
}

const ACTIVITY_TYPE_ICONS = {
  Call: `<svg class="task-activity-icon task-activity-icon-call" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  /** Звонок без записи (recording_url пустой — запись не состоялась) */
  CallNoRecording: `<svg class="task-activity-icon task-activity-icon-call task-activity-icon-call-no-recording" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/><line x1="2" y1="2" x2="22" y2="22" stroke-width="1.5"/></svg>`,
  Meeting: `<svg class="task-activity-icon task-activity-icon-meeting" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>`,
  Chat: `<svg class="task-activity-icon task-activity-icon-chat" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
};

/** Иконка заметки — стикер / документ */
const NOTE_ICON = `<svg class="task-note-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;

export function renderTaskItem(task) {
  const isNote = task.group === 'Заметки';
  const isCrmGroupViewOnly = task.group === CRM_GROUP_NAME;
  const remaining = formatRemaining(task.end);
  const isOverdue = task.end && new Date(task.end) < new Date();
  const isCompleted = task.completed;
  const hasNoDeadline = !task.end;
  const statusKind = eventStatusKind(task.eventstatus);
  const isHeld = statusKind === 'held';
  const isNotHeld = statusKind === 'not_held';
  const isInWork = statusKind === 'in_work';
  const showCheckbox = !isHeld && !isNotHeld && !isNote;
  const useCompletedClass = task.completed && !isHeld && !isNotHeld;
  const isCallMeetingChat = task.activitytype && ACTIVITY_TYPE_ICONS[task.activitytype];
  const recordingPlayUrls = getRecordingPlayUrls(task.recording_url);
  const isCallNoRecording = task.activitytype === 'Call' && recordingPlayUrls.length === 0;

  let statusClass = '';
  let statusTooltip = '';
  if (!isHeld && !isNotHeld) {
    if (isCompleted) {
      statusClass = 'status-icon-completed';
      statusTooltip = 'Выполнено';
    } else if (isOverdue) {
      statusClass = 'status-icon-overdue';
      statusTooltip = 'Просрочено';
    } else if (hasNoDeadline) {
      statusClass = 'status-icon-no-deadline';
      statusTooltip = 'Без срока';
    }
  }

  let timeDisplay = '';
  if (isNote) {
    const elapsed = (task.timerElapsedSeconds || 0) + (task.timerRunning && task.timerStartedAt ? Math.floor((Date.now() - new Date(task.timerStartedAt).getTime()) / 1000) : 0);
    const running = !!task.timerRunning;
    timeDisplay = `<span class="note-timer-badge ${running ? 'note-timer-running' : ''}" data-id="${task.id}" data-elapsed="${task.timerElapsedSeconds || 0}" data-running="${running}" data-started="${task.timerStartedAt || ''}">
      <button type="button" class="note-timer-btn" data-id="${task.id}" title="${running ? 'Пауза' : 'Старт'}" aria-label="${running ? 'Пауза' : 'Старт'}">
        <span class="note-timer-icon note-timer-icon-play"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>
        <span class="note-timer-icon note-timer-icon-pause"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></span>
      </button>
      <span class="note-timer-value">${formatDuration(elapsed)}</span>
    </span>`;
  } else if (!isCallMeetingChat && remaining && remaining !== 'overdue' && !isCompleted && !hasNoDeadline) {
    timeDisplay = `<span class="task-time-badge">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      <span class="task-time-value">${escapeHtml(remaining)}</span>
    </span>`;
  }

  const taskTimeAboveTitle = isCallMeetingChat ? (formatTaskTimeShort(task.start) || formatTaskTimeShort(task.end) || '') : '';

  const statusRowClasses = [
    isHeld ? 'task-status-held' : '',
    isNotHeld ? 'task-status-not-held' : '',
    isInWork ? 'task-status-in-work' : '',
    isCallMeetingChat ? 'task-type-simple' : '',
    isNote ? 'task-type-note' : '',
    isNote && task.timerRunning ? 'note-timer-active' : '',
  ].filter(Boolean).join(' ');

  const isCrmCanWork = showCheckbox && (task.group === 'CRM') && !isCallMeetingChat && !isCrmGroupViewOnly;
  const brainStaticUrl = 'assets/brain-static.jpg';
  const brainAnimatedUrl = 'assets/brain-process.gif';
  let checkboxHtml;
  if (isCrmGroupViewOnly) {
    if (isCallMeetingChat) {
      const iconSvg = isCallNoRecording ? ACTIVITY_TYPE_ICONS.CallNoRecording : ACTIVITY_TYPE_ICONS[task.activitytype];
      const iconLabel = isCallNoRecording ? 'Звонок (запись не состоялась)' : (task.activitytype === 'Call' ? 'Звонок' : task.activitytype === 'Meeting' ? 'Встреча' : 'Чат');
      checkboxHtml = `<span class="task-activity-type-slot" title="${iconLabel}" aria-hidden="true">${iconSvg}</span>`;
    } else if (isHeld) {
      checkboxHtml = `<span class="task-status-slot task-status-check" aria-hidden="true" title="Выполнено">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </span>`;
    } else if (isNotHeld) {
      checkboxHtml = `<span class="task-status-slot task-status-cross" aria-hidden="true" title="Отменено">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </span>`;
    } else if (isInWork) {
      checkboxHtml = `<span class="task-brain-slot task-brain-view-only ${isInWork ? 'in-progress' : ''}" title="В работе" aria-hidden="true">
      <img class="brain-icon brain-icon-static" src="${brainStaticUrl}" alt="" />
      <img class="brain-icon brain-icon-animated" src="${brainAnimatedUrl}" alt="" />
    </span>`;
    } else {
      checkboxHtml = '<span class="task-checkbox-placeholder" aria-hidden="true" title="Только просмотр"></span>';
    }
  } else if (isNote) {
    checkboxHtml = `<span class="task-note-type-slot" title="Заметка" aria-hidden="true">${NOTE_ICON}</span>`;
  } else if (isCallMeetingChat) {
    const iconSvg = isCallNoRecording ? ACTIVITY_TYPE_ICONS.CallNoRecording : ACTIVITY_TYPE_ICONS[task.activitytype];
    const iconLabel = isCallNoRecording ? 'Звонок (запись не состоялась)' : (task.activitytype === 'Call' ? 'Звонок' : task.activitytype === 'Meeting' ? 'Встреча' : 'Чат');
    checkboxHtml = `<span class="task-activity-type-slot" title="${iconLabel}" aria-hidden="true">${iconSvg}</span>`;
  } else if (isCrmCanWork) {
    checkboxHtml = `<button type="button" class="task-brain-btn ${isInWork ? 'in-progress' : ''}" data-id="${task.id}" title="${isInWork ? 'В работе' : 'Начать работу'}" aria-label="${isInWork ? 'В работе' : 'Начать работу'}">
      <img class="brain-icon brain-icon-static" src="${brainStaticUrl}" alt="" />
      <img class="brain-icon brain-icon-animated" src="${brainAnimatedUrl}" alt="" />
    </button>`;
  } else if (showCheckbox) {
    checkboxHtml = `<input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} data-id="${task.id}" />`;
  } else if (isHeld) {
    checkboxHtml = `<span class="task-status-slot task-status-check" aria-hidden="true" title="Выполнено">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </span>`;
  } else if (isNotHeld) {
    checkboxHtml = `<span class="task-status-slot task-status-cross" aria-hidden="true" title="Отменено">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </span>`;
  } else {
    checkboxHtml = '<span class="task-checkbox-placeholder" aria-hidden="true"></span>';
  }

  const isCrm = task.group === 'CRM';
  const hasRelated = task.related_setype || task.related_entity_name;
  const playRecordingBtnHtml = recordingPlayUrls
    .map(
      (url, i) =>
        `<button type="button" class="task-play-recording-btn" data-play-url="${escapeHtml(url)}" data-recording-index="${i}" title="${recordingPlayUrls.length > 1 ? `Прослушать запись ${i + 1}` : 'Прослушать запись'}" aria-label="${recordingPlayUrls.length > 1 ? `Воспроизвести запись ${i + 1}` : 'Воспроизвести запись'}">
        <span class="task-recording-icon task-recording-icon-play" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"/></svg>
        </span>
        <span class="task-recording-icon task-recording-icon-pause" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        </span>
        ${recordingPlayUrls.length > 1 ? `<span class="task-recording-num">${i + 1}</span>` : ''}
      </button>`
    )
    .join('');
  const descriptionBlockHtml = isCrmGroupViewOnly
    ? `<div class="task-detail-description-header"><span class="task-detail-label task-detail-label-center">Описание</span></div><div class="task-detail-description-text">${task.description ? escapeHtml(task.description) : '—'}</div>`
    : `
    <div class="task-detail-description-header">
      <button type="button" class="task-delete-btn task-delete-btn-in-detail" data-id="${task.id}" title="Удалить">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
      <span class="task-detail-label task-detail-label-center">Описание</span>
      <button type="button" class="task-edit-pencil-btn" data-id="${task.id}" title="Редактировать">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
    </div>
    <div class="task-detail-description-text">${task.description ? escapeHtml(task.description) : '—'}</div>
  `;
  const hasTaskResult = task.task_result && String(task.task_result).trim();
  const isHeldWithoutDescription = isCrm && isHeld && !hasTaskResult;
  const showCompleteBlock = !isCrmGroupViewOnly && isCrm && (!isHeld || isHeldWithoutDescription);
  const completeBlockVisibleByDefault = isHeldWithoutDescription;
  const completeBlockInDetail = showCompleteBlock
    ? `<div class="task-complete-description-block task-complete-in-detail" style="display:${completeBlockVisibleByDefault ? 'flex' : 'none'}" data-id="${task.id}">
        <label class="task-detail-label">Результат выполненных работ</label>
        <textarea class="task-complete-description-input" placeholder="Введите результат выполненных работ" rows="2" data-id="${task.id}"></textarea>
        <div class="task-complete-datetime-row">
          <div class="task-complete-datetime-field">
            <label class="task-detail-label">Начало выполнения</label>
            <input type="datetime-local" class="task-complete-start-input" data-id="${task.id}" value="${formatDateTimeLocal(task.start)}" />
          </div>
          <div class="task-complete-datetime-field">
            <label class="task-detail-label">Окончание выполнения</label>
            <input type="datetime-local" class="task-complete-end-input" data-id="${task.id}" value="${formatDateTimeLocal(task.end)}" />
          </div>
        </div>
        <div class="task-complete-required-hint" style="display:none">Заполните результат выполненных работ</div>
      </div>`
    : '';
  const showCompleteButton = !isCrmGroupViewOnly && isCrm && (!isHeld || isHeldWithoutDescription);
  let bottomButtonHtml;
  if (isCrmGroupViewOnly) {
    bottomButtonHtml = '';
  } else if (isNote) {
    const myUserId = window._currentVtigerUserId || '';
    const isAssignedToMe = task.assignedTo && myUserId && String(task.assignedTo) === String(myUserId);
    const isAssigned = !!task.assignedTo;
    let assignBtn;
    if (!isAssigned) {
      assignBtn = `<button type="button" class="note-assign-btn btn-dock btn-dock-secondary btn-dock-sm" data-id="${task.id}" data-action="assign">Взять себе</button>`;
    } else if (isAssignedToMe) {
      assignBtn = `<button type="button" class="note-assign-btn btn-dock btn-dock-secondary btn-dock-sm" data-id="${task.id}" data-action="release">Вернуть в группу</button>`;
    } else {
      // Назначена на другого — кнопку «Вернуть» не показываем
      assignBtn = '';
    }
    const formedBadge = task.taskFormed ? `<button type="button" class="note-formed-badge note-unform-btn" data-id="${task.id}" title="Нажмите, чтобы снять пометку">Сформирована</button>` : '';
    const formBtn = task.taskFormed ? '' : `<button type="button" class="note-to-task-btn btn-dock btn-dock-primary btn-dock-sm" data-id="${task.id}" title="Создать задачу в CRM на основе заметки">Сформировать задачу</button>`;
    const visibleAssignBtn = task.taskFormed ? '' : assignBtn;
    bottomButtonHtml = `<div class="note-bottom-actions">${visibleAssignBtn}${formedBadge}${formBtn}</div>`;
  } else if (showCompleteButton) {
    bottomButtonHtml = `<button type="button" class="task-complete-open-btn btn-dock btn-dock-secondary btn-dock-sm" data-id="${task.id}">${isHeldWithoutDescription ? 'Подтвердить' : 'Завершить'}</button>`;
  } else {
    bottomButtonHtml = !isCrm && !isCrmGroupViewOnly ? `<button type="button" class="task-edit-btn btn-dock btn-dock-secondary btn-dock-sm" data-id="${task.id}">Редактировать</button>` : '';
  }

  const taskRowRelatedHtml = hasRelated
    ? `<div class="task-row-related">${escapeHtml(getModuleLabel(task.related_setype) || task.related_setype || '')}${task.related_entity_name ? ': ' + escapeHtml(task.related_entity_name) : ''}</div>`
    : '';

  const recordingPlayerBlock =
    recordingPlayUrls.length > 0
      ? recordingPlayUrls
          .map(
            (url, i) => `
    <div class="task-detail-recording-block" data-task-id="${escapeHtml(task.id)}" data-recording-index="${i}">
      <span class="task-detail-label">Запись звонка${recordingPlayUrls.length > 1 ? ` ${i + 1}` : ''}</span>
      <audio class="task-detail-audio" data-src="${escapeHtml(url)}" preload="none"></audio>
      <div class="task-detail-recording-controls">
        <button type="button" class="task-detail-play-btn" title="Воспроизвести / пауза" aria-label="Воспроизвести">
          <span class="task-detail-recording-icon task-detail-icon-play"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>
          <span class="task-detail-recording-icon task-detail-icon-pause" style="display:none"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></span>
        </button>
        <button type="button" class="task-detail-stop-btn" title="Стоп" aria-label="Стоп">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>
        </button>
        <span class="task-detail-recording-time">
          <span class="task-detail-current-time">0:00</span>
          <span class="task-detail-time-sep"> / </span>
          <span class="task-detail-duration">—</span>
        </span>
      </div>
      <input type="range" class="task-detail-seek-input" min="0" max="100" value="0" step="0.1" title="Позиция" aria-label="Позиция воспроизведения" />
    </div>`
          )
          .join('')
      : '';

  const statusGroupHtml = isNote
    ? `<div class="task-status-group">${timeDisplay}</div>`
    : isCallMeetingChat
      ? (recordingPlayUrls.length ? `<div class="task-status-group">${playRecordingBtnHtml}</div>` : '')
      : `<div class="task-status-group">
          ${recordingPlayUrls.length ? playRecordingBtnHtml : (statusClass ? `
            <span class="task-status-icon ${statusClass}" data-tooltip="${statusTooltip}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </span>
          ` : '')}
          ${timeDisplay}
        </div>`;

  const hasRowRecording = recordingPlayUrls.length > 0;

  return `
    <div class="task-item ${useCompletedClass ? 'completed' : ''} ${statusRowClasses} ${hasRowRecording ? 'task-has-row-recording' : ''} ${isCrmGroupViewOnly ? 'task-view-only' : ''} ${isNote && task.taskFormed ? 'note-formed' : ''}" data-id="${task.id}" data-group="${escapeHtml(task.group || '')}" data-start="${task.start || ''}" data-end="${task.end || ''}" data-completed="${task.completed ? '1' : '0'}" data-eventstatus="${escapeHtml(task.eventstatus || '')}" data-activitytype="${escapeHtml(task.activitytype || '')}">
      <div class="task-row">
        ${checkboxHtml}
        <div class="task-row-text-wrap">
          ${taskTimeAboveTitle ? `<div class="task-row-time">${escapeHtml(taskTimeAboveTitle)}</div>` : ''}
          ${isNote && task.syncGroupName ? `<div class="task-row-sync-group">${escapeHtml(task.syncGroupName)}</div>` : ''}
          <p class="task-text">${escapeHtml(task.text)}</p>
          ${isNote && task.assignedTo ? `<div class="task-row-assignee"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${escapeHtml(task.assignedToName || vtigerUsersMap[task.assignedTo] || task.assignedTo)}</div>` : ''}
          ${task.group === CRM_GROUP_NAME && task.user_display_name ? `<div class="task-row-crm-owner"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${escapeHtml(task.user_display_name)}</div>` : ''}
          ${taskRowRelatedHtml}
        </div>
        <div class="task-meta">
          ${statusGroupHtml}
        </div>
      </div>
      <div class="task-detail">
        <div class="task-detail-body">
          ${!isNote ? `<div class="task-detail-row"><span class="task-detail-label">Начало</span><span>${formatDateTime(task.start)}</span></div><div class="task-detail-row"><span class="task-detail-label">Окончание</span><span>${formatDateTime(task.end)}</span></div>${recordingPlayerBlock}` : ''}
          <div class="task-detail-description">
            ${descriptionBlockHtml}
          </div>
        </div>
        ${completeBlockInDetail}
        ${(isCrm || isCrmGroupViewOnly) && isHeld && hasTaskResult ? `<div class="task-complete-result-block"><label class="task-detail-label">Результат выполненных работ</label><div class="task-detail-description-text">${escapeHtml(task.task_result)}</div></div>` : ''}
        ${bottomButtonHtml}
      </div>
    </div>
  `;
}

export function toggleGroup(groupId) {
  const groupTasks = document.getElementById(groupId);
  const toggle = document.querySelector(`[data-group-id="${groupId}"] .group-toggle`);

  if (groupTasks) {
    groupTasks.classList.toggle('collapsed');
    toggle.classList.toggle('collapsed');
  }
}
