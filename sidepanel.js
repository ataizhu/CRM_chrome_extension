// sidepanel.js - Главный файл приложения

// Импорты модулей
import * as Config from './js/config.js';
import * as Storage from './js/storage.js';
import * as Utils from './js/utils.js';
import * as Auth from './js/auth.js';
import * as API from './js/api.js';
import * as Groups from './js/groups.js';
import * as Tasks from './js/tasks.js';
import * as Render from './js/render.js';
import * as UI from './js/ui.js';
import * as DateTimePicker from './js/datetime-picker.js';
import * as Modals from './js/modals.js';
import * as Stats from './js/stats.js';
import * as Changelog from './js/changelog.js';

// Экспортируем функции для использования в модулях
window.Config = Config;
window.Storage = Storage;
window.Utils = Utils;
window.Auth = Auth;
window.API = API;
window.Groups = Groups;
window.Tasks = Tasks;
window.Render = Render;
window.UI = UI;
window.DateTimePicker = DateTimePicker;
window.Modals = Modals;
window.Stats = Stats;

// Функция применения темы
function applyTheme(t) {
  Config.applyTheme(t);
}

let _autoLoadIntervalId = null;

function stopAutoLoad() {
  if (_autoLoadIntervalId != null) {
    clearInterval(_autoLoadIntervalId);
    _autoLoadIntervalId = null;
  }
}

async function applyAutoLoad(deps) {
  stopAutoLoad();
  const { autoLoadEnabled, autoLoadIntervalMinutes } = await chrome.storage.sync.get(['autoLoadEnabled', 'autoLoadIntervalMinutes']);
  const enabled = autoLoadEnabled === true;
  const minutes = Math.max(5, Math.min(60, parseInt(autoLoadIntervalMinutes, 10) || 15));
  const authed = deps.isAuthed && deps.isAuthed();

  // При открытии панели — всегда мгновенно из кэша (API-запросы только по таймеру)
  if (deps.loadTasks) await deps.loadTasks(deps, { useCacheOnly: true });

  if (enabled && authed) {
    const ms = minutes * 60 * 1000;
    _autoLoadIntervalId = setInterval(() => {
      if (deps.loadTasks) deps.loadTasks(deps); // полная загрузка по таймеру
    }, ms);
  }
}

// Проверка отложенной задачи из контекстного меню
async function checkPendingTask() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['pendingTask'], async (result) => {
      if (result.pendingTask) {
        const { text, group } = result.pendingTask;
        if (group && !Config.groups.includes(group)) {
          Config.groups.push(group);
          await Groups.saveGroups();
          Groups.renderGroupDropdownList();
        }
        if (group) Config.setSelectedGroup(group);
        Groups.updateGroupTriggerLabel();
        UI.resetForm(getDependencies());
        Modals.openTaskFormModal();
        const themeEl = Utils._formEl('taskTheme');
        if (themeEl) { themeEl.value = text; themeEl.focus(); }
        chrome.storage.local.remove(['pendingTask']);
      }
      resolve();
    });
  });
}

// Создаем объект зависимостей для передачи между модулями
function getDependencies() {
  return {
    // Config
    ...Config,
    // Storage
    loadConfig: Storage.loadConfig,
    loadPersonalTasks: Storage.loadPersonalTasks,
    savePersonalTasks: Storage.savePersonalTasks,
    loadDeletedCrmTasks: Storage.loadDeletedCrmTasks,
    saveDeletedCrmTasks: Storage.saveDeletedCrmTasks,
    markCrmTaskAsDeleted: Storage.markCrmTaskAsDeleted,
    // Auth
    isAuthed: Auth.isAuthed,
    checkAuth: Auth.checkAuth,
    login: Auth.login,
    logout: Auth.logout,
    clearAuth: Auth.clearAuth,
    showLoginError: Auth.showLoginError,
    // API
    apiFetch: API.apiFetch,
    fetchTasksFromAPI: API.fetchTasksFromAPI,
    fetchEventStatuses: API.fetchEventStatuses,
    fetchActivityTypes: API.fetchActivityTypes,
    fetchRelatedModules: API.fetchRelatedModules,
    searchRelated: API.searchRelated,
    fetchUsers: API.fetchUsers,
    // Groups
    loadGroups: Groups.loadGroups,
    saveGroups: Groups.saveGroups,
    renderGroupDropdownList: Groups.renderGroupDropdownList,
    updateGroupTriggerLabel: Groups.updateGroupTriggerLabel,
    renderFormGroupDropdownList: Groups.renderFormGroupDropdownList,
    updateFormGroupTriggerLabel: Groups.updateFormGroupTriggerLabel,
    setFormGroupSelection: Groups.setFormGroupSelection,
    updateFormMode: Groups.updateFormMode,
    setupGroupDropdown: Groups.setupGroupDropdown,
    setupFormGroupDropdown: Groups.setupFormGroupDropdown,
    renderGroupsManagementList: Groups.renderGroupsManagementList,
    isCrmForm: Groups.isCrmForm,
    isCrmGroup: Groups.isCrmGroup,
    reorderGroups: Groups.reorderGroups,
    // Tasks
    loadTasks: Tasks.loadTasks,
    loadMergedTasks: Tasks.loadMergedTasks,
    createTask: Tasks.createTask,
    updateTask: Tasks.updateTask,
    deleteTask: Tasks.deleteTask,
    toggleTaskComplete: Tasks.toggleTaskComplete,
    completeCrmTaskWithDescription: Tasks.completeCrmTaskWithDescription,
    setTaskStatus: Tasks.setTaskStatus,
    getTasksByPeriod: Tasks.getTasksByPeriod,
    deletePersonalTask: Tasks.deletePersonalTask,
    // Render
    renderTasks: Render.renderTasks,
    refreshTaskTimeBadges: Render.refreshTaskTimeBadges,
    toggleGroup: Render.toggleGroup,
    // UI
    updateSettingsUI: UI.updateSettingsUI,
    setupSettingsTab: UI.setupSettingsTab,
    editTask: UI.editTask,
    resetForm: UI.resetForm,
    updateCreateButtonState: UI.updateCreateButtonState,
    loadFormRelatedModules: UI.loadFormRelatedModules,
    loadSyncGroupsForForm: UI.loadSyncGroupsForForm,
    handleSubmit: UI.handleSubmit,
    setupTasksDelegation: UI.setupTasksDelegation,
    setupEventListeners: UI.setupEventListeners,
    showSyncStatus: UI.showSyncStatus,
    isRecordingPlaying: UI.isRecordingPlaying,
    getActiveRecordingState: UI.getActiveRecordingState,
    restoreRecordingPlayback: UI.restoreRecordingPlayback,
    applyAutoLoad,
    stopAutoLoad,
    // DateTimePicker
    getDateTimePickerValue: DateTimePicker.getDateTimePickerValue,
    setDateTimePickerValue: DateTimePicker.setDateTimePickerValue,
    resetDateTimePickers: DateTimePicker.resetDateTimePickers,
    initDateTimePickers: DateTimePicker.initDateTimePickers,
    // Modals
    openTaskFormModal: Modals.openTaskFormModal,
    closeTaskFormModal: Modals.closeTaskFormModal,
    showGroupSelectionModal: Modals.showGroupSelectionModal,
    // Stats
    renderStats: Stats.renderStats,
    switchTab: Stats.switchTab,
    // Utils
    showError: Utils.showError,
    hideError: Utils.hideError,
    showLoading: Utils.showLoading,
    hideLoading: Utils.hideLoading,
    _formEl: Utils._formEl,
  };
}

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
  const deps = getDependencies();

  await Storage.loadConfig();
  Config.applyTheme(Config.theme);
  await Auth.checkAuth();
  await Groups.loadGroups(deps);
  UI.setupEventListeners(deps);
  applyAutoLoad(deps);
  Groups.updateGroupTriggerLabel();
  UI.loadSyncGroupsForForm(deps);
  await checkPendingTask();
  await Changelog.showChangelogIfNew();

  // Подгрузка Личных и Заметок при синхронизации профиля (другой браузер/устройство)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.personalTasks && deps.loadTasks) {
      deps.loadTasks(deps, { useCacheOnly: true });
    }
  });
});

// Экспортируем для глобального доступа (на случай необходимости)
window.checkPendingTask = checkPendingTask;
window.applyTheme = applyTheme;
window.getDependencies = getDependencies;
