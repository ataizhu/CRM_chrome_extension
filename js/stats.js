// stats.js - Статистика (только CRM задачи)

import { escapeHtml } from './utils.js';

/* ─── helpers ─── */

function isTaskCompleted(t) {
  if (t.completed) return true;
  const s = String(t.eventstatus || '').trim();
  return /^(Held|Выполнено)$/i.test(s);
}

function isTaskCancelled(t) {
  const s = String(t.eventstatus || '').trim();
  return /^(Not Held|Отменено)$/i.test(s);
}

function isOverdue(t) {
  if (isTaskCompleted(t) || isTaskCancelled(t)) return false;
  const end = t.end ? new Date(t.end).getTime() : 0;
  return end > 0 && end < Date.now();
}

const MODULE_LABELS = {
  Project: 'Проект', Accounts: 'Контрагент', Contacts: 'Контакт',
  Leads: 'Лид', HelpDesk: 'Обращение', Potentials: 'Сделка',
  Campaigns: 'Кампания', Invoice: 'Счёт', Quotes: 'Предложение',
  SalesOrder: 'Заказ', Assets: 'Актив', ProjectTask: 'Задача проекта',
};

const ACTIVITY_LABELS = {
  Call: 'Звонок', Meeting: 'Встреча', Chat: 'Чат',
  'Выполнить': 'Выполнить', 'Письмо': 'Письмо',
};

/* ─── расчёт ─── */

export function calculateStats(tasks) {
  const total = tasks.length;
  const completed = tasks.filter(isTaskCompleted).length;
  const cancelled = tasks.filter(isTaskCancelled).length;
  const inProgress = total - completed - cancelled;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;
  const overdue = tasks.filter(isOverdue).length;
  const priority = tasks.filter((t) => t.priority).length;

  // По статусам
  const byStatus = [
    { name: 'Выполнено', count: completed, color: '#51cf66' },
    { name: 'В процессе', count: inProgress, color: '#4c6ef5' },
    { name: 'Отменено', count: cancelled, color: '#868e96' },
  ].filter((s) => s.count > 0);

  // По типу действия
  const activityMap = {};
  tasks.forEach((t) => {
    const key = t.activitytype || 'Другое';
    activityMap[key] = (activityMap[key] || 0) + 1;
  });
  const byActivity = Object.entries(activityMap)
    .map(([key, count]) => ({ name: ACTIVITY_LABELS[key] || key, count }))
    .sort((a, b) => b.count - a.count);

  // По связанному модулю
  const moduleMap = {};
  tasks.forEach((t) => {
    const key = t.related_setype || '__none__';
    moduleMap[key] = (moduleMap[key] || 0) + 1;
  });
  const byModule = Object.entries(moduleMap)
    .map(([key, count]) => ({ name: MODULE_LABELS[key] || (key === '__none__' ? 'Без привязки' : key), count }))
    .sort((a, b) => b.count - a.count);

  return { total, completed, cancelled, inProgress, completionRate, overdue, priority, byStatus, byActivity, byModule };
}

/* ─── SVG: donut chart ─── */

function renderDonut(segments, size = 160) {
  const cx = size / 2, cy = size / 2;
  const radius = size / 2 - 20;
  const strokeW = 24;
  const circumference = 2 * Math.PI * radius;
  let acc = 0;
  const totalCount = segments.reduce((s, x) => s + x.count, 0);

  let paths = '';
  segments.forEach(({ count, color }) => {
    const p = count / totalCount;
    const dashLen = p * circumference;
    const gap = circumference - dashLen;
    const offset = -circumference * acc + circumference * 0.25; // start from top
    acc += p;
    paths += `<circle r="${radius}" cx="${cx}" cy="${cy}" fill="none" stroke="${color}" stroke-width="${strokeW}" stroke-dasharray="${dashLen} ${gap}" stroke-dashoffset="${offset}" stroke-linecap="round" class="stats-donut-seg"/>`;
  });

  return `<svg class="stats-donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <circle r="${radius}" cx="${cx}" cy="${cy}" fill="none" stroke="var(--border)" stroke-width="${strokeW}" opacity="0.3"/>
    ${paths}
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" class="stats-donut-value">${totalCount}</text>
    <text x="${cx}" y="${cy + 12}" text-anchor="middle" class="stats-donut-label">задач</text>
  </svg>`;
}

/* ─── SVG: horizontal bar chart ─── */

function renderHBars(items, colorFn) {
  if (!items.length) return '';
  const max = Math.max(...items.map((i) => i.count));
  return items
    .map((item, idx) => {
      const pct = max ? Math.round((item.count / max) * 100) : 0;
      const color = colorFn(idx);
      return `<div class="stats-hbar-row">
        <span class="stats-hbar-name">${escapeHtml(item.name)}</span>
        <div class="stats-hbar-track"><div class="stats-hbar-fill" style="width:${pct}%;background:${color}"></div></div>
        <span class="stats-hbar-count">${item.count}</span>
      </div>`;
    })
    .join('');
}

/* ─── render ─── */

export function renderStats(dependencies = {}) {
  const { loadMergedTasks } = dependencies;
  const container = document.getElementById('statsContent');
  if (!container) return;

  (loadMergedTasks || (() => Promise.resolve([])))(dependencies, { useCacheOnly: true }).then((tasks) => {
    // Только CRM задачи
    const crmTasks = tasks.filter((t) => t.group === 'CRM');
    const stats = calculateStats(crmTasks);

    if (stats.total === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><div>Нет данных CRM для отображения</div></div>';
      return;
    }

    const activityColors = ['#4c6ef5', '#7950f2', '#e64980', '#f76707', '#20c997', '#868e96'];
    const moduleColors = ['#339af0', '#51cf66', '#fcc419', '#ff6b6b', '#845ef7', '#20c997', '#868e96'];

    let html = '';

    // ── Summary cards ──
    html += '<div class="stats-cards-grid">';
    html += _card(stats.total, 'Всего', 'var(--foreground)', '#4c6ef5');
    html += _card(stats.completed, 'Выполнено', '#51cf66', '#51cf66');
    html += _card(stats.inProgress, 'В процессе', '#4c6ef5', '#4c6ef5');
    html += _card(stats.cancelled, 'Отменено', '#868e96', '#868e96');
    html += '</div>';

    // ── Rate + overdue + priority row ──
    html += '<div class="stats-highlight-row">';
    html += `<div class="stats-highlight-card">
      <div class="stats-ring-wrap">${_miniRing(stats.completionRate, '#51cf66')}</div>
      <div class="stats-highlight-text"><div class="stats-highlight-value">${stats.completionRate}%</div><div class="stats-highlight-label">Выполнение</div></div>
    </div>`;
    if (stats.overdue > 0) {
      html += `<div class="stats-highlight-card stats-highlight-warn">
        <div class="stats-highlight-icon">⏰</div>
        <div class="stats-highlight-text"><div class="stats-highlight-value">${stats.overdue}</div><div class="stats-highlight-label">Просрочено</div></div>
      </div>`;
    }
    if (stats.priority > 0) {
      html += `<div class="stats-highlight-card stats-highlight-accent">
        <div class="stats-highlight-icon">⚡</div>
        <div class="stats-highlight-text"><div class="stats-highlight-value">${stats.priority}</div><div class="stats-highlight-label">Приоритетных</div></div>
      </div>`;
    }
    html += '</div>';

    // ── Donut: by status ──
    if (stats.byStatus.length > 0) {
      html += '<div class="stats-chart-block">';
      html += '<div class="stats-chart-title">По статусам</div>';
      html += '<div class="stats-donut-wrap">';
      html += renderDonut(stats.byStatus);
      html += '<div class="stats-legend">';
      stats.byStatus.forEach(({ name, count, color }) => {
        html += `<span class="stats-legend-item"><span class="stats-legend-dot" style="background:${color}"></span>${escapeHtml(name)} <b>${count}</b></span>`;
      });
      html += '</div></div></div>';
    }

    // ── Bars: by activity type ──
    if (stats.byActivity.length > 0) {
      html += '<div class="stats-chart-block">';
      html += '<div class="stats-chart-title">По типу действия</div>';
      html += renderHBars(stats.byActivity, (i) => activityColors[i % activityColors.length]);
      html += '</div>';
    }

    // ── Bars: by related module ──
    if (stats.byModule.length > 0 && !(stats.byModule.length === 1 && stats.byModule[0].name === 'Без привязки')) {
      html += '<div class="stats-chart-block">';
      html += '<div class="stats-chart-title">По связанным модулям</div>';
      html += renderHBars(stats.byModule, (i) => moduleColors[i % moduleColors.length]);
      html += '</div>';
    }

    container.innerHTML = html;
  });
}

function _card(value, label, valueColor, accentColor) {
  return `<div class="stats-card" style="--card-accent:${accentColor}">
    <div class="stats-card-value" style="color:${valueColor}">${value}</div>
    <div class="stats-card-label">${label}</div>
  </div>`;
}

function _miniRing(pct, color) {
  const r = 20, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return `<svg viewBox="0 0 48 48" width="48" height="48">
    <circle r="${r}" cx="24" cy="24" fill="none" stroke="var(--border)" stroke-width="5" opacity="0.3"/>
    <circle r="${r}" cx="24" cy="24" fill="none" stroke="${color}" stroke-width="5" stroke-dasharray="${dash} ${circ}" stroke-dashoffset="${circ * 0.25}" stroke-linecap="round" class="stats-donut-seg"/>
  </svg>`;
}

export function switchTab(tabId, dependencies = {}) {
  const { renderStats, updateSettingsUI } = dependencies;
  document.querySelectorAll('.tab-pane').forEach((p) => {
    const id = p.id;
    p.classList.toggle('active', (tabId === 'tasks' && id === 'tabTasks') || (tabId === 'settings' && id === 'tabSettings') || (tabId === 'stats' && id === 'tabStats'));
  });
  const settingsBtn = document.getElementById('settingsBtn');
  const statsBtn = document.getElementById('statsBtn');
  if (settingsBtn) settingsBtn.classList.toggle('active', tabId === 'settings');
  if (statsBtn) statsBtn.classList.toggle('active', tabId === 'stats');
  if (tabId === 'stats' && renderStats) renderStats(dependencies);
  if (tabId === 'settings' && updateSettingsUI) updateSettingsUI();
}
