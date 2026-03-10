// groups.js - Управление группами

import { groups, selectedGroup, visibleGroups, formGroupSelection, setGroups, setSelectedGroup, setVisibleGroups, setFormGroupSelection as setFormGroupSelectionConfig, DEFAULT_GROUPS, CRM_GROUP_NAME, isCrmGroup, isNotesGroup, userSyncGroups, selectedSyncGroupId } from './config.js';
import { saveGroups as saveGroupsStorage, loadGroups as loadGroupsStorage, deletePersonalTasksByGroup, renamePersonalTasksGroup, loadUserHiddenGroups, saveUserHiddenGroups } from './storage.js';
import { escapeHtml, _formEl, openPickerModal } from './utils.js';
import { isAuthed } from './auth.js';

export { isCrmGroup, isNotesGroup };

export function isCrmForm() {
  return formGroupSelection === 'CRM';
}

export function isNotesForm() {
  return formGroupSelection === 'Заметки';
}

export function updateFormMode() {
  const form = _formEl('taskForm');
  if (!form) return;
  const crmForm = isCrmForm();
  const notesForm = isNotesForm();
  form.classList.toggle('form-mode-simple', !crmForm);
  form.classList.toggle('form-mode-notes', notesForm);
  const submitBtn = _formEl('submitTaskBtn');
  const taskId = _formEl('taskId');
  const isCreate = !(taskId && taskId.value);
  if (submitBtn) {
    submitBtn.disabled = false;
  }
  const head = document.querySelector('#taskFormModal .modal-head h2');
  if (head) {
    head.textContent = notesForm ? (isCreate ? 'Новая заметка' : 'Редактировать') : (isCreate ? 'Новая задача' : 'Редактировать');
  }
  const badge = document.getElementById('formGroupBadge');
  if (badge) {
    badge.textContent = formGroupSelection || '';
  }
  const submitLabel = submitBtn?.textContent;
  if (submitBtn && notesForm && submitLabel === 'Сохранить') {
    submitBtn.textContent = 'Сохранить';
  } else if (submitBtn && notesForm && isCreate) {
    submitBtn.textContent = 'Создать';
  }

  // Sync group dropdown for notes — CSS handles visibility via .form-notes-only
  const syncGroupDropdown = document.getElementById('syncGroupDropdown');
  if (syncGroupDropdown && notesForm && isCreate) {
    const label = syncGroupDropdown.querySelector('.dd-label');
    if (userSyncGroups.length === 0 && isAuthed()) {
      // Groups not loaded yet — trigger async load, then re-run
      import('./config.js').then(({ authEndpoint, setUserSyncGroups }) => {
        if (!authEndpoint) return;
        import('./api.js').then(({ apiFetch }) => {
          apiFetch(`${authEndpoint}?action=sync-groups`, {}, {}).then(async res => {
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.groups) {
              const myGroups = data.is_super_admin ? data.groups : data.groups.filter(g => g.my_role);
              setUserSyncGroups(myGroups);
              updateFormMode();
            }
          }).catch(() => {});
        });
      });
    } else if (userSyncGroups.length === 1) {
      const g = userSyncGroups[0];
      syncGroupDropdown.dataset.value = String(g.id);
      if (label) label.textContent = g.name || 'Без названия';
    } else if (!syncGroupDropdown.dataset.value) {
      if (selectedSyncGroupId) {
        const g = userSyncGroups.find(sg => String(sg.id) === String(selectedSyncGroupId));
        if (g) {
          syncGroupDropdown.dataset.value = String(g.id);
          if (label) label.textContent = g.name || 'Без названия';
        }
      }
    }
  }
}

export async function loadGroups(dependencies = {}) {
  const { renderGroupDropdownList, renderFormGroupDropdownList, renderGroupsManagementList } = dependencies;
  await loadGroupsStorage();
  if (renderGroupDropdownList) renderGroupDropdownList(dependencies);
  if (renderFormGroupDropdownList) renderFormGroupDropdownList();
  if (renderGroupsManagementList) await renderGroupsManagementList();
}

export async function renderGroupsManagementList() {
  const list = document.getElementById('groupsManagementList');
  if (!list) return;
  const authed = isAuthed();
  const opts = groups.filter((g) => authed || !isCrmGroup(g) || isNotesGroup(g));
  const hidden = await loadUserHiddenGroups();
  const items = opts.map((g) => {
    const canRename = canRenameGroup(g);
    const canDelete = g !== 'Личные' && !isNotesGroup(g);
    return `
      <div class="groups-management-item" data-group="${escapeHtml(g)}">
        <span class="groups-management-name">${escapeHtml(g)}</span>
        <div class="groups-management-actions">
          ${canRename ? `<button type="button" class="groups-management-rename btn-dock btn-dock-sm" title="Переименовать">✎</button>` : ''}
          ${canDelete ? `<button type="button" class="groups-management-delete btn-dock btn-dock-sm btn-dock-danger" title="Удалить группу и её задачи">×</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
  const restoreCrm = authed && hidden.includes('CRM') ? `
    <div class="groups-management-item groups-management-restore" data-group="CRM">
      <span class="groups-management-name groups-management-hidden">CRM (скрыта)</span>
      <button type="button" class="groups-management-restore-btn btn-dock btn-dock-sm" title="Восстановить группу">Восстановить</button>
    </div>
  ` : '';
  list.innerHTML = items + restoreCrm;
}

export async function saveGroups() {
  let toSave = [...groups];
  if (isAuthed() && !toSave.includes(CRM_GROUP_NAME)) toSave.push(CRM_GROUP_NAME);
  if (!toSave.includes('Заметки')) toSave.push('Заметки');
  await saveGroupsStorage(toSave);
}

export function renderGroupDropdownList(dependencies = {}) {
  const list = document.getElementById('groupDropdownList');
  if (!list) return;
  // Фильтруем CRM группу, если пользователь не авторизован
  const authed = isAuthed();
  const opts = groups.filter(g => authed || !isCrmGroup(g) || isNotesGroup(g));
  list.innerHTML = opts.map((g) => {
    const sel = g === selectedGroup ? ' selected' : '';
    const checked = visibleGroups.includes(g) ? ' checked' : '';
    return `
      <div class="dropdown-option${sel}" data-value="${escapeHtml(g)}">
        <label class="group-checkbox-label">
          <input type="checkbox" class="group-checkbox" data-group="${escapeHtml(g)}"${checked} />
          <span>${escapeHtml(g)}</span>
        </label>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.group-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('click', async (e) => {
      e.stopPropagation();
      const groupName = checkbox.dataset.group;
      if (checkbox.checked) {
        if (!visibleGroups.includes(groupName)) {
          visibleGroups.push(groupName);
        }
      } else {
        const filtered = visibleGroups.filter(g => g !== groupName);
        setVisibleGroups(filtered);
      }
      await chrome.storage.sync.set({ visibleGroups });

      const { loadTasks, renderTasks, loadMergedTasks, updateGroupTriggerLabel } = dependencies;
      if (updateGroupTriggerLabel) updateGroupTriggerLabel();

      // Немедленно обновляем отображение задач
      if (loadTasks) {
        await loadTasks(dependencies, { useCacheOnly: true });
      } else if (renderTasks && loadMergedTasks) {
        const merged = await loadMergedTasks(dependencies, { useCacheOnly: true });
        renderTasks(merged);
      } else {
        // Если зависимости не переданы, импортируем напрямую
        try {
          const { loadTasks: loadTasksFn } = await import('./tasks.js');
          if (loadTasksFn) {
            // Получаем зависимости из window если доступны
            const deps = window.getDependencies ? window.getDependencies() : {};
            await loadTasksFn(deps, { useCacheOnly: true });
          } else {
            const { loadMergedTasks: loadMergedFn } = await import('./tasks.js');
            const { renderTasks: renderTasksFn } = await import('./render.js');
            const deps = window.getDependencies ? window.getDependencies() : {};
            const merged = await loadMergedFn(deps, { useCacheOnly: true });
            renderTasksFn(merged);
          }
        } catch (err) {
          // console.error('Ошибка обновления задач:', err);
        }
      }
    });
  });
}

const GROUP_PRIORITY_ORDER = ['CRM', 'Личные', 'Заметки'];

export function updateGroupTriggerLabel() {
  const lab = document.getElementById('groupTriggerLabel');
  if (!lab) return;
  const authed = isAuthed();
  const availableGroups = groups.filter(g => authed || !isCrmGroup(g) || isNotesGroup(g));
  const visible = visibleGroups.filter(g => availableGroups.includes(g));
  const sorted = [...visible].sort((a, b) => {
    const ia = GROUP_PRIORITY_ORDER.indexOf(a);
    const ib = GROUP_PRIORITY_ORDER.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return (a || '').localeCompare(b || '');
  });
  if (sorted.length === 0) {
    lab.textContent = availableGroups[0] ?? 'Личные';
  } else if (sorted.length === 1) {
    lab.textContent = sorted[0];
  } else if (sorted.length === 2) {
    lab.textContent = sorted.join(', ');
  } else if (sorted.length >= availableGroups.length) {
    lab.textContent = 'Все группы';
  } else {
    lab.textContent = `${sorted[0]} +${sorted.length - 1}`;
  }
}

export function renderFormGroupDropdownList(extraGroup) {
  const list = document.getElementById('formGroupDropdownList');
  if (!list) return;
  const authed = isAuthed();
  const allGroups = [...new Set([...groups, extraGroup].filter(Boolean))];
  // «CRM группа» — только просмотр, в форме создания/редактирования не показываем
  const opts = allGroups.filter(g => g !== CRM_GROUP_NAME && (authed || !isCrmGroup(g) || isNotesGroup(g)));
  if (formGroupSelection === CRM_GROUP_NAME) {
    setFormGroupSelectionConfig('CRM');
    updateFormGroupTriggerLabel();
    updateFormMode();
  }
  list.innerHTML = opts.map((g) => {
    const sel = g === formGroupSelection ? ' selected' : '';
    return `<div class="dropdown-option${sel}" data-value="${escapeHtml(g)}">${escapeHtml(g)}</div>`;
  }).join('');
}

export function updateFormGroupTriggerLabel() {
  const lab = document.getElementById('formGroupTriggerLabel');
  if (lab) {
    const authed = isAuthed();
    const availableGroups = groups.filter(g => authed || !isCrmGroup(g) || isNotesGroup(g));
    // Если выбрана CRM группа, но пользователь не авторизован, выбираем первую доступную
    const currentSelection = (isCrmForm() && !authed) ? (availableGroups[0] ?? 'Личные') : formGroupSelection;
    lab.textContent = currentSelection || (availableGroups[0] ?? 'Личные');
  }
}

export function setFormGroupSelection(val) {
  // Не позволяем выбрать CRM группу без авторизации
  if (isCrmGroup(val) && !isAuthed()) {
    const availableGroups = groups.filter(g => !isCrmGroup(g));
    val = availableGroups[0] || 'Личные';
  }
  setFormGroupSelectionConfig(val);
  updateFormGroupTriggerLabel();
  updateFormMode();
}

export function setupGroupDropdown(dependencies = {}) {
  const { loadTasks, renderGroupDropdownList, updateGroupTriggerLabel } = dependencies;
  const trigger = document.getElementById('groupDropdownTrigger');
  const panel = document.getElementById('groupDropdownPanel');
  const header = document.getElementById('groupDropdownHeader');
  const list = document.getElementById('groupDropdownList');
  const addBtn = document.getElementById('groupAddBtn');
  const addRow = document.getElementById('groupAddRow');
  const addInput = document.getElementById('groupAddInput');
  const addConfirm = document.getElementById('groupAddConfirm');
  if (!trigger || !panel || !list) return;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = panel.style.display === 'flex';
    panel.style.display = open ? 'none' : 'flex';
    if (!open) {
      hideGroupAddRow();
      if (header) header.style.display = '';
      if (renderGroupDropdownList) renderGroupDropdownList(dependencies);
    }
  });

  document.addEventListener('click', () => {
    panel.style.display = 'none';
    hideGroupAddRow();
  });
  panel.addEventListener('click', (e) => e.stopPropagation());

  function hideGroupAddRow() {
    if (addRow) addRow.style.display = 'none';
    if (addInput) addInput.value = '';
    if (header) header.style.display = '';
  }

  function submitAddGroup() {
    const name = addInput?.value?.trim();
    if (!name) return;
    if (groups.includes(name)) {
      setSelectedGroup(name);
      if (updateGroupTriggerLabel) updateGroupTriggerLabel();
      chrome.storage.sync.set({ selectedGroup: name });
      if (!visibleGroups.includes(name)) {
        visibleGroups.push(name);
        chrome.storage.sync.set({ visibleGroups });
      }
      hideGroupAddRow();
      panel.style.display = 'none';
      if (loadTasks) loadTasks(dependencies, { useCacheOnly: true });
      return;
    }
    groups.push(name);
    saveGroups();
    setSelectedGroup(name);
    if (!visibleGroups.includes(name)) {
      visibleGroups.push(name);
      chrome.storage.sync.set({ visibleGroups });
    }
    if (updateGroupTriggerLabel) updateGroupTriggerLabel();
    chrome.storage.sync.set({ selectedGroup: name });
    hideGroupAddRow();
    if (renderGroupDropdownList) renderGroupDropdownList(dependencies);
    panel.style.display = 'none';
    if (loadTasks) loadTasks(dependencies, { useCacheOnly: true });
  }

  if (addBtn) {
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (addRow && addInput) {
        addRow.style.display = 'flex';
        if (header) header.style.display = 'none';
        addInput.value = '';
        addInput.focus();
      }
    });
  }
  if (addRow && addInput && addConfirm) {
    addConfirm.addEventListener('click', () => submitAddGroup());
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submitAddGroup(); }
    });
  }

  list.addEventListener('click', (e) => {
    const opt = e.target.closest('.dropdown-option');
    if (!opt) return;
    const checkbox = opt.querySelector('.group-checkbox');
    if (checkbox && e.target !== checkbox && !e.target.closest('label')) {
      let groupName = opt.dataset.value ?? (groups[0] ?? 'CRM');
      // Не позволяем выбрать CRM группу без авторизации
      if (isCrmGroup(groupName) && !isAuthed()) {
        const availableGroups = groups.filter(g => !isCrmGroup(g));
        groupName = availableGroups[0] || 'Личные';
      }
      setSelectedGroup(groupName);
      if (updateGroupTriggerLabel) updateGroupTriggerLabel();
      chrome.storage.sync.set({ selectedGroup: groupName });
      if (renderGroupDropdownList) renderGroupDropdownList(dependencies);
      panel.style.display = 'none';
      if (loadTasks) loadTasks(dependencies, { useCacheOnly: true });
    }
  });
}

export function setupFormGroupDropdown(dependencies = {}) {
  const { setFormGroupSelection, renderFormGroupDropdownList, updateFormGroupTriggerLabel, updateFormMode } = dependencies;
  const trigger = document.getElementById('formGroupDropdownTrigger');
  const wrap = document.getElementById('formGroupWrap');
  if (!trigger) return;

  trigger.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (wrap && wrap.classList.contains('form-group-locked')) return;
    const authed = isAuthed();
    const allGroups = [...new Set([...groups].filter(Boolean))];
    const opts = allGroups
      .filter(g => g !== CRM_GROUP_NAME && (authed || !isCrmGroup(g) || isNotesGroup(g)))
      .map(g => ({ value: g, label: g }));
    const result = await openPickerModal({ title: 'Группа', options: opts, selectedValue: formGroupSelection, parent: document.getElementById('taskFormModal') });
    if (result) {
      let val = result.value;
      if (isCrmGroup(val) && !authed) {
        const availableGroups = groups.filter(g => !isCrmGroup(g));
        val = availableGroups[0] || 'Личные';
      }
      if (setFormGroupSelection) setFormGroupSelection(val);
      if (renderFormGroupDropdownList) renderFormGroupDropdownList();
      if (updateFormGroupTriggerLabel) updateFormGroupTriggerLabel();
      if (updateFormMode) updateFormMode();
      if (typeof dependencies.updateCreateButtonState === 'function') dependencies.updateCreateButtonState(dependencies);
    }
  });
}

/** CRM, Личные и Заметки — системные группы, переименование сломает логику. */
export function canRenameGroup(groupName) {
  return !isCrmGroup(groupName) && groupName !== 'Личные' && !isNotesGroup(groupName);
}

export async function deleteGroup(groupName, dependencies = {}) {
  if (groupName === 'Личные' || isNotesGroup(groupName)) return;
  let newGroups = groups.filter((g) => g !== groupName);
  if (newGroups.length === 0) return;
  if (isAuthed() && !newGroups.includes(CRM_GROUP_NAME)) newGroups.push(CRM_GROUP_NAME);
  if (!newGroups.includes('Заметки')) newGroups.push('Заметки');
  const newVisible = visibleGroups.filter((g) => g !== groupName);
  setGroups(newGroups);
  setVisibleGroups(newVisible);
  if (selectedGroup === groupName) {
    const next = newGroups[0];
    setSelectedGroup(next);
    setFormGroupSelectionConfig(next);
    await chrome.storage.sync.set({ selectedGroup: next });
  }
  if (isCrmGroup(groupName)) {
    const hidden = await loadUserHiddenGroups();
    if (!hidden.includes('CRM')) {
      await saveUserHiddenGroups([...hidden, 'CRM']);
    }
  } else {
    await deletePersonalTasksByGroup(groupName);
  }
  await chrome.storage.sync.set({ groups: newGroups, visibleGroups: newVisible });
  const { loadTasks, renderGroupDropdownList, renderFormGroupDropdownList, updateGroupTriggerLabel } = dependencies;
  if (renderGroupDropdownList) renderGroupDropdownList(dependencies);
  if (renderFormGroupDropdownList) renderFormGroupDropdownList();
  if (updateGroupTriggerLabel) updateGroupTriggerLabel();
  if (loadTasks) await loadTasks(dependencies, { useCacheOnly: true });
}

export async function restoreGroup(groupName, dependencies = {}) {
  if (groupName !== 'CRM') return;
  const hidden = await loadUserHiddenGroups();
  if (!hidden.includes('CRM')) return;
  await saveUserHiddenGroups(hidden.filter((g) => g !== 'CRM'));
  if (!groups.includes('CRM')) {
    const newGroups = ['CRM', ...groups];
    setGroups(newGroups);
    await chrome.storage.sync.set({ groups: newGroups });
  }
  if (!visibleGroups.includes('CRM')) {
    const newVisible = [...visibleGroups, 'CRM'];
    setVisibleGroups(newVisible);
    await chrome.storage.sync.set({ visibleGroups: newVisible });
  }
  const { loadTasks, renderGroupDropdownList, renderFormGroupDropdownList, updateGroupTriggerLabel } = dependencies;
  if (renderGroupDropdownList) renderGroupDropdownList(dependencies);
  if (renderFormGroupDropdownList) renderFormGroupDropdownList();
  if (updateGroupTriggerLabel) updateGroupTriggerLabel();
  if (loadTasks) await loadTasks(dependencies, { useCacheOnly: true });
}

export async function reorderGroups(draggedGroup, targetGroup, dependencies = {}) {
  const stored = await chrome.storage.sync.get(['groups']).then((r) => r.groups || []);
  let fullGroups = Array.isArray(stored) ? [...stored] : [...groups];
  if (isAuthed() && !fullGroups.includes(CRM_GROUP_NAME)) fullGroups.push(CRM_GROUP_NAME);
  if (!fullGroups.includes('Заметки')) fullGroups.push('Заметки');
  const idxFrom = fullGroups.indexOf(draggedGroup);
  const idxTo = fullGroups.indexOf(targetGroup);
  if (idxFrom < 0 || idxTo < 0 || idxFrom === idxTo) return;
  const newGroups = [...fullGroups];
  newGroups.splice(idxFrom, 1);
  const insertIdx = idxTo > idxFrom ? idxTo - 1 : idxTo;
  newGroups.splice(insertIdx, 0, draggedGroup);
  setGroups(newGroups);
  await chrome.storage.sync.set({ groups: newGroups });
  const { loadTasks, renderGroupDropdownList, renderFormGroupDropdownList, updateGroupTriggerLabel } = dependencies;
  if (renderGroupDropdownList) renderGroupDropdownList(dependencies);
  if (renderFormGroupDropdownList) renderFormGroupDropdownList();
  if (updateGroupTriggerLabel) updateGroupTriggerLabel();
  if (loadTasks) await loadTasks(dependencies, { useCacheOnly: true });
}

export async function renameGroup(oldName, newName, dependencies = {}) {
  if (!canRenameGroup(oldName)) return;
  if (groups.includes(newName)) return;
  const idx = groups.indexOf(oldName);
  if (idx < 0) return;
  let newGroups = [...groups];
  newGroups[idx] = newName;
  if (isAuthed() && !newGroups.includes(CRM_GROUP_NAME)) newGroups.push(CRM_GROUP_NAME);
  if (!newGroups.includes('Заметки')) newGroups.push('Заметки');
  setGroups(newGroups);
  const newVisible = visibleGroups.map((g) => (g === oldName ? newName : g));
  setVisibleGroups(newVisible);
  if (selectedGroup === oldName) {
    setSelectedGroup(newName);
    setFormGroupSelectionConfig(newName);
    await chrome.storage.sync.set({ selectedGroup: newName });
  }
  await renamePersonalTasksGroup(oldName, newName);
  await chrome.storage.sync.set({ groups: newGroups, visibleGroups: newVisible });
  const { loadTasks, renderGroupDropdownList, renderFormGroupDropdownList, updateGroupTriggerLabel } = dependencies;
  if (renderGroupDropdownList) renderGroupDropdownList(dependencies);
  if (renderFormGroupDropdownList) renderFormGroupDropdownList();
  if (updateGroupTriggerLabel) updateGroupTriggerLabel();
  if (loadTasks) await loadTasks(dependencies, { useCacheOnly: true });
}
