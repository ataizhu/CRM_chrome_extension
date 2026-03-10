const STATS_COLORS = ['#4c6ef5', '#00bfff', '#51cf66', '#ffd43b', '#ff6b6b', '#9775fa', '#ff8787', '#69db7c'];

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function getTasksByPeriod(tasks, period) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return tasks.filter((t) => {
    const created = t.createdAt ? new Date(t.createdAt).getTime() : 0;
    if (!created && period !== 'all') return false;
    if (period === 'all') return true;
    if (period === 'today') return created >= today;
    if (period === 'week') return created >= today - 7 * 24 * 60 * 60 * 1000;
    if (period === 'month') return created >= today - 30 * 24 * 60 * 60 * 1000;
    return true;
  });
}

function calculateStats(tasks) {
  const completed = tasks.filter((t) => t.completed).length;
  const total = tasks.length;
  const incomplete = total - completed;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;
  const byGroup = {};
  tasks.forEach((t) => {
    const g = t.group || 'Без группы';
    byGroup[g] = (byGroup[g] || 0) + 1;
  });
  const byDay = {};
  tasks.forEach((t) => {
    const d = t.createdAt ? new Date(t.createdAt).toISOString().slice(0, 10) : '1970-01-01';
    byDay[d] = (byDay[d] || 0) + 1;
  });
  const sortedDays = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  return { total, completed, incomplete, completionRate, byGroup, byDay: sortedDays };
}

async function render() {
  const container = document.getElementById('statsContent');
  const periodEl = document.getElementById('statsPeriod');
  const period = (periodEl && periodEl.value) || 'all';
  const { tasks = [] } = await chrome.storage.sync.get(['tasks']);
  const filtered = getTasksByPeriod(tasks, period);
  const stats = calculateStats(filtered);

  let html = '<div class="stat-cards">';
  html += `<div class="stat-card"><div class="stat-card-value">${stats.total}</div><div class="stat-card-label">Всего задач</div></div>`;
  html += `<div class="stat-card"><div class="stat-card-value">${stats.completed}</div><div class="stat-card-label">Выполнено</div></div>`;
  html += `<div class="stat-card"><div class="stat-card-value">${stats.incomplete}</div><div class="stat-card-label">В процессе</div></div>`;
  html += `<div class="stat-card"><div class="stat-card-value">${stats.completionRate}%</div><div class="stat-card-label">Выполнено</div></div>`;
  html += '</div>';

  const groups = Object.entries(stats.byGroup);
  if (groups.length > 0) {
    const totalG = groups.reduce((s, [, c]) => s + c, 0);
    const radius = 64;
    const circumference = 2 * Math.PI * radius;
    let pieSeg = '';
    let acc = 0;
    groups.forEach(([, count], i) => {
      const p = count / totalG;
      const angleDeg = p * 360;
      const startDeg = acc * 360;
      acc += p;
      const dashLen = (angleDeg / 360) * circumference;
      pieSeg += `<circle r="${radius}" cx="120" cy="100" fill="transparent" stroke="${STATS_COLORS[i % STATS_COLORS.length]}" stroke-width="48" stroke-dasharray="${dashLen} ${circumference}" transform="rotate(${-90 + startDeg} 120 100)" />`;
    });
    html += `<div class="stats-chart-block"><div class="stats-chart-title">По группам</div>`;
    html += `<svg class="stats-pie" viewBox="0 0 240 200" width="240" height="200">${pieSeg}</svg>`;
    html += '<div class="stats-legend">';
    groups.forEach(([name], i) => {
      html += `<span class="stats-legend-item"><span class="stats-legend-dot" style="background:${STATS_COLORS[i % STATS_COLORS.length]}"></span>${escapeHtml(name)}</span>`;
    });
    html += '</div></div>';
  }

  if (stats.byDay.length > 0) {
    const maxVal = Math.max(1, ...stats.byDay.map(([, c]) => c));
    html += '<div class="stats-chart-block"><div class="stats-chart-title">Активность по дням</div><div class="stats-bars">';
    stats.byDay.forEach(([day, count]) => {
      const h = Math.max(4, (count / maxVal) * 100);
      html += `<div class="stats-bar-wrap"><div class="stats-bar" style="height:${h}%"></div><div class="stats-bar-label">${day.slice(5)}</div></div>`;
    });
    html += '</div></div>';
  }

  if (stats.total === 0) {
    html = '<div class="empty-state"><div class="empty-state-icon">📊</div><div>Нет данных за выбранный период</div></div>';
  }

  container.innerHTML = html;
}

(async () => {
  const { theme } = await chrome.storage.sync.get(['theme']);
  if (theme === 'dark') document.body.classList.add('dark-theme');
  const periodEl = document.getElementById('statsPeriod');
  periodEl.addEventListener('change', render);
  await render();
})();
