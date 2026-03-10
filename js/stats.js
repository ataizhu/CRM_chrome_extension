// stats.js - Статистика

import { escapeHtml } from './utils.js';
import { getTasksByPeriod } from './tasks.js';

function isTaskCompleted(t) {
  if (t.completed) return true;
  const s = String(t.eventstatus || '').trim();
  return /^(Held|Выполнено)$/i.test(s);
}

function isTaskCancelled(t) {
  const s = String(t.eventstatus || '').trim();
  return /^(Not Held|Отменено)$/i.test(s);
}

export function calculateStats(tasks) {
  const total = tasks.length;
  const completed = tasks.filter(isTaskCompleted).length;
  const cancelled = tasks.filter(isTaskCancelled).length;
  const inProgress = total - completed - cancelled;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;

  const byStatus = [
    { name: 'Выполнено', count: completed },
    { name: 'В процессе', count: inProgress },
    { name: 'Отменено', count: cancelled },
  ].filter((s) => s.count > 0);

  return { total, completed, cancelled, inProgress, completionRate, byStatus };
}

export function renderStats(dependencies = {}) {
  const { loadMergedTasks, getTasksByPeriod: getTasks } = dependencies;
  const container = document.getElementById('statsContent');
  const periodEl = document.getElementById('statsPeriod');
  if (!container) return;

  const period = (periodEl && periodEl.value) || 'all';
  (loadMergedTasks || (() => Promise.resolve([])))(dependencies, { useCacheOnly: true }).then((tasks) => {
    const filtered = (getTasks || getTasksByPeriod)(tasks, period);
    const stats = calculateStats(filtered);

    let html = '';
    if (stats.total === 0) {
      html = '<div class="empty-state"><div class="empty-state-icon">📊</div><div>Нет данных за выбранный период</div></div>';
    } else {
      html = '<div class="stat-cards">';
      html += `<div class="stat-card"><div class="stat-card-value">${stats.total}</div><div class="stat-card-label">Всего задач</div></div>`;
      html += `<div class="stat-card"><div class="stat-card-value">${stats.completed}</div><div class="stat-card-label">Выполнено</div></div>`;
      html += `<div class="stat-card"><div class="stat-card-value">${stats.inProgress}</div><div class="stat-card-label">В процессе</div></div>`;
      html += `<div class="stat-card"><div class="stat-card-value">${stats.cancelled}</div><div class="stat-card-label">Отменено</div></div>`;
      html += `<div class="stat-card"><div class="stat-card-value">${stats.completionRate}%</div><div class="stat-card-label">Процент выполнения</div></div>`;
      html += '</div>';

      const statusColors = ['#51cf66', '#4c6ef5', '#868e96'];
      const statusLabels = { 'Выполнено': 0, 'В процессе': 1, 'Отменено': 2 };
      if (stats.byStatus.length > 0) {
        const totalS = stats.byStatus.reduce((s, x) => s + x.count, 0);
        const radius = 64;
        const circumference = 2 * Math.PI * radius;
        let pieSeg = '';
        let acc = 0;
        stats.byStatus.forEach(({ name, count }) => {
          const p = count / totalS;
          const angleDeg = p * 360;
          const startDeg = acc * 360;
          acc += p;
          const dashLen = (angleDeg / 360) * circumference;
          const color = statusColors[statusLabels[name] ?? 0];
          pieSeg += `<circle r="${radius}" cx="120" cy="100" fill="transparent" stroke="${color}" stroke-width="48" stroke-dasharray="${dashLen} ${circumference}" transform="rotate(${-90 + startDeg} 120 100)" />`;
        });
        html += `<div class="stats-chart-block"><div class="stats-chart-title">По статусам</div>`;
        html += `<svg class="stats-pie" viewBox="0 0 240 200" width="240" height="200">${pieSeg}</svg>`;
        html += '<div class="stats-legend">';
        stats.byStatus.forEach(({ name }) => {
          const color = statusColors[statusLabels[name] ?? 0];
          html += `<span class="stats-legend-item"><span class="stats-legend-dot" style="background:${color}"></span>${escapeHtml(name)}</span>`;
        });
        html += '</div></div>';
      }
    }

    container.innerHTML = html;
  });

  if (periodEl && !periodEl.dataset.bound) {
    periodEl.dataset.bound = '1';
    periodEl.addEventListener('change', () => renderStats(dependencies));
  }
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
