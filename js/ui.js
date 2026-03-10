// ui.js - UI компоненты и события

import { theme, syncPeriod, groups, selectedGroup, _lastRenderedTasks, setSyncPeriod, setTimeRefreshInterval, setFormGroupSelection, user, authMode, setTheme, applyTheme, taskSortOrder, setTaskSortOrder, setCrmSyncActivityTypes, setCrmSyncEventStatuses, crmSyncSourceGroupId, crmSyncOtherUsers, setCrmSyncSourceGroupId, setCrmSyncOtherUsers, CRM_SYNC_ACTIVITY_VALUES, CRM_SYNC_STATUS_VALUES, CRM_GROUP_NAME } from './config.js';
import { _formEl, showError, hideError, showLoading, hideLoading, tasksContainer, escapeHtml, error as errorEl, openPickerModal } from './utils.js';
import { isAuthed, clearAuth, login, showLoginError } from './auth.js';
import { loadGroups, saveGroups, renderGroupDropdownList, updateGroupTriggerLabel, renderFormGroupDropdownList, updateFormGroupTriggerLabel, setFormGroupSelection as setFormGroup, updateFormMode, setupGroupDropdown, setupFormGroupDropdown, isCrmForm, isNotesForm, deleteGroup, renameGroup, restoreGroup, renderGroupsManagementList, reorderGroups } from './groups.js';
import { loadTasks, loadMergedTasks, createTask, updateTask, deleteTask, toggleTaskComplete, completeCrmTaskWithDescription, setTaskStatus, invalidateSyncNotesCache, startSyncNotesPolling, stopSyncNotesPolling } from './tasks.js';
import { loadPersonalTasks, savePersonalTasks, loadDeletedCrmTasks, saveDeletedCrmTasks, markCrmTaskAsDeleted, removeCrmTaskFromCache, updateNoteTimer, saveSelectedSyncGroupId } from './storage.js';
import { renderTasks, refreshTaskTimeBadges, refreshNoteTimerDisplays, toggleGroup, formatDuration, formatTimerSegmentsForTaskResult } from './render.js';
import { openTaskFormModal, closeTaskFormModal, showGroupSelectionModal, showSegmentChoiceModal, showSegmentEditorModal } from './modals.js';
import { getDateTimePickerValue, setDateTimePickerValue, resetDateTimePickers, initDateTimePickers } from './datetime-picker.js';
import { renderStats, switchTab } from './stats.js';
import { fetchEventStatuses, fetchActivityTypes, fetchRelatedModules, searchRelated, fetchUsers, apiFetch } from './api.js';
import { authEndpoint, vtigerCredentials, selectedSyncGroupId, setUserSyncGroups, setVtigerUsersMap, vtigerUsersMap } from './config.js';
import { showChangelogModal } from './changelog.js';

// Состояние для создания задач по сегментам из заметки
let _noteSegmentsForBatch = null; // null = обычный режим, Array = создать по сегментам
let _sourceNoteId = null; // ID заметки, из которой формируются задачи

// Маппинг EN→RU по спискам в форме (скрины: статусы — Запланировано/В работе/Выполнено/Отменено; типы — Звонок/Встреча/Чат/Выполнить/Письмо)
const EVENTSTATUS_LABELS = {
  Planned: 'Запланировано', Held: 'Выполнено', 'Not Held': 'Отменено',
  Completed: 'Выполнено', Deferred: 'Отложено', Cancelled: 'Отменено',
  'In Progress': 'В работе', 'In progress': 'В работе',
};
const ACTIVITYTYPE_LABELS = {
  Call: 'Звонок', Meeting: 'Встреча', Chat: 'Чат', Task: 'Выполнить',
  Email: 'Письмо', 'E-mail': 'Письмо', Mail: 'Письмо',
};
function getEventStatusLabel(v) { return (v && EVENTSTATUS_LABELS[v]) || v || ''; }
function getActivityTypeLabel(v) { return (v && ACTIVITYTYPE_LABELS[v]) || v || ''; }

function toggleFormTaskResultVisibility(eventstatus) {
  const wrap = document.getElementById('formTaskResultWrap');
  const isHeld = eventstatus === 'Held' || eventstatus === 'Выполнено';
  if (wrap) wrap.style.display = isHeld ? 'block' : 'none';
}

// Load sync groups for form dropdown (called on init and after login)
export async function loadSyncGroupsForForm(dependencies = {}) {
  if (!isAuthed() || !authEndpoint) return;
  try {
    const res = await apiFetch(`${authEndpoint}?action=sync-groups`, {}, dependencies);
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.groups) {
      const myGroups = data.is_super_admin ? data.groups : data.groups.filter(g => g.my_role);
      setUserSyncGroups(myGroups);
      if (dependencies.updateFormMode) dependencies.updateFormMode();
    }
  } catch (_) { /* ignore */ }
}

export function showSyncStatus(msg, type) {
  const el = _formEl('syncStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
  el.classList.remove('success', 'error');
  if (type) el.classList.add(type);
}

export async function updateSettingsUI(dependencies = {}) {
  const notifyEl = _formEl('notifyEnabled');
  const authStatus = document.getElementById('authStatus');
  const authForm = document.getElementById('authForm');
  const authStatusIcon = document.getElementById('authStatusIcon');
  const authStatusLabel = document.getElementById('authStatusLabel');
  const authStatusUser = document.getElementById('authStatusUser');
  const logoutBtn = _formEl('logoutBtn');
  const syncPeriodEl = _formEl('syncPeriod');
  const syncSection = document.getElementById('syncSection');
  const notifySection = document.getElementById('notifySection');

  const { notifyEnabled } = await chrome.storage.sync.get(['notifyEnabled']);
  if (notifyEl) notifyEl.checked = !!notifyEnabled;
  document.querySelectorAll('.theme-option').forEach((b) => b.classList.toggle('active', b.dataset.theme === theme));
  const authed = isAuthed();
  // Expose current vtiger user_id for note assignment UI
  if (user && user.id) window._currentVtigerUserId = String(user.id);

  if (authForm) authForm.style.display = authed ? 'none' : 'block';
  if (authStatus) authStatus.style.display = authed ? 'flex' : 'none';
  if (syncSection) syncSection.style.display = authed ? 'block' : 'none';
  if (notifySection) notifySection.style.display = authed ? 'block' : 'none';

  const syncGroupsSection = document.getElementById('syncGroupsSection');
  const syncGroupsList = document.getElementById('syncGroupsList');
  const syncGroupsError = document.getElementById('syncGroupsError');
  const syncGroupsLoading = document.getElementById('syncGroupsLoading');
  const syncGroupsToolbar = document.getElementById('syncGroupsToolbar');
  const syncGroupCreateBtn = document.getElementById('syncGroupCreateBtn');
  if (syncGroupsSection) syncGroupsSection.style.display = authed ? 'block' : 'none';
  if (authed && syncGroupsSection && syncGroupsList) {
    const showSyncError = (msg) => {
      if (syncGroupsError) {
        syncGroupsError.textContent = msg || '';
        syncGroupsError.style.display = msg ? 'block' : 'none';
      }
    };
    const refreshSyncGroups = () => {
      apiFetch(`${authEndpoint}?action=sync-groups`, {}, dependencies)
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          return { res, data };
        })
        .then(async ({ res, data }) => {
          if (syncGroupsLoading) syncGroupsLoading.style.display = 'none';
          if (!res.ok) {
            showSyncError(data.error || data.message || `Ошибка ${res.status}`);
            renderSyncGroups(data);
            return;
          }
          // Cache user sync groups for form dropdown (super_admin sees all, others only their groups)
          setUserSyncGroups(data.is_super_admin ? (data.groups || []) : (data.groups || []).filter(g => g.my_role));
          if (dependencies.updateFormMode) dependencies.updateFormMode();
          if (data.my_user_id) window._currentVtigerUserId = String(data.my_user_id);
          if (data.groups && data.groups.length === 1 && !selectedSyncGroupId) {
            await saveSelectedSyncGroupId(data.groups[0].id);
          }
          const hasManageRole1 = data.is_super_admin || (data.groups || []).some((g) => g.my_role === 'super_admin' || g.my_role === 'admin');
          if (hasManageRole1) {
            try {
              const users = await fetchUsers(dependencies);
              const uMap = {};
              users.forEach((u) => { uMap[String(u.id)] = u.display_name || u.user_name || u.username || String(u.id); });
              setVtigerUsersMap(uMap);
              renderSyncGroups(data, users);
              const crmGroupSection = document.getElementById('crmGroupMembersSyncSection');
              if (crmGroupSection) crmGroupSection.style.display = '';
              renderCrmGroupMembersSyncSection(data, users);
            } catch (e) {
              renderSyncGroups(data, []);
            }
          } else {
            const crmGroupSection = document.getElementById('crmGroupMembersSyncSection');
            if (crmGroupSection) crmGroupSection.style.display = 'none';
            // Still try to load users for note assignee display
            try {
              const users = await fetchUsers(dependencies);
              const uMap = {};
              users.forEach((u) => { uMap[String(u.id)] = u.display_name || u.user_name || u.username || String(u.id); });
              setVtigerUsersMap(uMap);
            } catch (e) { /* ok */ }
            renderSyncGroups(data);
          }
        })
        .catch(() => {
          if (syncGroupsLoading) syncGroupsLoading.style.display = 'none';
          showSyncError('Не удалось загрузить группы.');
          renderSyncGroups({ groups: [] });
        });
    };
    let _syncGroupsData = null;
    let _syncVtigerUsers = [];
    let _selectedSyncGroupView = null; // id of currently viewed group in settings

    const renderSyncGroups = (data, vtigerUsers = []) => {
      _syncGroupsData = data;
      _syncVtigerUsers = vtigerUsers;
      syncGroupsList.innerHTML = '';
      showSyncError('');
      if (data.error && !data.groups) {
        showSyncError(data.error);
        if (syncGroupsToolbar) syncGroupsToolbar.style.display = 'none';
        return;
      }
      const groups = data.groups || [];
      const userMap = vtigerUsers.length
        ? Object.fromEntries(vtigerUsers.map((u) => [String(u.id), u.display_name || u.user_name || u.username || String(u.id)]))
        : { ...vtigerUsersMap };

      // --- Toolbar: always visible if groups exist ---
      if (syncGroupsToolbar) syncGroupsToolbar.style.display = groups.length > 0 || data.is_super_admin ? 'flex' : 'none';

      // Create button — only super_admin
      if (syncGroupCreateBtn) syncGroupCreateBtn.style.display = data.is_super_admin ? '' : 'none';

      // Group selector dropdown
      const groupSelector = document.getElementById('syncGroupSelector');
      if (groupSelector) {
        groupSelector.innerHTML = '';
        if (groups.length === 0) {
          groupSelector.innerHTML = '<option value="">Нет групп</option>';
        } else {
          groups.forEach((g) => {
            const opt = document.createElement('option');
            opt.value = g.id;
            opt.textContent = g.name || 'Без названия';
            groupSelector.appendChild(opt);
          });
          // Restore selection or pick first
          if (_selectedSyncGroupView && groups.some((g) => g.id === _selectedSyncGroupView)) {
            groupSelector.value = _selectedSyncGroupView;
          } else {
            _selectedSyncGroupView = groups[0].id;
            groupSelector.value = _selectedSyncGroupView;
          }
        }
        if (!groupSelector._bound) {
          groupSelector._bound = true;
          groupSelector.addEventListener('change', () => {
            _selectedSyncGroupView = groupSelector.value;
            renderSelectedGroupCard();
          });
        }
      }

      if (groups.length === 0) {
        syncGroupsList.innerHTML = data.is_super_admin
          ? '<p class="sync-loading">Групп пока нет. Нажмите «Создать группу».</p>'
          : '<p class="sync-loading">Вы пока не состоите ни в одной группе.</p>';
        return;
      }

      renderSelectedGroupCard();
    };

    const renderSelectedGroupCard = () => {
      syncGroupsList.innerHTML = '';
      if (!_syncGroupsData) return;
      const groups = _syncGroupsData.groups || [];
      const g = groups.find((gr) => gr.id === _selectedSyncGroupView);
      if (!g) return;

      const userMap = _syncVtigerUsers.length
        ? Object.fromEntries(_syncVtigerUsers.map((u) => [String(u.id), u.display_name || u.user_name || u.username || String(u.id)]))
        : { ...vtigerUsersMap };

      const myRole = g.my_role || 'member';
      const canEditGroup = myRole === 'super_admin';
      const canManageMembers = myRole === 'super_admin' || myRole === 'admin';

      const card = document.createElement('div');
      card.className = 'sync-group-card';
      card.dataset.groupId = g.id;

      // --- Header ---
      const head = document.createElement('div');
      head.className = 'sync-group-card-head';
      const nameWrap = document.createElement('div');
      nameWrap.className = 'sync-group-name-wrap';
      const nameDisplay = document.createElement('span');
      nameDisplay.className = 'sync-group-name';
      nameDisplay.textContent = g.name || 'Без названия';
      nameWrap.appendChild(nameDisplay);

      const headActions = document.createElement('div');
      headActions.className = 'sync-group-head-actions';

      if (canEditGroup) {
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'sync-group-name-input';
        nameInput.value = g.name || '';
        nameInput.placeholder = 'Название группы';
        nameWrap.appendChild(nameInput);

        const saveNameBtn = document.createElement('button');
        saveNameBtn.type = 'button';
        saveNameBtn.className = 'btn-dock btn-dock-sm btn-dock-secondary sync-group-save-name';
        saveNameBtn.textContent = 'Сохранить';
        saveNameBtn.style.display = 'none';
        headActions.appendChild(saveNameBtn);

        nameDisplay.addEventListener('click', () => {
          nameDisplay.style.display = 'none';
          nameInput.style.display = 'block';
          nameInput.focus();
          saveNameBtn.style.display = 'inline-block';
        });
        saveNameBtn.addEventListener('click', async () => {
          const newName = nameInput.value.trim();
          if (!newName) return;
          saveNameBtn.disabled = true;
          try {
            const res = await apiFetch(`${authEndpoint}?action=sync-group-update`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ group_id: g.id, name: newName }),
            }, dependencies);
            const d = await res.json().catch(() => ({}));
            if (d.error) showSyncError(d.error);
            else refreshSyncGroups();
          } catch (e) { showSyncError('Ошибка'); }
          saveNameBtn.disabled = false;
        });

        const deleteGroupBtn = document.createElement('button');
        deleteGroupBtn.type = 'button';
        deleteGroupBtn.className = 'btn-dock btn-dock-sm btn-dock-danger sync-group-delete';
        deleteGroupBtn.textContent = 'Удалить';
        deleteGroupBtn.title = 'Удалить группу';
        headActions.appendChild(deleteGroupBtn);
        deleteGroupBtn.addEventListener('click', async () => {
          if (!confirm('Удалить группу «' + (g.name || '') + '» и всех участников?')) return;
          deleteGroupBtn.disabled = true;
          try {
            const res = await apiFetch(`${authEndpoint}?action=sync-group-delete`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ group_id: g.id }),
            }, dependencies);
            const d = await res.json().catch(() => ({}));
            if (d.error) showSyncError(d.error);
            else { _selectedSyncGroupView = null; refreshSyncGroups(); }
          } catch (e) { showSyncError('Ошибка'); }
          deleteGroupBtn.disabled = false;
        });
      }

      // Role badge
      const roleBadge = document.createElement('span');
      roleBadge.className = 'sync-group-role-badge sync-role-' + myRole;
      roleBadge.textContent = myRole === 'super_admin' ? 'супер-админ' : myRole === 'admin' ? 'админ' : 'участник';
      headActions.appendChild(roleBadge);

      head.appendChild(nameWrap);
      head.appendChild(headActions);
      card.appendChild(head);

      // --- Members list ---
      const ul = document.createElement('ul');
      ul.className = 'sync-group-members';
      (g.members || []).forEach((m) => {
        const li = document.createElement('li');
        li.className = 'sync-member-row';
        const memberLabel = document.createElement('span');
        memberLabel.textContent = userMap[m.vtiger_user_id] || m.vtiger_user_id;
        li.appendChild(memberLabel);

        if (canManageMembers) {
          const roleSelect = document.createElement('select');
          roleSelect.className = 'sync-member-role';
          roleSelect.innerHTML = '<option value="member">участник</option><option value="admin">админ</option>';
          roleSelect.value = m.role || 'member';
          li.appendChild(roleSelect);
          roleSelect.addEventListener('change', async () => {
            try {
              const res = await apiFetch(`${authEndpoint}?action=sync-group-update-member`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ member_id: m.id, role: roleSelect.value }),
              }, dependencies);
              const d = await res.json().catch(() => ({}));
              if (d.error) { showSyncError(d.error); refreshSyncGroups(); }
            } catch (e) { showSyncError('Ошибка'); }
          });

          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'sync-member-remove';
          removeBtn.textContent = '×';
          removeBtn.title = 'Удалить из группы';
          li.appendChild(removeBtn);
          removeBtn.addEventListener('click', async () => {
            if (!confirm('Удалить из группы?')) return;
            try {
              const res = await apiFetch(`${authEndpoint}?action=sync-group-remove-member`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ member_id: m.id }),
              }, dependencies);
              const d = await res.json().catch(() => ({}));
              if (d.error) showSyncError(d.error);
              else refreshSyncGroups();
            } catch (e) { showSyncError('Ошибка'); }
          });
        } else {
          const roleSpan = document.createElement('span');
          roleSpan.className = 'sync-member-role-label';
          roleSpan.textContent = m.role === 'admin' ? 'админ' : 'участник';
          li.appendChild(roleSpan);
        }

        ul.appendChild(li);
      });
      card.appendChild(ul);

      // --- Add member row (super_admin / admin only) ---
      if (canManageMembers && _syncVtigerUsers.length > 0) {
        const addRow = document.createElement('div');
        addRow.className = 'sync-group-add-row';
        const userSelect = document.createElement('select');
        userSelect.className = 'sync-add-user-select';
        userSelect.innerHTML = '<option value="">— выбрать пользователя —</option>';
        _syncVtigerUsers.forEach((u) => {
          const alreadyIn = (g.members || []).some((mem) => String(mem.vtiger_user_id) === String(u.id));
          if (!alreadyIn) {
            const opt = document.createElement('option');
            opt.value = String(u.id);
            opt.textContent = u.display_name || u.user_name || u.username || u.id;
            userSelect.appendChild(opt);
          }
        });
        const roleAddSelect = document.createElement('select');
        roleAddSelect.className = 'sync-add-role';
        roleAddSelect.innerHTML = '<option value="member">участник</option><option value="admin">админ</option>';
        const addMemberBtn = document.createElement('button');
        addMemberBtn.type = 'button';
        addMemberBtn.className = 'btn-dock btn-dock-sm btn-dock-primary';
        addMemberBtn.textContent = 'Добавить';
        addRow.appendChild(userSelect);
        addRow.appendChild(roleAddSelect);
        addRow.appendChild(addMemberBtn);
        addMemberBtn.addEventListener('click', async () => {
          const vid = userSelect.value;
          if (!vid) return;
          addMemberBtn.disabled = true;
          try {
            const res = await apiFetch(`${authEndpoint}?action=sync-group-add-member`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ group_id: g.id, vtiger_user_id: vid, role: roleAddSelect.value }),
            }, dependencies);
            const d = await res.json().catch(() => ({}));
            if (d.error) showSyncError(d.error);
            else refreshSyncGroups();
          } catch (e) { showSyncError('Ошибка'); }
          addMemberBtn.disabled = false;
        });
        card.appendChild(addRow);
      }

      syncGroupsList.appendChild(card);
    };

    async function saveCrmSyncOtherUsersFromUI() {
      const list = document.getElementById('crmSyncOtherUsersList');
      if (!list) return;
      const next = {};
      list.querySelectorAll('.crm-sync-other-user-row').forEach((row) => {
        const uid = row.dataset.userId;
        if (!uid) return;
        const enabled = row.querySelector('.crm-sync-other-enabled')?.checked === true;
        const types = [...(row.querySelectorAll('.crm-sync-other-activity-type:checked') || [])].map((cb) => cb.value);
        const statuses = [...(row.querySelectorAll('.crm-sync-other-event-status:checked') || [])].map((cb) => cb.value);
        const periodEl = row.querySelector('.crm-sync-other-period');
        const autoLoadEl = row.querySelector('.crm-sync-other-autoload');
        const intervalEl = row.querySelector('.crm-sync-other-interval');
        next[uid] = {
          enabled,
          activityTypes: types.length ? types : CRM_SYNC_ACTIVITY_VALUES,
          eventStatuses: statuses.length ? statuses : CRM_SYNC_STATUS_VALUES,
          period: periodEl?.value || 'month',
          autoLoad: autoLoadEl?.checked === true,
          autoLoadIntervalMinutes: Math.max(5, Math.min(60, parseInt(intervalEl?.value, 10) || 15)),
        };
      });
      setCrmSyncOtherUsers(next);
      await chrome.storage.sync.set({ crmSyncOtherUsers: next });
      if (Object.values(next).some((o) => o && o.enabled)) {
        const { loadGroups } = await import('./groups.js');
        await loadGroups(dependencies);
      }
      if (dependencies.applyAutoLoad) await dependencies.applyAutoLoad(dependencies);
      if (dependencies.loadTasks) {
        await dependencies.loadTasks(dependencies);
      } else {
        const tasksModule = await import('./tasks.js');
        const { renderTasks } = await import('./render.js');
        await tasksModule.loadTasks({
          loadMergedTasks: tasksModule.loadMergedTasks,
          renderTasks,
        });
      }
    }

    function renderCrmGroupMembersSyncSection(data, vtigerUsers = []) {
      const selectEl = document.getElementById('crmSyncSourceGroupSelect');
      const listEl = document.getElementById('crmSyncOtherUsersList');
      if (!selectEl || !listEl) return;
      const groups = data.groups || [];
      const adminGroups = groups.filter((g) => g.my_role === 'admin' || g.my_role === 'super_admin');
      const myUserId = data.my_user_id != null ? String(data.my_user_id) : (window._currentVtigerUserId || '');
      const userMap = {};
      vtigerUsers.forEach((u) => { userMap[String(u.id)] = u.display_name || u.user_name || u.username || String(u.id); });

      selectEl.innerHTML = '<option value="">— выберите группу —</option>';
      adminGroups.forEach((g) => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = g.name || 'Без названия';
        selectEl.appendChild(opt);
      });
      const savedSourceId = crmSyncSourceGroupId && adminGroups.some((g) => g.id === crmSyncSourceGroupId) ? crmSyncSourceGroupId : (adminGroups[0]?.id || '');
      selectEl.value = savedSourceId || (adminGroups[0]?.id || '');
      if (!selectEl._bound) {
        selectEl._bound = true;
        selectEl.addEventListener('change', async () => {
          const id = selectEl.value || '';
          setCrmSyncSourceGroupId(id);
          await chrome.storage.sync.set({ crmSyncSourceGroupId: id });
          renderCrmGroupMembersSyncSection(data, vtigerUsers);
        });
      }

      const selectedGroup = adminGroups.find((g) => g.id === selectEl.value);
      const members = (selectedGroup?.members || []).filter((m) => String(m.vtiger_user_id) !== myUserId);
      const others = crmSyncOtherUsers && typeof crmSyncOtherUsers === 'object' ? crmSyncOtherUsers : {};

      listEl.innerHTML = '';
      if (members.length === 0) {
        listEl.innerHTML = '<p class="sync-hint">В выбранной группе нет других участников или выберите группу.</p>';
        return;
      }
      members.forEach((m) => {
        const uid = String(m.vtiger_user_id);
        const displayName = userMap[uid] || uid;
        const opts = others[uid] || {};
        const row = document.createElement('div');
        row.className = 'crm-sync-other-user-row';
        row.dataset.userId = uid;
        const types = Array.isArray(opts.activityTypes) && opts.activityTypes.length ? opts.activityTypes : CRM_SYNC_ACTIVITY_VALUES;
        const statuses = Array.isArray(opts.eventStatuses) && opts.eventStatuses.length ? opts.eventStatuses : CRM_SYNC_STATUS_VALUES;
        const typesSet = new Set(types);
        const statusesSet = new Set(statuses);
        row.innerHTML = `
          <div class="crm-sync-other-user-head">
            <label class="crm-sync-other-user-label">
              <input type="checkbox" class="crm-sync-other-enabled" ${opts.enabled ? ' checked' : ''} />
              <span>${escapeHtml(displayName)}</span>
            </label>
            <button type="button" class="crm-sync-other-toggle${opts.enabled ? ' collapsed' : ''}" style="display: ${opts.enabled ? '' : 'none'}" aria-label="Свернуть/развернуть настройки">
              <svg class="crm-sync-other-toggle-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
          <div class="crm-sync-other-user-filters" style="display: none">
            <div class="sync-filters-row">
              <div class="field sync-filter-col">
                <span class="sync-filter-label">По типу:</span>
                <div class="sync-checkbox-group">
                  ${CRM_SYNC_ACTIVITY_VALUES.map((v) => `<label class="sync-checkbox-row"><input type="checkbox" class="crm-sync-other-activity-type" value="${escapeHtml(v)}" ${typesSet.has(v) ? ' checked' : ''} /> ${escapeHtml(({ Call: 'Звонок', Meeting: 'Встреча', Chat: 'Чат', 'Выполнить': 'Выполнить', 'Письмо': 'Письмо' })[v] || v)}</label>`).join('')}
                </div>
              </div>
              <div class="field sync-filter-col">
                <span class="sync-filter-label">По статусу:</span>
                <div class="sync-checkbox-group">
                  ${['Planned', 'Held', 'Not Held', 'В работе'].map((v) => `<label class="sync-checkbox-row"><input type="checkbox" class="crm-sync-other-event-status" value="${escapeHtml(v)}" ${statusesSet.has(v) ? ' checked' : ''} /> ${escapeHtml({ Planned: 'Запланировано', Held: 'Выполнено', 'Not Held': 'Отменено', 'В работе': 'В работе' }[v] || v)}</label>`).join('')}
                </div>
              </div>
            </div>
            <div class="field row">
              <label>Автообновление</label>
              <input type="checkbox" class="crm-sync-other-autoload" ${opts.autoLoad ? ' checked' : ''} />
            </div>
            <div class="field">
              <label>Интервал</label>
              <select class="crm-sync-other-interval period-select">
                <option value="5" ${(opts.autoLoadIntervalMinutes || 15) === 5 ? ' selected' : ''}>5 мин</option>
                <option value="15" ${(opts.autoLoadIntervalMinutes || 15) === 15 ? ' selected' : ''}>15 мин</option>
                <option value="30" ${(opts.autoLoadIntervalMinutes || 15) === 30 ? ' selected' : ''}>30 мин</option>
                <option value="60" ${(opts.autoLoadIntervalMinutes || 15) === 60 ? ' selected' : ''}>1 час</option>
              </select>
            </div>
            <div class="field">
              <label>Период</label>
              <select class="crm-sync-other-period period-select">
                <option value="today" ${(opts.period || 'month') === 'today' ? ' selected' : ''}>Сегодня</option>
                <option value="week" ${(opts.period || 'month') === 'week' ? ' selected' : ''}>Неделя</option>
                <option value="month" ${(opts.period || 'month') === 'month' ? ' selected' : ''}>Месяц</option>
                <option value="3months" ${(opts.period || 'month') === '3months' ? ' selected' : ''}>3 месяца</option>
                <option value="6months" ${(opts.period || 'month') === '6months' ? ' selected' : ''}>6 месяцев</option>
                <option value="year" ${(opts.period || 'month') === 'year' ? ' selected' : ''}>Год</option>
              </select>
            </div>
          </div>
        `;
        listEl.appendChild(row);
        const filtersBlock = row.querySelector('.crm-sync-other-user-filters');
        const toggleBtn = row.querySelector('.crm-sync-other-toggle');
        row.querySelector('.crm-sync-other-enabled')?.addEventListener('change', (e) => {
          if (toggleBtn) toggleBtn.style.display = e.target.checked ? '' : 'none';
          if (filtersBlock) filtersBlock.style.display = e.target.checked ? '' : 'none';
          if (toggleBtn) toggleBtn.classList.remove('collapsed');
          saveCrmSyncOtherUsersFromUI();
        });
        if (toggleBtn) {
          toggleBtn.addEventListener('click', () => {
            const isCollapsed = toggleBtn.classList.toggle('collapsed');
            if (filtersBlock) filtersBlock.style.display = isCollapsed ? 'none' : '';
          });
        }
        row.querySelectorAll('.crm-sync-other-activity-type').forEach((el) => el.addEventListener('change', saveCrmSyncOtherUsersFromUI));
        row.querySelectorAll('.crm-sync-other-event-status').forEach((el) => el.addEventListener('change', saveCrmSyncOtherUsersFromUI));
        row.querySelector('.crm-sync-other-period')?.addEventListener('change', saveCrmSyncOtherUsersFromUI);
        row.querySelector('.crm-sync-other-autoload')?.addEventListener('change', saveCrmSyncOtherUsersFromUI);
        row.querySelector('.crm-sync-other-interval')?.addEventListener('change', saveCrmSyncOtherUsersFromUI);
      });
    }

    const hasCreds = vtigerCredentials && vtigerCredentials.username && vtigerCredentials.password;
    if (!hasCreds) {
      if (syncGroupsLoading) syncGroupsLoading.style.display = 'none';
      showSyncError('Чтобы видеть группы из Supabase, войдите по логину и паролю CRM.');
    } else {
      if (syncGroupsLoading) syncGroupsLoading.style.display = 'block';
      apiFetch(`${authEndpoint}?action=sync-groups`, {}, dependencies)
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          return { res, data };
        })
        .then(async ({ res, data }) => {
          if (syncGroupsLoading) syncGroupsLoading.style.display = 'none';
          if (!res.ok) {
            showSyncError(data.error || data.message || `Ошибка ${res.status}`);
            renderSyncGroups(data);
            return;
          }
          setUserSyncGroups(data.is_super_admin ? (data.groups || []) : (data.groups || []).filter(g => g.my_role));
          if (dependencies.updateFormMode) dependencies.updateFormMode();
          if (data.groups && data.groups.length === 1 && !selectedSyncGroupId) {
            await saveSelectedSyncGroupId(data.groups[0].id);
          }
          const hasManageRole2 = data.is_super_admin || (data.groups || []).some((g) => g.my_role === 'super_admin' || g.my_role === 'admin');
          if (hasManageRole2) {
            try {
              const users = await fetchUsers(dependencies);
              const uMap2 = {};
              users.forEach((u) => { uMap2[String(u.id)] = u.display_name || u.user_name || u.username || String(u.id); });
              setVtigerUsersMap(uMap2);
              renderSyncGroups(data, users);
              const crmGroupSection2 = document.getElementById('crmGroupMembersSyncSection');
              if (crmGroupSection2) crmGroupSection2.style.display = '';
              renderCrmGroupMembersSyncSection(data, users);
            } catch (e) {
              renderSyncGroups(data, []);
            }
          } else {
            const crmGroupSection2 = document.getElementById('crmGroupMembersSyncSection');
            if (crmGroupSection2) crmGroupSection2.style.display = 'none';
            try {
              const users = await fetchUsers(dependencies);
              const uMap2 = {};
              users.forEach((u) => { uMap2[String(u.id)] = u.display_name || u.user_name || u.username || String(u.id); });
              setVtigerUsersMap(uMap2);
            } catch (e) { /* ok */ }
            renderSyncGroups(data);
          }
        })
        .catch(() => {
          if (syncGroupsLoading) syncGroupsLoading.style.display = 'none';
          showSyncError('Не удалось загрузить группы.');
          renderSyncGroups({ groups: [] });
        });
    }
    if (syncGroupCreateBtn && !syncGroupCreateBtn._bound) {
      syncGroupCreateBtn._bound = true;
      syncGroupCreateBtn.addEventListener('click', async () => {
        const name = prompt('Название группы:');
        if (name == null || !name.trim()) return;
        syncGroupCreateBtn.disabled = true;
        showSyncError('');
        try {
          const res = await apiFetch(`${authEndpoint}?action=sync-group-create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim() }),
          }, dependencies);
          const data = await res.json().catch(() => ({}));
          if (data.error) showSyncError(data.error);
          else refreshSyncGroups();
        } catch (e) { showSyncError('Ошибка'); }
        syncGroupCreateBtn.disabled = false;
      });
    }
  }

  if (authed) {
    if (authStatusIcon) {
      authStatusIcon.innerHTML = '<path d="M20 6L9 17l-5-5"/>';
      authStatusIcon.setAttribute('stroke', 'currentColor');
    }
    if (authStatusLabel) authStatusLabel.textContent = 'Авторизован';
    if (authStatusUser) {
      const username = user && (user.username || user.email);
      authStatusUser.textContent = username || '';
      authStatusUser.style.display = username ? 'block' : 'none';
    }
  } else {
    const loginUsername = _formEl('loginUsername');
    const loginPassword = _formEl('loginPassword');
    const loginPasswordLabel = document.getElementById('loginPasswordLabel');
    const loginHint = document.getElementById('loginHint');
    if (authMode === 'vtiger') {
      if (loginPasswordLabel) loginPasswordLabel.textContent = 'Access Key';
      if (loginPassword) { loginPassword.placeholder = 'Access Key'; loginPassword.type = 'password'; }
      if (loginHint) loginHint.textContent = 'Логин и Access Key из CRM (Настройки → Сменить Access Key).';
    } else if (authMode === 'vtiger_password') {
      if (loginPasswordLabel) loginPasswordLabel.textContent = 'Пароль';
      if (loginPassword) { loginPassword.placeholder = 'Пароль'; loginPassword.type = 'password'; }
      if (loginHint) loginHint.textContent = 'Логин и пароль как при входе в веб-интерфейс Vtiger.';
    } else {
      if (loginPasswordLabel) loginPasswordLabel.textContent = 'Пароль';
      if (loginPassword) { loginPassword.placeholder = 'Пароль'; loginPassword.type = 'password'; }
      if (loginHint) loginHint.textContent = 'Введите логин и пароль для доступа к CRM.';
    }
  }

  if (logoutBtn) logoutBtn.style.display = authed ? 'block' : 'none';
  if (syncPeriodEl) syncPeriodEl.value = syncPeriod || 'month';

  const autoLoadEl = _formEl('autoLoadEnabled');
  const autoLoadIntervalEl = document.getElementById('autoLoadIntervalMinutes');
  const { autoLoadEnabled: savedAutoLoad, autoLoadIntervalMinutes: savedInterval, crmSyncActivityTypes: savedTypes, crmSyncEventStatuses: savedStatuses } = await chrome.storage.sync.get(['autoLoadEnabled', 'autoLoadIntervalMinutes', 'crmSyncActivityTypes', 'crmSyncEventStatuses']);
  if (autoLoadEl) autoLoadEl.checked = savedAutoLoad === true;
  if (autoLoadIntervalEl) autoLoadIntervalEl.value = String(savedInterval && savedInterval >= 5 && savedInterval <= 60 ? savedInterval : 15);
  const typesSet = new Set(Array.isArray(savedTypes) && savedTypes.length ? savedTypes : CRM_SYNC_ACTIVITY_VALUES);
  const statusesSet = new Set(Array.isArray(savedStatuses) && savedStatuses.length ? savedStatuses : CRM_SYNC_STATUS_VALUES);
  document.querySelectorAll('.crm-sync-activity-type').forEach((cb) => { cb.checked = typesSet.has(cb.value); });
  document.querySelectorAll('.crm-sync-event-status').forEach((cb) => { cb.checked = statusesSet.has(cb.value); });
  const verEl = document.getElementById('settingsVersion');
  if (verEl) {
    try {
      verEl.textContent = 'Версия ' + (chrome.runtime.getManifest().version || '');
    } catch (_) { }
  }
  if (renderGroupsManagementList) await renderGroupsManagementList();
}

function setupVersionClick() {
  const settingsPane = document.getElementById('tabSettings');
  if (!settingsPane) return;
  settingsPane.addEventListener('click', (e) => {
    if (e.target.id === 'settingsVersion' || e.target.closest('#settingsVersion')) {
      e.preventDefault();
      showChangelogModal();
    }
  });
  settingsPane.addEventListener('keydown', (e) => {
    const ver = document.getElementById('settingsVersion');
    if (ver && document.activeElement === ver && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      showChangelogModal();
    }
  });
}

export function setupSettingsTab(dependencies = {}) {
  const logoutBtn = _formEl('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (dependencies.stopAutoLoad) dependencies.stopAutoLoad();
      await clearAuth(dependencies);
      await updateSettingsUI();
    });
  }

  const loginSubmitBtn = _formEl('loginSubmitBtn');
  if (loginSubmitBtn) {
    loginSubmitBtn.addEventListener('click', async () => {
      const usernameEl = _formEl('loginUsername');
      const passwordEl = _formEl('loginPassword');
      if (!usernameEl || !passwordEl) return;
      const username = usernameEl.value.trim();
      const password = passwordEl.value;
      if (!username || !password) {
        showLoginError('Введите логин и пароль');
        return;
      }
      const success = await login(username, password, dependencies);
      if (success) {
        usernameEl.value = '';
        passwordEl.value = '';
      }
    });
  }

  const loginUsername = _formEl('loginUsername');
  const loginPassword = _formEl('loginPassword');
  if (loginUsername) {
    loginUsername.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') loginPassword?.focus();
    });
  }
  if (loginPassword) {
    loginPassword.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        const usernameEl = _formEl('loginUsername');
        if (!usernameEl) return;
        const username = usernameEl.value.trim();
        const password = loginPassword.value;
        if (!username || !password) {
          showLoginError('Введите логин и пароль');
          return;
        }
        const success = await login(username, password, dependencies);
        if (success) {
          usernameEl.value = '';
          loginPassword.value = '';
        }
      }
    });
  }

  document.querySelectorAll('.theme-option').forEach((b) => {
    b.addEventListener('click', async () => {
      const t = b.dataset.theme;
      await setTheme(t);
      await updateSettingsUI();
    });
  });

  const groupsToggle = document.getElementById('groupsManagementToggle');
  const groupsBody = document.getElementById('groupsManagementBody');
  if (groupsToggle && groupsBody) {
    groupsToggle.addEventListener('click', () => {
      const expanded = groupsToggle.getAttribute('aria-expanded') === 'true';
      groupsToggle.setAttribute('aria-expanded', !expanded);
      groupsBody.hidden = expanded;
    });
  }

  const groupsList = document.getElementById('groupsManagementList');
  if (groupsList) {
    groupsList.addEventListener('click', async (e) => {
      const renameBtn = e.target.closest('.groups-management-rename');
      const deleteBtn = e.target.closest('.groups-management-delete');
      const restoreBtn = e.target.closest('.groups-management-restore-btn');
      const item = e.target.closest('.groups-management-item');
      if (!item) return;
      const groupName = item.dataset.group;
      if (restoreBtn) {
        await restoreGroup(groupName, dependencies);
        if (renderGroupsManagementList) await renderGroupsManagementList();
      } else if (renameBtn) {
        const newName = prompt('Новое название группы:', groupName);
        if (newName && newName.trim() && newName.trim() !== groupName) {
          await renameGroup(groupName, newName.trim(), dependencies);
          if (renderGroupsManagementList) await renderGroupsManagementList();
        }
      } else if (deleteBtn) {
        const msg = groupName === 'CRM'
          ? 'Удалить группу CRM из списка? Локально. Задачи CRM при следующей загрузке снова появятся, если группу восстановить.'
          : `Удалить группу «${groupName}» и все её задачи? Задачи будут удалены только локально.`;
        if (confirm(msg)) {
          await deleteGroup(groupName, dependencies);
          if (renderGroupsManagementList) await renderGroupsManagementList();
        }
      }
    });
  }

  const syncPeriodEl = _formEl('syncPeriod');
  const syncLoadBtn = _formEl('syncLoadBtn');
  const autoLoadEl = _formEl('autoLoadEnabled');
  const autoLoadIntervalEl = document.getElementById('autoLoadIntervalMinutes');
  if (syncPeriodEl) {
    syncPeriodEl.addEventListener('change', async () => {
      const val = syncPeriodEl.value || 'month';
      setSyncPeriod(val);
      await chrome.storage.sync.set({ syncPeriod: val });
    });
  }
  const saveCrmSyncFilters = async () => {
    const types = [...document.querySelectorAll('.crm-sync-activity-type:checked')].map((cb) => cb.value);
    const statuses = [...document.querySelectorAll('.crm-sync-event-status:checked')].map((cb) => cb.value);
    await chrome.storage.sync.set({ crmSyncActivityTypes: types, crmSyncEventStatuses: statuses });
    setCrmSyncActivityTypes(types);
    setCrmSyncEventStatuses(statuses);
  };
  document.querySelectorAll('.crm-sync-activity-type').forEach((cb) => {
    cb.addEventListener('change', saveCrmSyncFilters);
  });
  document.querySelectorAll('.crm-sync-event-status').forEach((cb) => {
    cb.addEventListener('change', saveCrmSyncFilters);
  });
  if (autoLoadEl) {
    autoLoadEl.addEventListener('change', async () => {
      const enabled = autoLoadEl.checked;
      await chrome.storage.sync.set({ autoLoadEnabled: enabled });
      if (dependencies.applyAutoLoad) await dependencies.applyAutoLoad(dependencies);
    });
  }
  if (autoLoadIntervalEl) {
    autoLoadIntervalEl.addEventListener('change', async () => {
      const minutes = Math.max(5, Math.min(60, parseInt(autoLoadIntervalEl.value, 10) || 15));
      await chrome.storage.sync.set({ autoLoadIntervalMinutes: minutes });
      if (dependencies.applyAutoLoad) await dependencies.applyAutoLoad(dependencies);
    });
  }
  const notifyEl = _formEl('notifyEnabled');
  if (notifyEl) {
    notifyEl.addEventListener('change', async () => {
      await chrome.storage.sync.set({ notifyEnabled: notifyEl.checked });
    });
  }
  if (syncLoadBtn) {
    syncLoadBtn.addEventListener('click', async () => {
      showSyncStatus('');
      const { authEndpoint } = await import('./config.js');
      if (!authEndpoint) {
        showSyncStatus('Endpoint не настроен.', 'error');
        return;
      }
      if (!isAuthed()) {
        showSyncStatus('Сначала войдите в систему.', 'error');
        return;
      }
      const period = (syncPeriodEl && syncPeriodEl.value) || syncPeriod || 'month';
      setSyncPeriod(period);
      const types = [...document.querySelectorAll('.crm-sync-activity-type:checked')].map((cb) => cb.value);
      const statuses = [...document.querySelectorAll('.crm-sync-event-status:checked')].map((cb) => cb.value);
      await chrome.storage.sync.set({ syncPeriod: period, crmSyncActivityTypes: types, crmSyncEventStatuses: statuses });
      setCrmSyncActivityTypes(types);
      setCrmSyncEventStatuses(statuses);

      // Автоматически добавляем CRM в видимые группы (если пользователь не удалял её)
      const { visibleGroups: currentVisibleGroups, setVisibleGroups } = await import('./config.js');
      const { loadUserHiddenGroups } = await import('./storage.js');
      const hidden = await loadUserHiddenGroups();
      if (!hidden.includes('CRM') && !currentVisibleGroups.includes('CRM')) {
        const newVisibleGroups = [...currentVisibleGroups, 'CRM'];
        setVisibleGroups(newVisibleGroups);
        await chrome.storage.sync.set({ visibleGroups: newVisibleGroups });
        if (dependencies.renderGroupDropdownList) dependencies.renderGroupDropdownList(dependencies);
      }

      await (dependencies.saveDeletedCrmTasks || saveDeletedCrmTasks)([]);
      const result = await (dependencies.loadTasks || loadTasks)(dependencies);
      if (result?.crmCount > 0 && result?.crmStorageFormatted) {
        showSyncStatus(`Задачи загружены. CRM: ${result.crmCount} задач, ~${result.crmStorageFormatted} для кэша.`, 'success');
      } else {
        showSyncStatus('Задачи загружены.', 'success');
      }
    });
  }

  const clearAllTasksBtn = _formEl('clearAllTasksBtn');
  if (clearAllTasksBtn) {
    clearAllTasksBtn.addEventListener('click', async () => {
      const merged = await (dependencies.loadMergedTasks || loadMergedTasks)(dependencies);
      if (merged.length === 0) {
        showSyncStatus('Нет задач для очистки.', 'error');
        return;
      }

      const tasksByGroup = {};
      merged.forEach(task => {
        const group = task.group || 'Личные';
        if (!tasksByGroup[group]) {
          tasksByGroup[group] = [];
        }
        tasksByGroup[group].push(task);
      });

      const groupNames = Object.keys(tasksByGroup);
      // console.log('[Массовое удаление] Группы с задачами:', groupNames);
      const selectedGroups = await (dependencies.showGroupSelectionModal || showGroupSelectionModal)(groupNames, tasksByGroup);
      // console.log('[Массовое удаление] Выбранные группы:', selectedGroups);
      if (!selectedGroups || selectedGroups.length === 0) {
        // console.log('[Массовое удаление] Группы не выбраны, отмена');
        return;
      }

      let totalToDelete = 0;
      selectedGroups.forEach(group => {
        totalToDelete += tasksByGroup[group].length;
      });

      if (!confirm(`Вы уверены, что хотите удалить ${totalToDelete} задач из групп: ${selectedGroups.join(', ')}? Это действие нельзя отменить.`)) {
        return;
      }

      try {
        const loadDeleted = dependencies.loadDeletedCrmTasks || loadDeletedCrmTasks;
        const saveDeleted = dependencies.saveDeletedCrmTasks || saveDeletedCrmTasks;

        for (const group of selectedGroups) {
          // console.log('[Массовое удаление] Обработка группы:', group, 'задач:', tasksByGroup[group]?.length);
          if (group === 'CRM') {
            const crmTasks = tasksByGroup[group];
            const idsToMark = new Set();
            for (const task of crmTasks) {
              const raw = task.id.toString();
              const taskId = raw.replace(/^crm_/, '');
              idsToMark.add(taskId);
            }
            // console.log('[Массовое удаление CRM] ID для пометки:', [...idsToMark]);
            if (idsToMark.size === 0) {
              // console.log('[Массовое удаление CRM] Нет ID для пометки, пропускаем');
              continue;
            }

            const deleted = await loadDeleted();
            // console.log('[Массовое удаление CRM] Текущие удаленные ID (количество):', deleted.length);
            const deletedSet = new Set(deleted.map((d) => d.toString()));
            let added = 0;
            for (const id of idsToMark) {
              const s = id.toString();
              if (!deletedSet.has(s)) {
                deleted.push(s);
                deletedSet.add(s);
                added++;
              }
            }
            if (added > 0) {
              try {
                await saveDeleted(deleted);
                for (const id of idsToMark) await removeCrmTaskFromCache(id);
                // console.log('[Массовое удаление CRM] помечено:', added, 'ID:', [...idsToMark].slice(0, 10), '... (показано первые 10)');
              } catch (err) {
                // console.error('[Массовое удаление CRM] Ошибка сохранения:', err);
                // Если ошибка квоты, пробуем сохранить только новые ID
                if (err.message && err.message.includes('quota')) {
                  // console.warn('[Массовое удаление CRM] Превышен лимит, сохраняем только новые ID');
                  const newIds = [...idsToMark].filter(id => !deletedSet.has(id.toString()));
                  if (newIds.length > 0) {
                    const currentDeleted = await loadDeleted();
                    const combined = [...currentDeleted, ...newIds];
                    // Ограничиваем до последних 10000
                    const limited = combined.slice(-10000);
                    await saveDeleted(limited);
                    // console.log('[Массовое удаление CRM] Сохранено ограниченное количество:', limited.length);
                  }
                } else {
                  throw err;
                }
              }
            } else {
              // console.log('[Массовое удаление CRM] Все ID уже были помечены как удаленные');
            }
          } else {
            const personalTasks = await (dependencies.loadPersonalTasks || loadPersonalTasks)();
            const groupTasks = tasksByGroup[group];
            const taskIds = new Set(groupTasks.map((t) => t.id));
            // console.log('[Массовое удаление личных] Удаляем задачи с ID:', [...taskIds]);
            const filtered = personalTasks.filter((t) => !taskIds.has(t.id));
            // console.log('[Массовое удаление личных] Было:', personalTasks.length, 'стало:', filtered.length);
            await (dependencies.savePersonalTasks || savePersonalTasks)(filtered);
          }
        }

        if (dependencies.loadTasks) await dependencies.loadTasks(dependencies, { useCacheOnly: true });
        showSyncStatus(`Удалено ${totalToDelete} задач.`, 'success');
      } catch (err) {
        // console.error('[Массовое удаление]', err);
        showSyncStatus('Ошибка при очистке задач: ' + (err.message || 'неизвестная ошибка'), 'error');
      }
    });
  }

  setupVersionClick();
}

// Инициализация custom dropdown'ов для формы задач
export async function setupCustomDropdowns(dependencies = {}) {
  const { fetchEventStatuses: fetchStatuses, fetchActivityTypes: fetchTypes } = dependencies;

  // Инициализация dropdown для статуса
  const statusDropdown = document.getElementById('statusDropdown');
  if (statusDropdown) {
    const trigger = statusDropdown.querySelector('.custom-dropdown-trigger');
    const label = trigger?.querySelector('.dd-label');
    let statuses = [];

    if (trigger) {
      trigger.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (statuses.length === 0 && isAuthed() && authEndpoint) {
          try { statuses = await (fetchStatuses || fetchEventStatuses)(dependencies); } catch (_) { statuses = []; }
        }
        const opts = statuses.map(s => ({ value: s, label: getEventStatusLabel(s) }));
        if (opts.length === 0) opts.push({ value: '', label: 'Нет данных', disabled: true });
        const result = await openPickerModal({ title: 'Статус', options: opts, selectedValue: statusDropdown.dataset.value, parent: document.getElementById('taskFormModal') });
        if (result) {
          statusDropdown.dataset.value = result.value;
          if (label) label.textContent = result.label;
          toggleFormTaskResultVisibility(result.value);
          if (dependencies.updateCreateButtonState) dependencies.updateCreateButtonState(dependencies);
        }
      });
    }
  }

  // Инициализация dropdown для типа действия
  const actionTypeDropdown = document.getElementById('actionTypeDropdown');
  if (actionTypeDropdown) {
    const trigger = actionTypeDropdown.querySelector('.custom-dropdown-trigger');
    const label = trigger?.querySelector('.dd-label');
    let types = [];

    if (trigger) {
      trigger.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (types.length === 0 && isAuthed() && authEndpoint) {
          try { types = await (fetchTypes || fetchActivityTypes)(dependencies); } catch (_) { types = []; }
        }
        const opts = types.map(t => ({ value: t, label: getActivityTypeLabel(t) }));
        if (opts.length === 0) opts.push({ value: '', label: 'Нет данных', disabled: true });
        const result = await openPickerModal({ title: 'Тип действия', options: opts, selectedValue: actionTypeDropdown.dataset.value, parent: document.getElementById('taskFormModal') });
        if (result) {
          actionTypeDropdown.dataset.value = result.value;
          if (label) label.textContent = result.label;
          if (dependencies.updateCreateButtonState) dependencies.updateCreateButtonState(dependencies);
        }
      });
    }
  }

  // Инициализация dropdown для ответственного
  const responsibleDropdown = document.getElementById('responsibleDropdown');
  if (responsibleDropdown) {
    const trigger = responsibleDropdown.querySelector('.custom-dropdown-trigger');
    const label = trigger?.querySelector('.dd-label');
    let users = [];

    if (trigger) {
      trigger.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (users.length === 0 && isAuthed() && authEndpoint) {
          try { users = await fetchUsers(dependencies); } catch (_) { users = []; }
        }
        const opts = users.map(u => ({ value: String(u.id), label: u.display_name }));
        if (opts.length === 0) opts.push({ value: '', label: 'Нет данных', disabled: true });
        const result = await openPickerModal({ title: 'Ответственный', options: opts, selectedValue: responsibleDropdown.dataset.value, showSearch: true, fullscreen: true, parent: document.getElementById('taskFormModal') });
        if (result) {
          responsibleDropdown.dataset.value = result.value;
          if (label) label.textContent = result.label;
          if (dependencies.updateCreateButtonState) dependencies.updateCreateButtonState(dependencies);
        }
      });
    }
  }

  // Sync group dropdown (notes)
  const syncGroupDropdown = document.getElementById('syncGroupDropdown');
  if (syncGroupDropdown) {
    const trigger = syncGroupDropdown.querySelector('.custom-dropdown-trigger');
    const label = trigger?.querySelector('.dd-label');
    if (trigger) {
      trigger.addEventListener('click', async (e) => {
        e.stopPropagation();
        let { userSyncGroups } = await import('./config.js');
        if (userSyncGroups.length === 0) {
          await loadSyncGroupsForForm(dependencies);
          ({ userSyncGroups } = await import('./config.js'));
        }
        const opts = userSyncGroups.map(g => ({ value: String(g.id), label: g.name || 'Без названия' }));
        if (opts.length === 0) opts.push({ value: '', label: 'Нет доступных групп', disabled: true });
        const result = await openPickerModal({ title: 'Группа синхронизации', options: opts, selectedValue: syncGroupDropdown.dataset.value, parent: document.getElementById('taskFormModal') });
        if (result) {
          syncGroupDropdown.dataset.value = result.value;
          if (label) label.textContent = result.label;
          if (dependencies.updateCreateButtonState) dependencies.updateCreateButtonState(dependencies);
        }
      });
    }
  }
}

export async function editTask(id, tasks, dependencies = {}) {
  const task = tasks.find(t => t.id == id);
  if (!task) return;
  // Сбрасываем ошибки валидации от предыдущего создания
  clearFieldErrors();
  const themeEl = _formEl('taskTheme');
  const idEl = _formEl('taskId');
  if (themeEl) themeEl.value = task.text ?? '';
  if (idEl) idEl.value = task.id ?? '';
  const descEl = _formEl('taskDesc');
  if (descEl) descEl.value = (task.description != null ? String(task.description) : '') || '';
  const formGroup = task.group === CRM_GROUP_NAME ? 'CRM' : (task.group || '');
  if (dependencies.setFormGroupSelection) dependencies.setFormGroupSelection(formGroup);
  if (dependencies.renderFormGroupDropdownList) dependencies.renderFormGroupDropdownList(task.group || '');
  if (dependencies.updateFormMode) dependencies.updateFormMode();
  const formGroupPanel = _formEl('formGroupDropdownPanel');
  if (formGroupPanel) formGroupPanel.style.display = 'none';
  const formGroupWrap = document.getElementById('formGroupWrap');
  if (formGroupWrap) formGroupWrap.classList.add('form-group-locked');
  if (dependencies.resetDateTimePickers) dependencies.resetDateTimePickers();
  if (task.start && dependencies.setDateTimePickerValue) dependencies.setDateTimePickerValue('start', new Date(task.start));
  if (task.end && dependencies.setDateTimePickerValue) {
    dependencies.setDateTimePickerValue('end', new Date(task.end));
    if (!task.start) dependencies.setDateTimePickerValue('start', new Date(task.end));
  }

  if (isCrmForm() && dependencies.loadFormRelatedModules) {
    await dependencies.loadFormRelatedModules(dependencies);
  }
  const moduleInput = document.getElementById('formRelatedModule');
  const moduleLabel = document.getElementById('formRelatedModuleLabel');
  const selectedEl = document.getElementById('formRelatedSelected');
  const selectedLabel = selectedEl?.querySelector('.form-related-selected-label');
  const crmidEl = document.getElementById('formRelatedCrmid');
  const relatedSetype = task.related_setype || '';
  const relatedCrmid = task.related_crmid != null ? task.related_crmid : (task.parent_id != null ? task.parent_id : null);
  const relatedName = task.related_entity_name || '';
  if (moduleInput) moduleInput.value = relatedSetype;
  const mod = _formRelatedModulesList.find((m) => m.setype === relatedSetype);
  if (moduleLabel) moduleLabel.textContent = mod ? mod.label : (relatedSetype || 'Выберите модуль');
  if (crmidEl) crmidEl.value = relatedCrmid != null ? String(relatedCrmid) : '';
  if (relatedCrmid != null && (relatedName || relatedSetype)) {
    if (selectedLabel) selectedLabel.textContent = relatedName || `Запись #${relatedCrmid}`;
    if (selectedEl) selectedEl.style.display = 'flex';
  } else if (relatedCrmid != null) {
    if (selectedLabel) selectedLabel.textContent = `Запись #${relatedCrmid}`;
    if (selectedEl) selectedEl.style.display = 'flex';
  } else {
    if (selectedEl) selectedEl.style.display = 'none';
  }

  // Установка значений dropdown'ов статуса и типа действия (отображаем RU)
  const statusDropdown = document.getElementById('statusDropdown');
  if (statusDropdown) {
    const statusLabel = statusDropdown.querySelector('.dd-label');
    if (task.eventstatus) {
      statusDropdown.dataset.value = task.eventstatus;
      if (statusLabel) statusLabel.textContent = getEventStatusLabel(task.eventstatus) || task.eventstatus;
      toggleFormTaskResultVisibility(task.eventstatus);
    } else {
      statusDropdown.dataset.value = '';
      if (statusLabel) statusLabel.textContent = 'Выберите опцию';
      toggleFormTaskResultVisibility('');
    }
  }
  // Результат выполненных работ — только из task_result (cf_1209). Никогда не подставлять task.description (описание задачи).
  const formTaskResultEl = document.getElementById('formTaskResult');
  if (formTaskResultEl) {
    const val = task.task_result != null ? String(task.task_result).trim() : '';
    formTaskResultEl.value = val;
  }

  const actionTypeDropdown = document.getElementById('actionTypeDropdown');
  if (actionTypeDropdown) {
    const typeLabel = actionTypeDropdown.querySelector('.dd-label');
    if (task.activitytype) {
      actionTypeDropdown.dataset.value = task.activitytype;
      if (typeLabel) typeLabel.textContent = getActivityTypeLabel(task.activitytype) || task.activitytype;
    } else {
      actionTypeDropdown.dataset.value = '';
      if (typeLabel) typeLabel.textContent = 'Выберите опцию';
    }
  }

  const priorityEl = _formEl('taskPriority');
  if (priorityEl) {
    const isPriority = Number(task.priority) === 1 || Number(task.priority_task) === 1 || task.priority === '1' || task.priority_task === '1';
    priorityEl.checked = !!isPriority;
  }

  const responsibleDropdown = document.getElementById('responsibleDropdown');
  if (responsibleDropdown) {
    let respId = task.assigned_user_id != null && task.assigned_user_id !== '' ? task.assigned_user_id : task.user_id;
    // Fallback на текущего пользователя
    if (respId == null || respId === '') {
      respId = window._currentVtigerUserId || (user && user.id ? user.id : null);
    }
    if (respId != null && respId !== '') {
      const sid = String(respId);
      responsibleDropdown.dataset.value = sid;
      const label = responsibleDropdown.querySelector('.dd-label');
      const displayName = task.user_display_name || task.user_name || (vtigerUsersMap && vtigerUsersMap[sid]) || `Пользователь #${sid}`;
      if (label) label.textContent = displayName;
    } else {
      responsibleDropdown.dataset.value = '';
      const label = responsibleDropdown.querySelector('.dd-label');
      if (label) label.textContent = 'Выберите опцию';
    }
  }

  if (dependencies.openTaskFormModal) dependencies.openTaskFormModal();
  const head = document.querySelector('#taskFormModal .modal-head h2');
  if (head) head.textContent = 'Редактировать задачу';
  const submitBtn = _formEl('submitTaskBtn');
  if (submitBtn) submitBtn.textContent = 'Сохранить';
  if (themeEl) themeEl.focus();
}

export function resetForm(dependencies = {}) {
  _noteSegmentsForBatch = null;
  _sourceNoteId = null;
  const banner = document.getElementById('batchTaskBanner');
  if (banner) { banner.style.display = 'none'; banner.textContent = ''; }
  const dateTimeSectionContent = document.getElementById('dateTimeSectionContent');
  if (dateTimeSectionContent) dateTimeSectionContent.style.display = '';
  const batchDateTimeHint = document.getElementById('batchDateTimeHint');
  if (batchDateTimeHint) batchDateTimeHint.style.display = 'none';
  const form = _formEl('taskForm');
  const idEl = _formEl('taskId');
  const head = document.querySelector('#taskFormModal .modal-head h2');
  const submitBtn = _formEl('submitTaskBtn');
  const formGroupPanel = _formEl('formGroupDropdownPanel');
  if (form) form.reset();
  if (idEl) idEl.value = '';
  if (head) head.textContent = 'Новая задача';
  if (submitBtn) submitBtn.textContent = 'Создать';
  if (dependencies.setFormGroupSelection) dependencies.setFormGroupSelection('CRM');
  if (dependencies.renderFormGroupDropdownList) dependencies.renderFormGroupDropdownList();
  if (dependencies.updateFormGroupTriggerLabel) dependencies.updateFormGroupTriggerLabel();
  if (dependencies.updateFormMode) dependencies.updateFormMode();
  if (formGroupPanel) formGroupPanel.style.display = 'none';
  const formGroupWrap = document.getElementById('formGroupWrap');
  if (formGroupWrap) formGroupWrap.classList.remove('form-group-locked');
  if (dependencies.resetDateTimePickers) dependencies.resetDateTimePickers();

  const moduleInput = document.getElementById('formRelatedModule');
  const moduleLabel = document.getElementById('formRelatedModuleLabel');
  const modulePanel = document.getElementById('formRelatedModulePanel');
  if (moduleInput) moduleInput.value = '';
  if (moduleLabel) moduleLabel.textContent = 'Выберите модуль';
  if (modulePanel) modulePanel.style.display = 'none';
  clearFormRelatedSelection();
  if (isCrmForm() && dependencies.loadFormRelatedModules) dependencies.loadFormRelatedModules(dependencies);

  // Сброс dropdown'ов статуса и типа действия
  const statusDropdown = document.getElementById('statusDropdown');
  if (statusDropdown) {
    statusDropdown.dataset.value = '';
    const label = statusDropdown.querySelector('.dd-label');
    if (label) label.textContent = 'Выберите опцию';
    const panel = statusDropdown.querySelector('.custom-dropdown-panel');
    if (panel) panel.style.display = 'none';
  }

  const actionTypeDropdown = document.getElementById('actionTypeDropdown');
  if (actionTypeDropdown) {
    actionTypeDropdown.dataset.value = '';
    const label = actionTypeDropdown.querySelector('.dd-label');
    if (label) label.textContent = 'Выберите опцию';
    const panel = actionTypeDropdown.querySelector('.custom-dropdown-panel');
    if (panel) panel.style.display = 'none';
  }

  const responsibleDropdown = document.getElementById('responsibleDropdown');
  if (responsibleDropdown) {
    const isCrm = isCrmForm();
    const myUserId = (typeof window !== 'undefined' && window._currentVtigerUserId)
      ? String(window._currentVtigerUserId)
      : (user && user.id ? String(user.id) : '');
    if (isCrm && myUserId) {
      responsibleDropdown.dataset.value = myUserId;
      const label = responsibleDropdown.querySelector('.dd-label');
      if (label) label.textContent = 'Вы';
      const panel = responsibleDropdown.querySelector('.custom-dropdown-panel');
      if (panel) panel.style.display = 'none';
    } else {
      responsibleDropdown.dataset.value = '';
      const label = responsibleDropdown.querySelector('.dd-label');
      if (label) label.textContent = 'Выберите опцию';
      const panel = responsibleDropdown.querySelector('.custom-dropdown-panel');
      if (panel) panel.style.display = 'none';
    }
  }

  const syncGroupDropdown = document.getElementById('syncGroupDropdown');
  if (syncGroupDropdown) {
    syncGroupDropdown.dataset.value = '';
    const label = syncGroupDropdown.querySelector('.dd-label');
    if (label) label.textContent = 'Выберите группу';
  }

  const priorityEl = _formEl('taskPriority');
  if (priorityEl) priorityEl.checked = false;
  const formTaskResultWrap = document.getElementById('formTaskResultWrap');
  const formTaskResultEl = document.getElementById('formTaskResult');
  if (formTaskResultWrap) formTaskResultWrap.style.display = 'none';
  if (formTaskResultEl) formTaskResultEl.value = '';
  clearFieldErrors();
  if (dependencies.updateCreateButtonState) dependencies.updateCreateButtonState(dependencies);
}

const CREATE_FIELD_ERRORS = ['formThemeError', 'formDateTimeError', 'formDescError', 'formActivityTypeError', 'formStatusError', 'formResponsibleError', 'formTaskResultError', 'formSyncGroupError'];

/** Валидация формы создания: возвращает { valid, errors: [{ id, message }] }. Только для режима создания (без taskId). */
export function validateCreateForm(formGroupSelection = '') {
  const idEl = _formEl('taskId');
  if (idEl && idEl.value) return { valid: true, errors: [] };
  const group = formGroupSelection || '';
  const errors = [];
  const themeEl = _formEl('taskTheme');
  const taskText = themeEl?.value?.trim();
  if (!taskText) errors.push({ id: 'formThemeError', message: 'Введите тему' });
  const isCrm = group === 'CRM';
  const isNote = group === 'Заметки';
  if (isCrm) {
    const hasBatchSegments = !!_noteSegmentsForBatch && _noteSegmentsForBatch.length > 0;
    if (!hasBatchSegments) {
      const start = (typeof getDateTimePickerValue === 'function' && getDateTimePickerValue('start')) || null;
      const end = (typeof getDateTimePickerValue === 'function' && getDateTimePickerValue('end')) || null;
      if (!start || !end) errors.push({ id: 'formDateTimeError', message: 'Укажите дату и время' });
    }
    const descEl = _formEl('taskDesc');
    const desc = descEl?.value?.trim();
    if (!desc) errors.push({ id: 'formDescError', message: 'Заполните описание' });
    const actionTypeDropdown = document.getElementById('actionTypeDropdown');
    const activitytype = actionTypeDropdown?.dataset?.value?.trim();
    if (!activitytype) errors.push({ id: 'formActivityTypeError', message: 'Выберите тип действия' });
    const statusDropdown = document.getElementById('statusDropdown');
    const eventstatus = statusDropdown?.dataset?.value?.trim();
    if (!eventstatus) errors.push({ id: 'formStatusError', message: 'Выберите статус' });
    const formTaskResultEl = document.getElementById('formTaskResult');
    if (eventstatus === 'Held' && (!formTaskResultEl?.value?.trim())) errors.push({ id: 'formTaskResultError', message: 'Заполните результат выполненных работ' });
    const responsibleDropdown = document.getElementById('responsibleDropdown');
    const responsible = responsibleDropdown?.dataset?.value?.trim();
    if (!responsible) errors.push({ id: 'formResponsibleError', message: 'Выберите ответственного' });
  }
  if (isNote) {
    const syncGroupDropdown = document.getElementById('syncGroupDropdown');
    const syncVal = syncGroupDropdown?.dataset?.value?.trim();
    if (!syncVal) errors.push({ id: 'formSyncGroupError', message: 'Выберите группу синхронизации' });
  }
  return { valid: errors.length === 0, errors };
}

function clearFieldErrors() {
  CREATE_FIELD_ERRORS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const row = el.previousElementSibling;
    if (row?.classList.contains('ios-row')) row.classList.remove('ios-row-error');
  });
}

function showFieldErrors(errors) {
  errors.forEach(({ id }) => {
    const el = document.getElementById(id);
    if (!el) return;
    const row = el.previousElementSibling;
    if (row?.classList.contains('ios-row')) row.classList.add('ios-row-error');
  });
}

/** Обновляет активность кнопки «Создать» и отображение ошибок полей. Вызывать при смене полей формы. */
export async function updateCreateButtonState(dependencies = {}) {
  const idEl = _formEl('taskId');
  const submitBtn = _formEl('submitTaskBtn');
  if (!submitBtn) return;
  const isEdit = !!(idEl && idEl.value);
  clearFieldErrors();
  if (isEdit) {
    submitBtn.disabled = false;
    return;
  }
  const { formGroupSelection } = await import('./config.js');
  const result = validateCreateForm(formGroupSelection);
  submitBtn.disabled = !result.valid;
  showFieldErrors(result.errors);
}

export async function handleSubmit(e, dependencies = {}) {
  e.preventDefault();
  const taskId = _formEl('taskId')?.value || '';
  const isEdit = !!taskId;
  const { formGroupSelection } = await import('./config.js');

  const taskText = _formEl('taskTheme')?.value?.trim();
  if (!isEdit) {
    const validation = validateCreateForm(formGroupSelection);
    if (!validation.valid) {
      clearFieldErrors();
      showFieldErrors(validation.errors);
      const first = validation.errors[0];
      if (first) {
        const el = document.getElementById(first.id);
        if (el) el.previousElementSibling?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        if (first.id === 'formThemeError') _formEl('taskTheme')?.focus();
        else if (first.id === 'formDescError') _formEl('taskDesc')?.focus();
        else if (first.id === 'formDateTimeError') document.getElementById('taskDateTimeRangeTrigger')?.focus();
        else if (first.id === 'formTaskResultError') document.getElementById('formTaskResult')?.focus();
      }
      hideError();
      return;
    }
  }
  if (!taskText) return;
  const group = formGroupSelection || null;
  const desc = (_formEl('taskDesc') && _formEl('taskDesc').value) ? _formEl('taskDesc').value.trim() : null;
  const isNote = group === 'Заметки';
  const start = isNote ? null : (dependencies.getDateTimePickerValue || getDateTimePickerValue)('start');
  const end = isNote ? null : (dependencies.getDateTimePickerValue || getDateTimePickerValue)('end');

  // For notes: get selected sync group from form dropdown
  let formSyncGroupId = null;
  if (isNote && !isEdit) {
    const syncGroupDropdown = document.getElementById('syncGroupDropdown');
    formSyncGroupId = syncGroupDropdown ? syncGroupDropdown.dataset.value : null;
    if (!formSyncGroupId) {
      showError('Выберите группу синхронизации для заметки');
      return;
    }
  }
  const relatedCrmidEl = document.getElementById('formRelatedCrmid');
  const relatedCrmid = relatedCrmidEl && relatedCrmidEl.value ? relatedCrmidEl.value.trim() : null;
  const responsibleDropdown = document.getElementById('responsibleDropdown');
  const responsibleUserId = responsibleDropdown && responsibleDropdown.dataset.value ? responsibleDropdown.dataset.value.trim() : null;
  const statusDropdown = document.getElementById('statusDropdown');
  const eventstatus = statusDropdown && statusDropdown.dataset.value ? statusDropdown.dataset.value.trim() : null;
  const actionTypeDropdown = document.getElementById('actionTypeDropdown');
  const activitytype = actionTypeDropdown && actionTypeDropdown.dataset.value ? actionTypeDropdown.dataset.value.trim() : null;
  const priorityEl = _formEl('taskPriority');
  const priority = priorityEl && priorityEl.checked ? 1 : 0;
  const formTaskResultEl = document.getElementById('formTaskResult');
  const taskResult = (eventstatus === 'Held' && formTaskResultEl) ? formTaskResultEl.value.trim() || null : null;

  if (eventstatus === 'Held' && (!taskResult || !taskResult.length)) {
    hideError();
    showFieldErrors([{ id: 'formTaskResultError' }]);
    const errEl = document.getElementById('formTaskResultError');
    if (errEl) errEl.previousElementSibling?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (formTaskResultEl) formTaskResultEl.focus();
    return;
  }

  const submitBtn = _formEl('submitTaskBtn');
  if (submitBtn) submitBtn.disabled = true;

  try {
    hideError();
    if (isEdit) {
      await (dependencies.updateTask || updateTask)(taskId, taskText, group, start, end, desc, relatedCrmid, responsibleUserId, eventstatus, activitytype, priority, taskResult, dependencies);
    } else if (_noteSegmentsForBatch && _noteSegmentsForBatch.length > 0) {
      // Создание задач по отрезкам времени
      const segments = _noteSegmentsForBatch;
      const createFn = dependencies.createTask || createTask;
      const baseDeps = {
        ...dependencies,
        syncGroupId: formSyncGroupId,
        relatedCrmid: relatedCrmid || undefined,
        assigned_user_id: responsibleUserId || undefined,
        eventstatus: eventstatus || undefined,
        activitytype: activitytype || undefined,
        priority_task: priority,
        task_result: taskResult || undefined,
      };
      for (let i = 0; i < segments.length; i++) {
        const segStart = new Date(segments[i].start);
        const segEnd = new Date(segments[i].end);
        await createFn(taskText, group, segStart, segEnd, desc, baseDeps);
      }
      _noteSegmentsForBatch = null;
      showSyncStatus(`Создано задач: ${segments.length}`, 'success');
    } else {
      await (dependencies.createTask || createTask)(taskText, group, start, end, desc, {
        ...dependencies,
        syncGroupId: formSyncGroupId,
        relatedCrmid: relatedCrmid || undefined,
        assigned_user_id: responsibleUserId || undefined,
        eventstatus: eventstatus || undefined,
        activitytype: activitytype || undefined,
        priority_task: priority,
        task_result: taskResult || undefined,
      });
      showSyncStatus('Задача создана.', 'success');
    }
    // Пометить заметку как сформированную
    const formedNoteId = _sourceNoteId;
    if (formedNoteId && authEndpoint) {
      try {
        await (dependencies.apiFetch || apiFetch)(`${authEndpoint}?action=sync-note-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note_id: formedNoteId, payload: { taskFormed: true } }),
        }, dependencies);
        invalidateSyncNotesCache();
      } catch (_) { /* не критично */ }
    }
    if (dependencies.closeTaskFormModal) dependencies.closeTaskFormModal();
    if (dependencies.resetForm) dependencies.resetForm(dependencies);
    if (dependencies.loadTasks) await dependencies.loadTasks(dependencies, formedNoteId ? {} : { useCacheOnly: true });
    if (isEdit && eventstatus === 'Held' && taskId) {
      setTimeout(() => {
        const item = tasksContainer.querySelector(`.task-item[data-id="${taskId}"]`);
        if (item) {
          item.classList.add('expanded');
          const block = item.querySelector('.task-complete-description-block');
          if (block) {
            block.style.display = 'flex';
            block.querySelector('.task-complete-description-input')?.focus();
          }
        }
      }, 50);
    }
  } catch (err) {
    // console.error('[Форма задачи] Ошибка сохранения:', err);
    _noteSegmentsForBatch = null;
    showError(err.message || 'Ошибка при сохранении задачи');
    showSyncStatus('Не удалось сохранить задачу: ' + (err.message || 'неизвестная ошибка'), 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

const RECORDING_ERROR_MSG = 'Запись звонка недоступна или файл не найден.';
const RECORDING_TOAST_DURATION_MS = 4000;

/** Синхронизировать иконку воспроизведения в строке задачи с состоянием <audio> в деталях */
function syncRowPlayButton(block, isPlaying) {
  const taskItem = block.closest('.task-item');
  const idx = block.dataset.recordingIndex;
  const rowBtn = taskItem?.querySelector(
    idx != null ? `.task-play-recording-btn[data-recording-index="${idx}"]` : '.task-play-recording-btn'
  );
  if (rowBtn) {
    if (isPlaying) rowBtn.classList.add('is-playing');
    else rowBtn.classList.remove('is-playing');
  }
}

/** Остановить все записи кроме указанного audio */
function pauseAllOtherRecordings(exceptAudio) {
  tasksContainer.querySelectorAll('.task-detail-audio').forEach((a) => {
    if (a !== exceptAudio) a.pause();
  });
}

/** Есть ли сейчас воспроизведение записи (для пропуска автообновления по таймеру) */
export function isRecordingPlaying() {
  const audios = tasksContainer.querySelectorAll('.task-detail-audio');
  for (const a of audios) if (!a.paused) return true;
  return false;
}

/** Сохранить состояние воспроизведения перед перерисовкой (для восстановления после обновления списка) */
export function getActiveRecordingState() {
  const audios = tasksContainer.querySelectorAll('.task-detail-audio');
  for (const a of audios) {
    if (a.paused) continue;
    const block = a.closest('.task-detail-recording-block');
    const taskItem = block?.closest('.task-item');
    if (!taskItem || !block) return null;
    return {
      taskId: taskItem.dataset.id,
      recordingIndex: block.dataset.recordingIndex ?? '0',
      currentTime: a.currentTime,
    };
  }
  return null;
}

/** Восстановить воспроизведение после перерисовки списка задач */
export function restoreRecordingPlayback(state) {
  if (!state?.taskId) return;
  const taskItem = [...tasksContainer.querySelectorAll('.task-item')].find((el) => el.dataset.id === state.taskId);
  const block = taskItem?.querySelector(`.task-detail-recording-block[data-recording-index="${state.recordingIndex}"]`);
  const audio = block?.querySelector('.task-detail-audio');
  if (!audio) {
    hideStickyBar();
    return;
  }
  audio.currentTime = state.currentTime;
  if (!audio.src) audio.src = audio.dataset.src || '';
  pauseAllOtherRecordings(audio);
  audio.play().catch(() => {});
  showStickyBarForAudio(audio);
}

let _activeStickyAudio = null;
let _activeStickyTaskId = null;
function getStickyRecordingBar() {
  return document.getElementById('stickyRecordingBar');
}
/** Начало звонка: день, месяц строчными, время без секунд (например "11 фев 14:30") */
function formatRecordingStart(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.getDate();
  const month = d.toLocaleString('ru-RU', { month: 'short' }).toLowerCase();
  const time = d.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${month} ${time}`;
}
function getStickyTrackRow(bar, recordingIndex) {
  return bar.querySelector(`.sticky-recording-track[data-recording-index="${recordingIndex}"]`);
}
function updateStickyBarFromAudio(audio) {
  const bar = getStickyRecordingBar();
  if (!bar || audio !== _activeStickyAudio) return;
  const block = audio.closest('.task-detail-recording-block');
  const idx = block?.dataset?.recordingIndex ?? '0';
  const row = getStickyTrackRow(bar, idx);
  if (!row) return;
  const currentEl = row.querySelector('.sticky-recording-track-current');
  const durationEl = row.querySelector('.sticky-recording-track-duration');
  const seekEl = row.querySelector('.sticky-recording-track-seek');
  const d = audio.duration;
  const t = audio.currentTime;
  if (currentEl) currentEl.textContent = formatDuration(t);
  if (durationEl && !Number.isNaN(d) && isFinite(d)) durationEl.textContent = formatDuration(d);
  if (seekEl && !Number.isNaN(d) && d > 0) seekEl.value = (t / d) * 100;
}
function setStickyBarPlaying(audio, playing) {
  const bar = getStickyRecordingBar();
  if (!bar || !audio) return;
  const block = audio.closest('.task-detail-recording-block');
  const idx = block?.dataset?.recordingIndex ?? '0';
  const row = getStickyTrackRow(bar, idx);
  if (!row) return;
  const iconPlay = row.querySelector('.sticky-recording-icon-play');
  const iconPause = row.querySelector('.sticky-recording-icon-pause');
  if (iconPlay) iconPlay.style.display = playing ? 'none' : 'flex';
  if (iconPause) iconPause.style.display = playing ? 'flex' : 'none';
}
function updateStickyBarActiveRow() {
  const bar = getStickyRecordingBar();
  if (!bar) return;
  bar.querySelectorAll('.sticky-recording-track').forEach((row) => row.classList.remove('active'));
  if (_activeStickyAudio) {
    const block = _activeStickyAudio.closest('.task-detail-recording-block');
    const idx = block?.dataset?.recordingIndex ?? '0';
    getStickyTrackRow(bar, idx)?.classList.add('active');
  }
}
function getAudioForStickyTrack(taskId, recordingIndex) {
  const taskItem = [...tasksContainer.querySelectorAll('.task-item')].find((el) => el.dataset.id === taskId);
  const block = taskItem?.querySelector(`.task-detail-recording-block[data-recording-index="${recordingIndex}"]`);
  return block?.querySelector('.task-detail-audio');
}
function pauseAllRecordingsInTask(taskId) {
  const taskItem = [...tasksContainer.querySelectorAll('.task-item')].find((el) => el.dataset.id === taskId);
  taskItem?.querySelectorAll('.task-detail-audio').forEach((a) => a.pause());
}
function buildStickyBarTracks(taskItem, taskId) {
  const blocks = [...taskItem.querySelectorAll('.task-detail-recording-block')].sort(
    (a, b) => parseInt(a.dataset.recordingIndex, 10) - parseInt(b.dataset.recordingIndex, 10)
  );
  const bar = getStickyRecordingBar();
  if (!bar) return;
  const tracksEl = bar.querySelector('.sticky-recording-tracks');
  tracksEl.innerHTML = blocks
    .map((_, i) => {
      const idx = String(i);
      return `
        <div class="sticky-recording-track" data-task-id="${escapeHtml(taskId)}" data-recording-index="${idx}">
          <span class="sticky-recording-track-label"></span>
          <button type="button" class="sticky-recording-track-play" title="Воспроизвести / пауза">
            <span class="sticky-recording-icon-play"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>
            <span class="sticky-recording-icon-pause" style="display:none"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></span>
          </button>
          <input type="range" class="sticky-recording-track-seek" min="0" max="100" value="0" step="0.1" />
          <span class="sticky-recording-track-time"><span class="sticky-recording-track-current">0:00</span><span class="sticky-recording-track-sep"> / </span><span class="sticky-recording-track-duration">—</span></span>
        </div>`;
    })
    .join('');
  tracksEl.querySelectorAll('.sticky-recording-track').forEach((row) => {
    const taskIdVal = row.dataset.taskId;
    const recIdx = row.dataset.recordingIndex;
    row.querySelector('.sticky-recording-track-play')?.addEventListener('click', () => {
      const a = getAudioForStickyTrack(taskIdVal, recIdx);
      if (!a) return;
      if (!a._detailBound) {
        const blk = a.closest('.task-detail-recording-block');
        if (blk) bindDetailRecordingPlayer(blk);
      }
      if (!a.src) a.src = a.dataset.src || '';
      if (a.paused) {
        pauseAllOtherRecordings(a);
        a.play().catch(() => {});
      } else {
        a.pause();
      }
    });
    row.querySelector('.sticky-recording-track-seek')?.addEventListener('input', (e) => {
      const a = getAudioForStickyTrack(taskIdVal, recIdx);
      if (!a) return;
      const d = a.duration;
      if (Number.isNaN(d) || !isFinite(d) || d <= 0) return;
      a.currentTime = (parseFloat(e.target.value) / 100) * d;
    });
  });
}
function showStickyBarForAudio(audio) {
  const bar = getStickyRecordingBar();
  if (!bar) return;
  const block = audio.closest('.task-detail-recording-block');
  const taskItem = block?.closest('.task-item');
  if (!taskItem) return;
  const taskId = taskItem.dataset.id;
  const alreadyVisible = bar.style.display === 'flex' && _activeStickyTaskId === taskId;
  _activeStickyAudio = audio;
  _activeStickyTaskId = taskId;
  const taskTextEl = bar.querySelector('.sticky-recording-task-text');
  const taskTimeEl = bar.querySelector('.sticky-recording-task-time');
  const textEl = taskItem.querySelector('.task-text');
  if (taskTextEl) {
    taskTextEl.textContent = textEl?.textContent?.trim() || '';
    taskTextEl.title = taskTextEl.textContent;
  }
  if (taskTimeEl) taskTimeEl.textContent = formatRecordingStart(taskItem.dataset.start);
  if (!alreadyVisible) {
    buildStickyBarTracks(taskItem, taskId);
  }
  bar.style.display = 'flex';
  updateStickyBarActiveRow();
  updateStickyBarFromAudio(audio);
  setStickyBarPlaying(audio, !audio.paused);
  if (!bar._stickyBound) {
    bar._stickyBound = true;
    bar.querySelector('.sticky-recording-close')?.addEventListener('click', () => {
      pauseAllRecordingsInTask(_activeStickyTaskId);
      _activeStickyAudio = null;
      _activeStickyTaskId = null;
      bar.style.display = 'none';
    });
  }
}
function hideStickyBar() {
  _activeStickyAudio = null;
  _activeStickyTaskId = null;
  const bar = getStickyRecordingBar();
  if (bar) bar.style.display = 'none';
}
/** После окончания одного звонка запустить следующий в той же задаче (только в рамках одной задачи) */
function tryPlayNextRecordingInTask(block) {
  const taskItem = block.closest('.task-item');
  if (!taskItem) return;
  const blocks = [...taskItem.querySelectorAll('.task-detail-recording-block')].sort(
    (a, b) => parseInt(a.dataset.recordingIndex, 10) - parseInt(b.dataset.recordingIndex, 10)
  );
  const currentIdx = parseInt(block.dataset.recordingIndex, 10) || 0;
  const nextBlock = blocks[currentIdx + 1];
  if (!nextBlock) {
    hideStickyBar();
    return;
  }
  const nextAudio = nextBlock.querySelector('.task-detail-audio');
  if (!nextAudio) return;
  if (!nextAudio._detailBound) bindDetailRecordingPlayer(nextBlock);
  if (!nextAudio.src) nextAudio.src = nextAudio.dataset.src || '';
  pauseAllOtherRecordings(nextAudio);
  _activeStickyAudio = nextAudio;
  updateStickyBarActiveRow();
  setStickyBarPlaying(nextAudio, true);
  nextAudio.play().catch(() => hideStickyBar());
}

/** Показать ошибку записи: всплывашка над задачей или глобальный блок (если anchor не передан) */
function showRecordingNotFoundError(anchor) {
  if (anchor) {
    const toast = document.createElement('div');
    toast.className = 'recording-error-toast';
    toast.textContent = RECORDING_ERROR_MSG;
    const wrap = document.createElement('div');
    wrap.className = 'recording-error-toast-wrap';
    wrap.appendChild(toast);
    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect();
      wrap.style.left = `${rect.left}px`;
      wrap.style.top = `${rect.top - 4}px`;
      wrap.style.width = `${Math.max(rect.width, 200)}px`;
      wrap.style.transform = 'translateY(-100%)';
    };
    updatePosition();
    document.body.appendChild(wrap);
    const remove = () => {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    };
    setTimeout(remove, RECORDING_TOAST_DURATION_MS);
    wrap.addEventListener('click', remove);
    window.addEventListener('scroll', updatePosition, { passive: true });
    setTimeout(() => window.removeEventListener('scroll', updatePosition), RECORDING_TOAST_DURATION_MS);
  } else {
    showError(RECORDING_ERROR_MSG);
    if (errorEl) errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function toggleRecordingPlayback(btn) {
  const url = btn.dataset.playUrl;
  if (!url) return;
  const taskItem = btn.closest('.task-item');
  const idx = btn.dataset.recordingIndex;
  const block = taskItem?.querySelector(
    idx != null ? `.task-detail-recording-block[data-recording-index="${idx}"]` : '.task-detail-recording-block'
  );
  const audio = block?.querySelector('.task-detail-audio');
  if (block && audio) {
    if (!audio._detailBound) bindDetailRecordingPlayer(block);
    if (!audio.src) audio.src = audio.dataset.src || '';
    if (audio.paused) {
      pauseAllOtherRecordings(audio);
      audio.play().catch(() => {
        syncRowPlayButton(block, false);
        showRecordingNotFoundError(taskItem);
      });
      setTimeout(() => {
        if (audio.error && audio.error.code !== 0) {
          syncRowPlayButton(block, false);
          showRecordingNotFoundError(taskItem);
        }
      }, 800);
    } else {
      audio.pause();
    }
    return;
  }
  // Fallback: нет блока деталей — создаём временный Audio (редкий кейс)
  const a = new Audio(url);
  if (btn.classList.contains('is-playing')) {
    btn.classList.remove('is-playing');
    return;
  }
  btn.classList.add('is-playing');
  a.onerror = () => {
    btn.classList.remove('is-playing');
    showRecordingNotFoundError(taskItem);
  };
  a.play().catch(() => {
    btn.classList.remove('is-playing');
    showRecordingNotFoundError(taskItem);
  });
  a.onended = () => btn.classList.remove('is-playing');
}

function bindDetailRecordingPlayer(block) {
  const audio = block.querySelector('.task-detail-audio');
  const playBtn = block.querySelector('.task-detail-play-btn');
  const stopBtn = block.querySelector('.task-detail-stop-btn');
  const seekInput = block.querySelector('.task-detail-seek-input');
  const currentEl = block.querySelector('.task-detail-current-time');
  const durationEl = block.querySelector('.task-detail-duration');
  const iconPlay = block.querySelector('.task-detail-icon-play');
  const iconPause = block.querySelector('.task-detail-icon-pause');
  if (!audio || !playBtn) return;
  const updateTime = () => {
    const t = audio.currentTime;
    const d = audio.duration;
    if (currentEl) currentEl.textContent = formatDuration(t);
    if (durationEl && !Number.isNaN(d) && isFinite(d)) durationEl.textContent = formatDuration(d);
    if (seekInput && !Number.isNaN(d) && d > 0) {
      seekInput.max = 100;
      seekInput.value = (t / d) * 100;
    }
    if (_activeStickyAudio === audio) updateStickyBarFromAudio(audio);
  };
  const setPlaying = (playing) => {
    if (iconPlay) iconPlay.style.display = playing ? 'none' : 'flex';
    if (iconPause) iconPause.style.display = playing ? 'flex' : 'none';
  };
  if (!audio._detailBound) {
    audio._detailBound = true;
    audio.addEventListener('loadedmetadata', () => {
      if (durationEl) durationEl.textContent = formatDuration(audio.duration);
      if (seekInput) seekInput.max = 100;
      if (_activeStickyAudio === audio) updateStickyBarFromAudio(audio);
    });
    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('ended', () => {
      setPlaying(false);
      updateTime();
      syncRowPlayButton(block, false);
      tryPlayNextRecordingInTask(block);
    });
    audio.addEventListener('pause', () => {
      setPlaying(false);
      syncRowPlayButton(block, false);
      if (_activeStickyAudio === audio) {
        setStickyBarPlaying(audio, false);
        hideStickyBar();
      }
    });
    audio.addEventListener('play', () => {
      setPlaying(true);
      syncRowPlayButton(block, true);
      showStickyBarForAudio(audio);
    });
    audio.addEventListener('error', () => {
      setPlaying(false);
      updateTime();
      syncRowPlayButton(block, false);
      showRecordingNotFoundError(block.closest('.task-item'));
    });
  }
  const checkAudioError = () => {
    if (audio.error && audio.error.code !== 0) {
      setPlaying(false);
      syncRowPlayButton(block, false);
      showRecordingNotFoundError(block.closest('.task-item'));
    }
  };
  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!audio.src) audio.src = audio.dataset.src || '';
    if (audio.paused) {
      pauseAllOtherRecordings(audio);
      audio.play().catch(() => showRecordingNotFoundError(block.closest('.task-item')));
      setTimeout(checkAudioError, 800);
    } else {
      audio.pause();
    }
  });
  if (stopBtn) {
    stopBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.pause();
      audio.currentTime = 0;
      setPlaying(false);
      updateTime();
    });
  }
  if (seekInput) {
    seekInput.addEventListener('input', () => {
      const d = audio.duration;
      if (Number.isNaN(d) || !isFinite(d) || d <= 0) return;
      audio.currentTime = (parseFloat(seekInput.value) / 100) * d;
    });
  }
}

function setupDetailRecordingPlayers() {
  tasksContainer.querySelectorAll('.task-detail-recording-block').forEach(bindDetailRecordingPlayer);
}

export function setupTasksDelegation(dependencies = {}) {
  tasksContainer.addEventListener('tasksRendered', setupDetailRecordingPlayers);

  let _draggedGroup = null;
  tasksContainer.addEventListener('dragstart', (e) => {
    const group = e.target.closest('.task-group');
    if (!group || !group.draggable) return;
    _draggedGroup = group.dataset.groupName;
    if (_draggedGroup) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', _draggedGroup);
      group.classList.add('group-dragging');
    }
  });
  tasksContainer.addEventListener('dragend', (e) => {
    e.target.closest('.task-group')?.classList.remove('group-dragging');
    tasksContainer.querySelectorAll('.group-drop-target').forEach((el) => el.classList.remove('group-drop-target'));
    _draggedGroup = null;
  });
  tasksContainer.addEventListener('dragover', (e) => {
    const group = e.target.closest('.task-group');
    if (!group || !_draggedGroup) return;
    if (group.dataset.groupName !== _draggedGroup) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      group.classList.add('group-drop-target');
    }
  });
  tasksContainer.addEventListener('dragleave', (e) => {
    const group = e.target.closest('.task-group');
    if (group && !group.contains(e.relatedTarget)) group.classList.remove('group-drop-target');
  });
  tasksContainer.addEventListener('drop', async (e) => {
    const group = e.target.closest('.task-group');
    if (!group || !_draggedGroup) return;
    e.preventDefault();
    group.classList.remove('group-drop-target');
    const targetGroup = group.dataset.groupName;
    if (targetGroup && targetGroup !== _draggedGroup && reorderGroups) {
      await (dependencies.reorderGroups || reorderGroups)(_draggedGroup, targetGroup, dependencies);
    }
  });

  tasksContainer.addEventListener('change', async (e) => {
    const cb = e.target.closest('.task-checkbox');
    if (!cb) return;
    e.stopPropagation();
    const item = cb.closest('.task-item');
    if (item?.dataset.group === 'CRM группа') return;
    await (dependencies.toggleTaskComplete || toggleTaskComplete)(cb.dataset.id, dependencies);
  });

  tasksContainer.addEventListener('input', (e) => {
    const ta = e.target.closest('.task-complete-description-input');
    if (ta) {
      const hint = ta.closest('.task-complete-description-block')?.querySelector('.task-complete-required-hint');
      if (hint) hint.style.display = 'none';
    }
  });

  tasksContainer.addEventListener('click', async (e) => {
    const brainBtn = e.target.closest('.task-brain-btn');
    if (brainBtn) {
      e.stopPropagation();
      if (brainBtn.closest('.task-item')?.dataset.group === 'CRM группа') return;
      const id = brainBtn.dataset.id;
      const setStatus = dependencies.setTaskStatus || setTaskStatus;
      const wasInProgress = brainBtn.classList.contains('in-progress');
      const newStatus = wasInProgress ? 'Planned' : 'В работе';
      if (wasInProgress) brainBtn.classList.remove('in-progress');
      else brainBtn.classList.add('in-progress');
      try {
        await setStatus(id, newStatus, dependencies);
      } catch (_) {
        brainBtn.classList.toggle('in-progress', !wasInProgress);
      }
      return;
    }
    const completeOpenBtn = e.target.closest('.task-complete-open-btn');
    if (completeOpenBtn) {
      e.stopPropagation();
      const item = completeOpenBtn.closest('.task-item');
      if (item?.dataset.group === 'CRM группа') return;
      const block = item?.querySelector('.task-complete-description-block');
      const hint = block?.querySelector('.task-complete-required-hint');
      const textarea = block?.querySelector('.task-complete-description-input');
      const id = completeOpenBtn.dataset.id;
      const visible = block && (block.style.display === 'flex');
      if (!block) return;
      if (visible) {
        const taskResultValue = textarea?.value?.trim() ?? '';
        if (!taskResultValue) {
          if (hint) hint.style.display = 'block';
          return;
        }
        if (hint) hint.style.display = 'none';
        const startInput = block.querySelector('.task-complete-start-input');
        const endInput = block.querySelector('.task-complete-end-input');
        const completedStart = startInput?.value ? new Date(startInput.value).toISOString() : null;
        const completedEnd = endInput?.value ? new Date(endInput.value).toISOString() : null;
        completeOpenBtn.classList.add('task-complete-open-btn-confirm');
        await (dependencies.completeCrmTaskWithDescription || completeCrmTaskWithDescription)(id, taskResultValue, dependencies, { completed_start: completedStart, completed_end: completedEnd });
        return;
      }
      if (hint) hint.style.display = 'none';
      block.style.display = 'flex';
      if (textarea) setTimeout(() => textarea.focus(), 0);
      return;
    }
    const pencilBtn = e.target.closest('.task-edit-pencil-btn');
    if (pencilBtn) {
      e.stopPropagation();
      if (pencilBtn.closest('.task-item')?.dataset.group === 'CRM группа') return;
      if (dependencies.editTask) dependencies.editTask(pencilBtn.dataset.id, _lastRenderedTasks, dependencies);
      return;
    }
    const playRecordingBtn = e.target.closest('.task-play-recording-btn');
    if (playRecordingBtn && playRecordingBtn.dataset.playUrl) {
      e.stopPropagation();
      toggleRecordingPlayback(playRecordingBtn);
      return;
    }
    const noteTimerBtn = e.target.closest('.note-timer-btn');
    if (noteTimerBtn) {
      e.stopPropagation();
      const id = noteTimerBtn.dataset.id;
      const badge = noteTimerBtn.closest('.note-timer-badge');
      const wasRunning = badge?.dataset.running === 'true';
      const elapsed = parseInt(badge?.dataset.elapsed || '0', 10);
      const startedAt = badge?.dataset.started || null;
      const now = new Date().toISOString();
      const sessionSeconds = wasRunning ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000) : 0;
      let newElapsed = wasRunning ? elapsed + sessionSeconds : elapsed;
      const isStarting = !wasRunning;
      // Обновляем timerSegments
      const task = _lastRenderedTasks?.find(t => String(t.id) === String(id));
      const segments = Array.isArray(task?.timerSegments) ? [...task.timerSegments] : [];
      if (isStarting) {
        segments.push({ start: now, end: null });
      } else if (segments.length > 0) {
        // Если сегмент короче 60 сек — удаляем его и не считаем время
        if (sessionSeconds < 60) {
          segments.pop();
          newElapsed = elapsed; // откатываем — не прибавляем короткую сессию
        } else {
          segments[segments.length - 1].end = now;
        }
      }
      if (authEndpoint) {
        try {
          await apiFetch(`${authEndpoint}?action=sync-note-update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              note_id: id,
              payload: { timerElapsedSeconds: newElapsed, timerRunning: !wasRunning, timerStartedAt: isStarting ? now : null, timerSegments: segments },
            }),
          }, dependencies);
        } catch (err) {
          // console.warn('Sync note timer:', err);
        }
        invalidateSyncNotesCache();
        if (dependencies.loadTasks) await dependencies.loadTasks(dependencies, { useCacheOnly: true });
      } else {
        await updateNoteTimer(id, !wasRunning, newElapsed, isStarting ? now : null, segments);
        if (dependencies.loadTasks) await dependencies.loadTasks(dependencies, { useCacheOnly: true });
      }
      return;
    }
    const noteAssignBtn = e.target.closest('.note-assign-btn');
    if (noteAssignBtn) {
      e.stopPropagation();
      const noteId = noteAssignBtn.dataset.id;
      const action = noteAssignBtn.dataset.action; // 'assign' or 'release'
      noteAssignBtn.disabled = true;
      try {
        const body = action === 'release'
          ? { note_id: noteId, release: true }
          : { note_id: noteId };
        await apiFetch(`${authEndpoint}?action=sync-note-assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }, dependencies);
        invalidateSyncNotesCache();
        if (dependencies.loadTasks) await dependencies.loadTasks(dependencies, { useCacheOnly: true });
      } catch (err) {
        // console.warn('Note assign:', err);
      }
      noteAssignBtn.disabled = false;
      return;
    }
    const noteUnformBtn = e.target.closest('.note-unform-btn');
    if (noteUnformBtn) {
      e.stopPropagation();
      if (!confirm('Снять пометку «Сформирована»? Это позволит заново сформировать задачи из этой заметки.')) return;
      const nId = noteUnformBtn.dataset.id;
      noteUnformBtn.disabled = true;
      try {
        await apiFetch(`${authEndpoint}?action=sync-note-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note_id: nId, payload: { taskFormed: false } }),
        }, dependencies);
        invalidateSyncNotesCache();
        if (dependencies.loadTasks) await dependencies.loadTasks(dependencies);
      } catch (err) {
        showError(err.message || 'Не удалось снять пометку');
      }
      return;
    }
    const noteToTaskBtn = e.target.closest('.note-to-task-btn');
    if (noteToTaskBtn) {
      e.stopPropagation();
      const noteId = noteToTaskBtn.dataset.id;
      const note = _lastRenderedTasks?.find(t => String(t.id) === String(noteId));
      if (!note) return;

      const segments = Array.isArray(note.timerSegments) ? note.timerSegments.filter(s => s.start && s.end) : [];

      // Если 2+ сегментов — спрашиваем пользователя
      let batchSegments = null;
      if (segments.length >= 2) {
        const choice = await showSegmentChoiceModal(segments.length);
        if (!choice) return; // отмена
        if (choice === 'segments') {
          // Редактор сегментов
          const edited = await showSegmentEditorModal(segments);
          if (!edited) return; // отмена
          batchSegments = edited;
        }
      }

      // Сброс формы и переключение на CRM
      if (dependencies.resetForm) dependencies.resetForm(dependencies);
      _noteSegmentsForBatch = batchSegments;
      _sourceNoteId = noteId;
      if (dependencies.setFormGroupSelection) dependencies.setFormGroupSelection('CRM');
      if (dependencies.renderFormGroupDropdownList) dependencies.renderFormGroupDropdownList();
      if (dependencies.updateFormMode) dependencies.updateFormMode();
      const formGroupWrap = document.getElementById('formGroupWrap');
      if (formGroupWrap) formGroupWrap.classList.add('form-group-locked');
      // Заполняем тему и описание
      const themeEl = _formEl('taskTheme');
      const descEl = _formEl('taskDesc');
      if (themeEl) themeEl.value = note.text || '';
      if (descEl) descEl.value = note.description || '';
      // Статус = Выполнено (Held)
      const statusDropdown = document.getElementById('statusDropdown');
      if (statusDropdown) {
        statusDropdown.dataset.value = 'Held';
        const statusLabel = statusDropdown.querySelector('.dd-label');
        if (statusLabel) statusLabel.textContent = 'Выполнено';
      }
      toggleFormTaskResultVisibility('Held');
      // Тип действия = Выполнить
      const actionTypeDropdown = document.getElementById('actionTypeDropdown');
      if (actionTypeDropdown) {
        actionTypeDropdown.dataset.value = 'Выполнить';
        const actionLabel = actionTypeDropdown.querySelector('.dd-label');
        if (actionLabel) actionLabel.textContent = 'Выполнить';
      }
      // Результат = тайминги (из отредактированных сегментов, если есть)
      const formTaskResultEl = document.getElementById('formTaskResult');
      if (formTaskResultEl) {
        if (batchSegments) {
          // Пересчитать общее время из отредактированных сегментов
          const editedTotal = batchSegments.reduce((sum, s) => sum + Math.floor((new Date(s.end) - new Date(s.start)) / 1000), 0);
          formTaskResultEl.value = formatTimerSegmentsForTaskResult(batchSegments, editedTotal);
        } else {
          formTaskResultEl.value = formatTimerSegmentsForTaskResult(note.timerSegments, note.timerElapsedSeconds || 0);
        }
      }
      // Ответственный = текущий пользователь
      const responsibleDropdown = document.getElementById('responsibleDropdown');
      const myId = window._currentVtigerUserId || (user && user.id ? String(user.id) : '');
      if (responsibleDropdown && myId) {
        responsibleDropdown.dataset.value = myId;
        const respLabel = responsibleDropdown.querySelector('.dd-label');
        if (respLabel) respLabel.textContent = 'Вы';
      }
      // Секция даты/времени: скрыть пикер при batch, показать подсказку
      const dateTimeSectionContent = document.getElementById('dateTimeSectionContent');
      const batchDateTimeHint = document.getElementById('batchDateTimeHint');
      if (batchSegments) {
        if (dateTimeSectionContent) dateTimeSectionContent.style.display = 'none';
        if (batchDateTimeHint) batchDateTimeHint.style.display = '';
      } else {
        if (dateTimeSectionContent) dateTimeSectionContent.style.display = '';
        if (batchDateTimeHint) batchDateTimeHint.style.display = 'none';
        // Одна задача: start = начало первого сегмента, end = конец последнего
        if (segments.length > 0) {
          const firstSeg = segments[0];
          const lastSeg = segments[segments.length - 1];
          if (firstSeg.start && dependencies.setDateTimePickerValue) dependencies.setDateTimePickerValue('start', new Date(firstSeg.start));
          if (lastSeg.end && dependencies.setDateTimePickerValue) dependencies.setDateTimePickerValue('end', new Date(lastSeg.end));
        }
      }
      // Баннер с количеством задач
      const banner = document.getElementById('batchTaskBanner');
      if (banner) {
        if (batchSegments) {
          const cnt = batchSegments.length;
          banner.textContent = `Будет создано ${cnt} ${cnt < 5 ? 'задачи' : 'задач'} по отрезкам времени`;
          banner.style.display = '';
        } else {
          banner.textContent = 'Будет создана 1 задача';
          banner.style.display = '';
        }
      }
      // Открываем форму
      openTaskFormModal();
      return;
    }
    const deleteBtn = e.target.closest('.task-delete-btn');
    if (deleteBtn) {
      e.stopPropagation();
      if (deleteBtn.closest('.task-item')?.dataset.group === 'CRM группа') return;
      await (dependencies.deleteTask || deleteTask)(deleteBtn.dataset.id, dependencies);
      return;
    }
    const editBtn = e.target.closest('.task-edit-btn');
    if (editBtn) {
      e.stopPropagation();
      if (editBtn.closest('.task-item')?.dataset.group === 'CRM группа') return;
      if (dependencies.editTask) dependencies.editTask(editBtn.dataset.id, _lastRenderedTasks, dependencies);
      return;
    }
    const userBadge = e.target.closest('.group-user-badge');
    if (userBadge && userBadge.dataset.groupId && userBadge.dataset.userKey !== undefined) {
      e.stopPropagation();
      const { getGroupUserFilterState } = await import('./render.js');
      const { _lastRenderedTasks } = await import('./config.js');
      const state = getGroupUserFilterState();
      const groupId = userBadge.dataset.groupId;
      const userKey = userBadge.dataset.userKey;
      let set = state.get(groupId) || new Set();
      if (set.has(userKey)) {
        set.delete(userKey);
      } else {
        set.add(userKey);
      }
      state.set(groupId, set);
      const renderTasksFn = dependencies.renderTasks || (await import('./render.js')).renderTasks;
      if (_lastRenderedTasks && _lastRenderedTasks.length && renderTasksFn) {
        renderTasksFn([..._lastRenderedTasks]);
      }
      return;
    }
    const row = e.target.closest('.task-row');
    if (row && !e.target.closest('.task-checkbox') && !e.target.closest('.task-brain-btn')) {
      const item = row.closest('.task-item');
      if (item) item.classList.toggle('expanded');
      return;
    }
    const moduleBadge = e.target.closest('.group-module-badge');
    if (moduleBadge && moduleBadge.dataset.groupId && moduleBadge.dataset.setype !== undefined) {
      e.stopPropagation();
      const { getGroupModuleFilterState } = await import('./render.js');
      const { _lastRenderedTasks } = await import('./config.js');
      const state = getGroupModuleFilterState();
      const groupId = moduleBadge.dataset.groupId;
      const setype = moduleBadge.dataset.setype;
      let set = state.get(groupId) || new Set();
      if (set.has(setype)) {
        set.delete(setype);
      } else {
        set.add(setype);
      }
      state.set(groupId, set);
      const renderTasksFn = dependencies.renderTasks || (await import('./render.js')).renderTasks;
      if (_lastRenderedTasks && _lastRenderedTasks.length && renderTasksFn) {
        renderTasksFn([..._lastRenderedTasks]);
      }
      return;
    }
    const header = e.target.closest('.group-header');
    if (header) {
      if (e.target.closest('.group-toggle')) {
        e.stopPropagation();
        if (dependencies.toggleGroup) dependencies.toggleGroup(e.target.closest('.group-toggle').dataset.groupId);
      } else if (!e.target.closest('.group-module-badges') && !e.target.closest('.group-drag-handle')) {
        if (dependencies.toggleGroup) dependencies.toggleGroup(header.dataset.groupId);
      }
    }
  });
}

let _formRelatedModulesList = [];

export async function loadFormRelatedModules(dependencies = {}) {
  const listEl = document.getElementById('formRelatedModuleList');
  if (!listEl || !isAuthed() || !authEndpoint) return;
  const { fetchRelatedModules: fetchModules } = dependencies;
  try {
    const list = await (fetchModules || (await import('./api.js')).fetchRelatedModules)(dependencies);
    _formRelatedModulesList = list;
    listEl.innerHTML = list.map((m) =>
      `<div class="form-related-module-option" data-setype="${escapeHtml(m.setype)}" data-label="${escapeHtml(m.label)}">${escapeHtml(m.label)}</div>`
    ).join('');
  } catch (e) {
    // console.error('Ошибка загрузки модулей для привязки:', e);
    _formRelatedModulesList = (await import('./api.js')).FALLBACK_RELATED_MODULES || [];
    listEl.innerHTML = _formRelatedModulesList.map((m) =>
      `<div class="form-related-module-option" data-setype="${escapeHtml(m.setype)}" data-label="${escapeHtml(m.label)}">${escapeHtml(m.label)}</div>`
    ).join('');
  }
}

function clearFormRelatedSelection() {
  const crmidEl = document.getElementById('formRelatedCrmid');
  const selectedEl = document.getElementById('formRelatedSelected');
  const resultsEl = document.getElementById('formRelatedResults');
  const searchEl = document.getElementById('formRelatedSearch');
  if (crmidEl) crmidEl.value = '';
  if (selectedEl) {
    selectedEl.style.display = 'none';
    const lab = selectedEl.querySelector('.form-related-selected-label');
    if (lab) lab.textContent = '';
  }
  if (resultsEl) { resultsEl.style.display = 'none'; resultsEl.innerHTML = ''; }
  if (searchEl) searchEl.value = '';
}

export function setupFormRelated(dependencies = {}) {
  const moduleInput = document.getElementById('formRelatedModule');
  const moduleTrigger = document.getElementById('formRelatedModuleTrigger');
  const moduleLabel = document.getElementById('formRelatedModuleLabel');
  const selectedEl = document.getElementById('formRelatedSelected');
  const selectedLabel = selectedEl?.querySelector('.form-related-selected-label');
  const clearBtn = document.getElementById('formRelatedClear');
  const { searchRelated: searchRelatedFn, loadFormRelatedModules: loadModules } = dependencies;

  if (moduleTrigger) {
    moduleTrigger.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (_formRelatedModulesList.length === 0 && loadModules) {
        await loadFormRelatedModules(dependencies);
      }
      const moduleOpts = _formRelatedModulesList.map(m => ({ value: m.setype, label: m.label }));
      if (moduleOpts.length === 0) moduleOpts.push({ value: '', label: 'Нет данных', disabled: true });

      const parentEl = document.getElementById('taskFormModal');
      const backdrop = document.createElement('div');
      backdrop.className = 'picker-modal-backdrop';
      const modal = document.createElement('div');
      modal.className = 'picker-modal';

      const header = document.createElement('div');
      header.className = 'picker-modal-header';
      header.innerHTML = `<span class="picker-modal-title">${escapeHtml('Связано с')}</span><button type="button" class="picker-modal-close">✕</button>`;
      modal.appendChild(header);

      const list = document.createElement('div');
      list.className = 'picker-modal-list';
      const currentModule = moduleInput?.value || '';
      moduleOpts.forEach((opt) => {
        const el = document.createElement('div');
        el.className = 'picker-modal-option' + (opt.value === currentModule ? ' selected' : '') + (opt.disabled ? ' disabled' : '');
        el.textContent = opt.label;
        el.dataset.value = opt.value;
        list.appendChild(el);
      });
      modal.appendChild(list);
      backdrop.appendChild(modal);
      (parentEl || document.body).appendChild(backdrop);

      let mode = 'modules';
      let selectedModule = null;
      let sTimeout = null;

      const close = (result) => {
        if (sTimeout) clearTimeout(sTimeout);
        backdrop.remove();
        if (result) {
          if (moduleInput) moduleInput.value = result.module.value || '';
          if (moduleLabel) moduleLabel.textContent = result.module.label || 'Выберите модуль';
          if (result.entity) {
            const crmidEl = document.getElementById('formRelatedCrmid');
            if (crmidEl) crmidEl.value = result.entity.crmid;
            if (selectedLabel) selectedLabel.textContent = result.entity.name;
            if (selectedEl) selectedEl.style.display = 'flex';
          } else {
            clearFormRelatedSelection();
          }
        }
      };

      const renderModuleList = () => {
        mode = 'modules';
        selectedModule = null;
        const titleEl = header.querySelector('.picker-modal-title');
        titleEl.textContent = 'Связано с';
        const backBtn = header.querySelector('.picker-modal-back');
        if (backBtn) backBtn.remove();
        const searchEl = modal.querySelector('.picker-modal-search');
        if (searchEl) searchEl.remove();
        list.innerHTML = '';
        moduleOpts.forEach((opt) => {
          const el = document.createElement('div');
          el.className = 'picker-modal-option' + (opt.value === currentModule ? ' selected' : '') + (opt.disabled ? ' disabled' : '');
          el.textContent = opt.label;
          el.dataset.value = opt.value;
          list.appendChild(el);
        });
      };

      const renderSearchView = (mod) => {
        mode = 'search';
        selectedModule = mod;
        const titleEl = header.querySelector('.picker-modal-title');
        titleEl.textContent = mod.label;

        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.className = 'picker-modal-back';
        backBtn.innerHTML = '‹';
        header.insertBefore(backBtn, titleEl);
        backBtn.addEventListener('click', renderModuleList);

        const searchWrapEl = document.createElement('div');
        searchWrapEl.className = 'picker-modal-search';
        searchWrapEl.innerHTML = `<input type="text" placeholder="Поиск..." /><svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
        modal.insertBefore(searchWrapEl, list);
        const sInput = searchWrapEl.querySelector('input');

        list.innerHTML = '';
        const emptyEl = document.createElement('div');
        emptyEl.className = 'picker-modal-empty';
        emptyEl.textContent = 'Введите наименование для поиска';
        list.appendChild(emptyEl);

        sInput.focus();
        sInput.addEventListener('input', () => {
          if (sTimeout) clearTimeout(sTimeout);
          const q = sInput.value.trim();
          if (!q) {
            list.innerHTML = '';
            const hint = document.createElement('div');
            hint.className = 'picker-modal-empty';
            hint.textContent = 'Введите наименование для поиска';
            list.appendChild(hint);
            return;
          }
          sTimeout = setTimeout(async () => {
            list.innerHTML = '';
            const loadEl = document.createElement('div');
            loadEl.className = 'picker-modal-empty';
            loadEl.textContent = 'Поиск...';
            list.appendChild(loadEl);
            try {
              const items = await (searchRelatedFn || searchRelated)(mod.value, q, dependencies);
              list.innerHTML = '';
              if (items.length === 0) {
                const noRes = document.createElement('div');
                noRes.className = 'picker-modal-empty';
                noRes.textContent = 'Ничего не найдено';
                list.appendChild(noRes);
              } else {
                items.forEach((item) => {
                  const el = document.createElement('div');
                  el.className = 'picker-modal-option';
                  el.textContent = item.name;
                  el.dataset.crmid = item.crmid;
                  list.appendChild(el);
                });
              }
            } catch (err) {
              list.innerHTML = '';
              const errEl = document.createElement('div');
              errEl.className = 'picker-modal-empty';
              errEl.textContent = 'Ошибка поиска';
              list.appendChild(errEl);
            }
          }, 300);
        });
      };

      header.querySelector('.picker-modal-close').addEventListener('click', () => close(null));
      backdrop.addEventListener('click', (ev) => { if (ev.target === backdrop) close(null); });
      list.addEventListener('click', (ev) => {
        const opt = ev.target.closest('.picker-modal-option');
        if (!opt || opt.classList.contains('disabled')) return;
        if (mode === 'modules') {
          renderSearchView({ value: opt.dataset.value, label: opt.textContent });
        } else if (mode === 'search' && opt.dataset.crmid) {
          close({ module: selectedModule, entity: { crmid: opt.dataset.crmid, name: opt.textContent.trim() } });
        }
      });
    });
    moduleTrigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); moduleTrigger.click(); }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearFormRelatedSelection();
      if (moduleInput) moduleInput.value = '';
      if (moduleLabel) moduleLabel.textContent = 'Выберите модуль';
    });
  }
}

export function setupEventListeners(dependencies = {}) {
  const form = document.getElementById('taskForm');
  if (form) {
    form.addEventListener('submit', (e) => handleSubmit(e, dependencies));
  }
  const themeEl = _formEl('taskTheme');
  if (themeEl && dependencies.updateCreateButtonState) {
    themeEl.addEventListener('input', () => dependencies.updateCreateButtonState(dependencies));
    themeEl.addEventListener('change', () => dependencies.updateCreateButtonState(dependencies));
  }
  const formTaskResultInput = document.getElementById('formTaskResult');
  if (formTaskResultInput) {
    formTaskResultInput.addEventListener('input', () => {
      if (dependencies.updateCreateButtonState) dependencies.updateCreateButtonState(dependencies);
    });
  }
  const taskDescEl = _formEl('taskDesc');
  if (taskDescEl && dependencies.updateCreateButtonState) {
    taskDescEl.addEventListener('input', () => dependencies.updateCreateButtonState(dependencies));
    taskDescEl.addEventListener('change', () => dependencies.updateCreateButtonState(dependencies));
  }
  const taskStartInput = document.getElementById('taskStart');
  const taskEndInput = document.getElementById('taskEnd');
  if (taskStartInput && dependencies.updateCreateButtonState) {
    taskStartInput.addEventListener('change', () => dependencies.updateCreateButtonState(dependencies));
  }
  if (taskEndInput && dependencies.updateCreateButtonState) {
    taskEndInput.addEventListener('change', () => dependencies.updateCreateButtonState(dependencies));
  }
  const cancelTaskBtn = document.getElementById('cancelTaskFormBtn');
  if (cancelTaskBtn) {
    cancelTaskBtn.addEventListener('click', () => { closeTaskFormModal(); resetForm(dependencies); });
  }
  const plusBtn = document.getElementById('plusBtn');
  if (plusBtn) {
    plusBtn.addEventListener('click', () => {
      resetForm(dependencies);
      openTaskFormModal();
    });
  }
  const closeTaskFormBtn = document.getElementById('closeTaskFormBtn');
  if (closeTaskFormBtn) {
    closeTaskFormBtn.addEventListener('click', () => { closeTaskFormModal(); resetForm(dependencies); });
  }
  // Закрытие формы по клику на overlay (вне модалки)
  const taskFormModal = document.getElementById('taskFormModal');
  if (taskFormModal) {
    taskFormModal.addEventListener('click', (e) => {
      if (e.target === taskFormModal) { closeTaskFormModal(); resetForm(dependencies); }
    });
  }
  const settingsBtn = document.getElementById('settingsBtn');
  const statsBtn = document.getElementById('statsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      const cur = document.querySelector('.tab-pane.active');
      if (cur && cur.id === 'tabSettings') switchTab('tasks', dependencies);
      else switchTab('settings', dependencies);
    });
  }
  if (statsBtn) {
    statsBtn.addEventListener('click', () => {
      const cur = document.querySelector('.tab-pane.active');
      if (cur && cur.id === 'tabStats') switchTab('tasks', dependencies);
      else switchTab('stats', dependencies);
    });
  }

  setupGroupDropdown(dependencies);
  setupFormGroupDropdown(dependencies);
  setupTasksDelegation(dependencies);
  setupSettingsTab(dependencies);

  const taskSortToggleBtn = document.getElementById('taskSortToggleBtn');
  const sortIconAsc = taskSortToggleBtn?.querySelector('.sort-icon-asc');
  const sortIconDesc = taskSortToggleBtn?.querySelector('.sort-icon-desc');
  const updateSortIcon = () => {
    const asc = (taskSortOrder || 'date_desc') === 'date_asc';
    if (sortIconAsc) sortIconAsc.style.display = asc ? '' : 'none';
    if (sortIconDesc) sortIconDesc.style.display = asc ? 'none' : '';
    if (taskSortToggleBtn) taskSortToggleBtn.title = asc ? 'Сперва старые' : 'Сперва новые';
  };
  updateSortIcon();
  if (taskSortToggleBtn) {
    taskSortToggleBtn.addEventListener('click', async () => {
      const next = (taskSortOrder || 'date_desc') === 'date_asc' ? 'date_desc' : 'date_asc';
      await chrome.storage.sync.set({ taskSortOrder: next });
      setTaskSortOrder(next);
      updateSortIcon();
      const last = _lastRenderedTasks;
      if (last && last.length && dependencies.renderTasks) dependencies.renderTasks([...last]);
    });
  }
  initDateTimePickers();
  setupCustomDropdowns(dependencies);
  setupFormRelated(dependencies);

  const interval = setInterval(refreshTaskTimeBadges, 30000);
  setTimeRefreshInterval(interval);
  const noteTimerInterval = setInterval(refreshNoteTimerDisplays, 1000);
  if (window._noteTimerInterval) clearInterval(window._noteTimerInterval);
  window._noteTimerInterval = noteTimerInterval;

  // Polling заметок — синхронизация между пользователями группы
  startSyncNotesPolling(dependencies);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'addTaskFromSelection') {
      (async () => {
        if (message.group && !groups.includes(message.group)) {
          groups.push(message.group);
          await saveGroups();
          if (dependencies.renderGroupDropdownList) dependencies.renderGroupDropdownList(dependencies);
        }
        if (message.group) setFormGroupSelection(message.group);
        updateGroupTriggerLabel();
        resetForm(dependencies);
        openTaskFormModal();
        const themeEl = _formEl('taskTheme');
        if (themeEl) { themeEl.value = message.text; themeEl.focus(); }
        sendResponse({ success: true });
      })();
      return true;
    }
    return true;
  });
}
