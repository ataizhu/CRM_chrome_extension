// modals.js - Модальные окна

import { escapeHtml, _formEl } from './utils.js';

export function openTaskFormModal() {
  const m = _formEl('taskFormModal');
  if (m) m.style.display = 'flex';
}

export function closeTaskFormModal() {
  const m = _formEl('taskFormModal');
  if (!m || m.style.display === 'none') return;
  const modal = m.querySelector('.task-form-modal');
  if (modal) {
    m.classList.add('closing');
    modal.classList.add('closing');
    modal.addEventListener('animationend', () => {
      m.style.display = 'none';
      m.classList.remove('closing');
      modal.classList.remove('closing');
    }, { once: true });
  } else {
    m.style.display = 'none';
  }
}

/**
 * Диалог выбора: создать одну задачу или по отрезкам времени.
 * Возвращает 'single' | 'segments' | null (отмена).
 */
export function showSegmentChoiceModal(segmentsCount) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = '400px';

    modal.innerHTML = `
      <div class="modal-head">
        <h2>Формирование задачи</h2>
        <button type="button" class="icon-btn close-modal-btn">✕</button>
      </div>
      <div class="modal-body" style="padding: 20px;">
        <p style="margin: 0 0 16px; color: var(--text-secondary); font-size: 13px;">
          В заметке ${segmentsCount} ${segmentsCount < 5 ? 'отрезка' : 'отрезков'} времени. Как создать задачу?
        </p>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <button type="button" class="btn-dock btn-dock-secondary segment-choice-btn" data-choice="single" style="width: 100%; justify-content: center;">Одна задача</button>
          <button type="button" class="btn-dock btn-dock-primary segment-choice-btn" data-choice="segments" style="width: 100%; justify-content: center;">По отрезкам (${segmentsCount} задач)</button>
        </div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = (result) => {
      document.body.removeChild(overlay);
      resolve(result);
    };

    modal.querySelector('.close-modal-btn').addEventListener('click', () => close(null));
    modal.querySelectorAll('.segment-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => close(btn.dataset.choice));
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });
  });
}

/**
 * Редактор сегментов: пользователь может изменить время или удалить сегменты.
 * Возвращает отредактированный массив сегментов или null (отмена).
 */
export function showSegmentEditorModal(segments) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = '440px';

    // ISO → datetime-local value (YYYY-MM-DDTHH:mm)
    const toLocal = (iso) => {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const renderSegments = () => {
      const list = modal.querySelector('.segment-editor-list');
      const rows = list.querySelectorAll('.segment-editor-row');
      const confirmBtn = modal.querySelector('.confirm-segments-btn');
      if (confirmBtn) {
        const count = rows.length;
        confirmBtn.textContent = `Продолжить (${count} ${count === 1 ? 'задача' : count < 5 ? 'задачи' : 'задач'})`;
        confirmBtn.disabled = count === 0;
      }
    };

    const segmentRows = segments.map((seg, i) => `
      <div class="segment-editor-row" data-index="${i}" style="display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--border);">
        <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
          <input type="datetime-local" class="seg-start" value="${toLocal(seg.start)}" style="font-size: 13px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--background); color: var(--foreground);" />
          <input type="datetime-local" class="seg-end" value="${toLocal(seg.end)}" style="font-size: 13px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--background); color: var(--foreground);" />
        </div>
        <button type="button" class="icon-btn seg-delete-btn" title="Удалить отрезок" style="color: var(--danger, #ff3b30); font-size: 18px; flex-shrink: 0;">✕</button>
      </div>
    `).join('');

    modal.innerHTML = `
      <div class="modal-head">
        <h2>Отрезки времени</h2>
        <button type="button" class="icon-btn close-modal-btn">✕</button>
      </div>
      <div class="modal-body" style="padding: 16px 20px; max-height: 400px; overflow-y: auto;">
        <div class="segment-editor-list">${segmentRows}</div>
      </div>
      <div class="modal-footer" style="padding: 12px 20px; border-top: 1px solid var(--border); display: flex; gap: 8px; justify-content: flex-end;">
        <button type="button" class="btn-dock btn-dock-secondary cancel-segments-btn">Отмена</button>
        <button type="button" class="btn-dock btn-dock-primary confirm-segments-btn">Продолжить (${segments.length} ${segments.length < 5 ? 'задачи' : 'задач'})</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Удаление сегмента
    modal.querySelector('.segment-editor-list').addEventListener('click', (e) => {
      const delBtn = e.target.closest('.seg-delete-btn');
      if (!delBtn) return;
      const row = delBtn.closest('.segment-editor-row');
      if (row) {
        row.remove();
        renderSegments();
      }
    });

    const close = (result) => {
      document.body.removeChild(overlay);
      resolve(result);
    };

    modal.querySelector('.close-modal-btn').addEventListener('click', () => close(null));
    modal.querySelector('.cancel-segments-btn').addEventListener('click', () => close(null));
    modal.querySelector('.confirm-segments-btn').addEventListener('click', () => {
      const rows = modal.querySelectorAll('.segment-editor-row');
      const edited = [];
      rows.forEach((row) => {
        const startVal = row.querySelector('.seg-start').value;
        const endVal = row.querySelector('.seg-end').value;
        if (startVal && endVal) {
          edited.push({ start: new Date(startVal).toISOString(), end: new Date(endVal).toISOString() });
        }
      });
      close(edited.length > 0 ? edited : null);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });
  });
}

export function showGroupSelectionModal(groupNames, tasksByGroup) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = '400px';
    
    const selectedGroups = new Set();
    
    modal.innerHTML = `
      <div class="modal-head">
        <h2>Выберите группы для очистки</h2>
        <button type="button" class="icon-btn close-modal-btn">✕</button>
      </div>
      <div class="modal-body" style="padding: 20px;">
        <div class="group-selection-list" style="display: flex; flex-direction: column; gap: 12px;">
          ${groupNames.map(group => {
            const count = tasksByGroup[group].length;
            return `
              <label class="checkbox-label" style="display: flex; align-items: center; justify-content: space-between; padding: 12px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <input type="checkbox" class="group-selection-checkbox" data-group="${group}" />
                  <span style="font-weight: 500;">${escapeHtml(group)}</span>
                </div>
                <span style="color: var(--text-secondary); font-size: 13px;">${count} ${count === 1 ? 'задача' : count < 5 ? 'задачи' : 'задач'}</span>
              </label>
            `;
          }).join('')}
        </div>
      </div>
      <div class="modal-footer" style="padding: 16px 20px; border-top: 1px solid var(--border); display: flex; gap: 8px; justify-content: flex-end;">
        <button type="button" class="btn-dock btn-dock-secondary cancel-modal-btn">Отмена</button>
        <button type="button" class="btn-dock btn-dock-danger confirm-modal-btn">Очистить</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const checkboxes = modal.querySelectorAll('.group-selection-checkbox');
    checkboxes.forEach(cb => {
      cb.addEventListener('change', (e) => {
        const group = e.target.dataset.group;
        if (e.target.checked) {
          selectedGroups.add(group);
        } else {
          selectedGroups.delete(group);
        }
      });
    });
    
    const closeModal = () => {
      document.body.removeChild(overlay);
      resolve(null);
    };
    
    const confirmModal = () => {
      document.body.removeChild(overlay);
      resolve(Array.from(selectedGroups));
    };
    
    modal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
    modal.querySelector('.cancel-modal-btn').addEventListener('click', closeModal);
    modal.querySelector('.confirm-modal-btn').addEventListener('click', confirmModal);
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  });
}
