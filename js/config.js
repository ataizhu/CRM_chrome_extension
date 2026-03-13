// config.js - Конфигурация и глобальные переменные состояния

// Константы
export const API_ENDPOINT = 'https://vtiger.crm.kg/api-for-chrome-extension/extensionAPI_v1.php';
export const DEFAULT_GROUPS = ['CRM', 'Личные', 'Заметки'];
export const STORAGE_KEY_PERSONAL = 'personalTasks';
export const STORAGE_KEY_DELETED_CRM = 'deletedCrmTasks';
export const STORAGE_KEY_CRM_CACHE = 'crmTasksCache';
export const STORAGE_KEY_USER_HIDDEN_GROUPS = 'userHiddenGroups';
export const STATS_COLORS = ['#4c6ef5', '#00bfff', '#51cf66', '#ffd43b', '#ff6b6b', '#9775fa', '#ff8787', '#69db7c'];

// Глобальные переменные состояния
export let authEndpoint = API_ENDPOINT;
export let selectedGroup = '';
export let groups = [];
export let visibleGroups = []; // Группы, отображаемые в основной области
export let theme = 'light';
export let authToken = null;
export let user = null;
export let syncPeriod = 'month';
export let authMode = 'vtiger_password'; // По умолчанию vtiger_password, так как endpoint зашит
export let vtigerCredentials = null; // { username, password }
export let _timeRefreshInterval = null;
export let formGroupSelection = '';
export let _lastRenderedTasks = [];
export let autoLoadEnabled = false;
export let autoLoadIntervalMinutes = 15;
export let _autoLoadIntervalId = null;
export let taskSortOrder = 'date_desc';
export let excludeCompleted = false;
export let excludeCancelled = false;

/** Точное начало периода: { week: true, month: false, ... }
 *  week=true → с понедельника, month=true → с 1-го числа, 3months → с 1-го числа 3 мес назад, year → с 1 января */
export let periodExactStart = {};

/** Выбранная группа синхронизации для Заметок (uuid из Supabase). Если задана — заметки грузятся/сохраняются в группе. */
export let selectedSyncGroupId = '';

/** Группа, из которой админ стягивает CRM-задачи участников (uuid). Только группы, где я admin/super_admin. */
export let crmSyncSourceGroupId = '';

/** Настройки стягивания CRM-задач других пользователей: { [vtiger_user_id]: { enabled, activityTypes[], eventStatuses[], period, autoLoad, autoLoadIntervalMinutes } }. */
export let crmSyncOtherUsers = {};
export function setCrmSyncSourceGroupId(value) { crmSyncSourceGroupId = value || ''; }
export function setCrmSyncOtherUsers(value) { crmSyncOtherUsers = value && typeof value === 'object' ? value : {}; }

/** Выбранные типы и статусы для загрузки CRM. Синхронизируются с storage. */
export let crmSyncActivityTypes = [];
export let crmSyncEventStatuses = [];

// Маппинг value (API) -> label (UI) для фильтров синхронизации CRM
export const CRM_SYNC_ACTIVITY_LABELS = {
  Call: 'Звонок',
  Meeting: 'Встреча',
  Chat: 'Чат',
  'Выполнить': 'Выполнить',
  'Письмо': 'Письмо',
};
export const CRM_SYNC_ACTIVITY_VALUES = ['Call', 'Meeting', 'Chat', 'Выполнить', 'Письмо'];

export const CRM_SYNC_STATUS_LABELS = {
  Planned: 'Запланировано',
  Held: 'Выполнено',
  'Not Held': 'Отменено',
  'В работе': 'В работе',
};
export const CRM_SYNC_STATUS_VALUES = ['Planned', 'Held', 'Not Held', 'В работе'];

// Функции для обновления состояния
export function setAuthEndpoint(value) { authEndpoint = value; }
export function setSelectedGroup(value) { selectedGroup = value; }
export function setGroups(value) { groups = value; }
export function setVisibleGroups(value) { visibleGroups = value; }
export function setAuthToken(value) { authToken = value; }
export function setUser(value) { user = value; }
export function setSyncPeriod(value) { syncPeriod = value; }
export function setAuthMode(value) { authMode = value; }
export function setVtigerCredentials(value) { vtigerCredentials = value; }
export function setTimeRefreshInterval(value) { _timeRefreshInterval = value; }
export function setFormGroupSelection(value) { formGroupSelection = value; }
export function setLastRenderedTasks(value) { _lastRenderedTasks = value; }
export function setAutoLoadEnabled(value) { autoLoadEnabled = !!value; }
export function setAutoLoadIntervalMinutes(value) { autoLoadIntervalMinutes = Math.max(5, Math.min(60, parseInt(value, 10) || 15)); }
export function setAutoLoadIntervalId(value) { _autoLoadIntervalId = value; }
export function setTaskSortOrder(value) { taskSortOrder = value === 'date_desc' ? 'date_desc' : 'date_asc'; }
export function setExcludeCompleted(value) { excludeCompleted = !!value; }
export function setExcludeCancelled(value) { excludeCancelled = !!value; }
export function setPeriodExactStart(value) { periodExactStart = value && typeof value === 'object' ? value : {}; }
export function setCrmSyncActivityTypes(value) { crmSyncActivityTypes = Array.isArray(value) ? value : []; }
export function setCrmSyncEventStatuses(value) { crmSyncEventStatuses = Array.isArray(value) ? value : []; }
export function setSelectedSyncGroupId(value) { selectedSyncGroupId = value || ''; }

// Кэш sync-групп пользователя (заполняется при загрузке настроек)
export let userSyncGroups = [];
export function setUserSyncGroups(value) { userSyncGroups = Array.isArray(value) ? value : []; }

// Кэш vtiger-пользователей {id: display_name}
export let vtigerUsersMap = {};
export function setVtigerUsersMap(value) { vtigerUsersMap = value && typeof value === 'object' ? value : {}; }

// Функция применения темы
export function applyTheme(t) {
  theme = t;
  document.body.classList.toggle('dark-theme', t === 'dark');
}

// Функция установки темы
export async function setTheme(t) {
  theme = t;
  applyTheme(t);
  await chrome.storage.sync.set({ theme });
}

/** Группа для задач других пользователей (админ). */
export const CRM_GROUP_NAME = 'CRM группа';

// Утилиты для работы с группами
export function isCrmGroup(g) {
  return g === 'CRM' || g === CRM_GROUP_NAME;
}

export function isNotesGroup(g) {
  return g === 'Заметки';
}
