// utils.js - Утилиты и вспомогательные функции

// Кэш для элементов DOM
const _formElCache = {};
export function _formEl(id) {
  if (_formElCache[id] === undefined) _formElCache[id] = document.getElementById(id);
  return _formElCache[id];
}

// Элементы DOM
export const tasksContainer = document.getElementById('tasksContainer');
export const loading = document.getElementById('loading');
export const error = document.getElementById('error');
export const loginModal = document.getElementById('loginModal');
export const loginForm = document.getElementById('loginForm');
export const loginError = document.getElementById('loginError');

// Escape HTML
let _escapeDiv = null;
export function escapeHtml(text) {
  if (!_escapeDiv) _escapeDiv = document.createElement('div');
  _escapeDiv.textContent = text;
  return _escapeDiv.innerHTML;
}

// Показать/скрыть загрузку
export function showLoading() {
  if (loading) loading.style.display = 'flex';
}

export function hideLoading() {
  if (loading) loading.style.display = 'none';
}

// Показать/скрыть ошибку
export function showError(message) {
  if (error) {
    error.textContent = message;
    error.style.display = 'block';
  }
}

export function hideError() {
  if (error) error.style.display = 'none';
}

/**
 * Open a centered picker modal.
 * @param {Object} opts
 * @param {string} opts.title - Header title
 * @param {Array<{value:string, label:string}>} opts.options - List of options
 * @param {string} [opts.selectedValue] - Currently selected value
 * @param {boolean} [opts.showSearch] - Show search field
 * @param {boolean} [opts.fullscreen] - Use fullscreen variant
 * @param {Element} [opts.parent] - Parent to append to (default: document.body)
 * @returns {Promise<{value:string, label:string}|null>} Selected option or null
 */
export function openPickerModal(opts) {
  return new Promise((resolve) => {
    const { title, options, selectedValue, showSearch, fullscreen, parent } = opts;

    const backdrop = document.createElement('div');
    backdrop.className = 'picker-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'picker-modal' + (fullscreen ? ' picker-modal-fullscreen' : '');

    // Header
    const header = document.createElement('div');
    header.className = 'picker-modal-header';
    header.innerHTML = `<span class="picker-modal-title">${escapeHtml(title)}</span><button type="button" class="picker-modal-close">✕</button>`;
    modal.appendChild(header);

    // Search
    let searchInput = null;
    if (showSearch) {
      const searchWrap = document.createElement('div');
      searchWrap.className = 'picker-modal-search';
      searchWrap.innerHTML = `<input type="text" placeholder="Поиск..." /><svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
      modal.appendChild(searchWrap);
      searchInput = searchWrap.querySelector('input');
    }

    // List
    const list = document.createElement('div');
    list.className = 'picker-modal-list';
    options.forEach((opt) => {
      const el = document.createElement('div');
      el.className = 'picker-modal-option' + (opt.value === selectedValue ? ' selected' : '') + (opt.disabled ? ' disabled' : '');
      el.textContent = opt.label;
      el.dataset.value = opt.value;
      list.appendChild(el);
    });
    modal.appendChild(list);
    backdrop.appendChild(modal);
    (parent || document.body).appendChild(backdrop);

    if (showSearch && searchInput) {
      searchInput.focus();
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase();
        list.querySelectorAll('.picker-modal-option').forEach((el) => {
          el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      });
    }

    const close = (result) => {
      backdrop.remove();
      resolve(result);
    };

    header.querySelector('.picker-modal-close').addEventListener('click', () => close(null));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null); });
    list.addEventListener('click', (e) => {
      const opt = e.target.closest('.picker-modal-option');
      if (!opt || opt.classList.contains('disabled')) return;
      close({ value: opt.dataset.value, label: opt.textContent });
    });
  });
}

/**
 * Period picker modal with "exact start" checkboxes.
 * @param {Object} opts
 * @param {string} opts.selectedValue - Current period value
 * @param {Object} opts.exactStart - { week: true, month: false, ... }
 * @param {Element} [opts.parent]
 * @returns {Promise<{value:string, label:string, exactStart:Object}|null>}
 */
export function openPeriodPickerModal(opts) {
  return new Promise((resolve) => {
    const { selectedValue, exactStart = {}, parent } = opts;

    const periods = [
      { value: 'today', label: 'Сегодня' },
      { value: 'week', label: 'Неделя', exactLabel: 'с понедельника' },
      { value: 'month', label: 'Месяц', exactLabel: 'с 1-го числа' },
      { value: '3months', label: '3 месяца', exactLabel: 'с 1-го числа' },
      { value: '6months', label: '6 месяцев', exactLabel: 'с 1-го числа' },
      { value: 'year', label: 'Год', exactLabel: 'с 1 января' },
    ];

    // Только один ключ может быть true — находим его
    const newExactStart = {};
    const activeExact = Object.keys(exactStart).find((k) => exactStart[k]);
    if (activeExact) newExactStart[activeExact] = true;

    const backdrop = document.createElement('div');
    backdrop.className = 'picker-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'picker-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'picker-modal-header';
    header.innerHTML = `<span class="picker-modal-title">Период</span><button type="button" class="picker-modal-close">✕</button>`;
    modal.appendChild(header);

    // List
    const list = document.createElement('div');
    list.className = 'picker-modal-list';

    // Собираем все чекбоксы для radio-поведения
    const allCheckboxes = [];

    periods.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'picker-modal-option period-picker-option' + (p.value === selectedValue ? ' selected' : '');
      row.dataset.value = p.value;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'period-picker-label';
      labelSpan.textContent = p.label;
      row.appendChild(labelSpan);

      if (p.exactLabel) {
        const checkWrap = document.createElement('label');
        checkWrap.className = 'period-picker-exact';
        checkWrap.addEventListener('click', (e) => e.stopPropagation());

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'period-picker-exact-cb';
        cb.checked = !!newExactStart[p.value];
        cb.dataset.period = p.value;
        allCheckboxes.push(cb);

        cb.addEventListener('change', () => {
          if (cb.checked) {
            // Radio-поведение: снимаем все остальные
            allCheckboxes.forEach((other) => {
              if (other !== cb) other.checked = false;
            });
            // Сбрасываем все ключи, ставим только текущий
            Object.keys(newExactStart).forEach((k) => delete newExactStart[k]);
            newExactStart[p.value] = true;
          } else {
            delete newExactStart[p.value];
          }
          // Клик по галочке — сразу выбираем этот период и закрываем
          close({ value: p.value, label: p.label, exactStart: { ...newExactStart } });
        });

        const cbLabel = document.createElement('span');
        cbLabel.className = 'period-picker-exact-label';
        cbLabel.textContent = p.exactLabel;

        checkWrap.appendChild(cb);
        checkWrap.appendChild(cbLabel);
        row.appendChild(checkWrap);
      }

      list.appendChild(row);
    });

    modal.appendChild(list);
    backdrop.appendChild(modal);
    (parent || document.body).appendChild(backdrop);

    const close = (result) => {
      backdrop.remove();
      resolve(result);
    };

    header.querySelector('.picker-modal-close').addEventListener('click', () => close(null));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null); });
    list.addEventListener('click', (e) => {
      const opt = e.target.closest('.period-picker-option');
      if (!opt) return;
      if (e.target.closest('.period-picker-exact')) return;
      const label = opt.querySelector('.period-picker-label').textContent;
      // Клик по названию — выбираем период без exactStart (сбрасываем галочку)
      close({ value: opt.dataset.value, label, exactStart: {} });
    });
  });
}
