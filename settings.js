const API_ENDPOINT = 'https://vtiger.crm.kg/api-for-chrome-extension/extensionAPI_v1.php';

async function getStoredAuth() {
  const sync = await chrome.storage.sync.get(['authToken', 'user', 'vtigerCredentials']);
  if (sync.vtigerCredentials || sync.authToken) return sync;
  const local = await chrome.storage.local.get(['authToken', 'user', 'vtigerCredentials']);
  return local;
}

function apiFetch(url, options = {}) {
  const credentials = options.credentials;
  const headers = { ...options.headers };
  if (credentials && credentials.username && credentials.password) {
    headers.Authorization = 'Basic ' + btoa(unescape(encodeURIComponent(credentials.username + ':' + credentials.password)));
  }
  return fetch(url, { ...options, headers });
}

(async () => {
  const apiUrlEl = document.getElementById('apiUrl');
  const authEl = document.getElementById('authEndpoint');
  const saveBtn = document.getElementById('saveApiBtn');
  const themeOpts = document.querySelectorAll('.theme-option');
  const notifyEl = document.getElementById('notifyEnabled');
  const accountInfo = document.getElementById('accountInfo');
  const logoutBtn = document.getElementById('logoutBtn');
  const syncGroupsSection = document.getElementById('syncGroupsSection');
  const syncGroupsList = document.getElementById('syncGroupsList');
  const syncGroupsError = document.getElementById('syncGroupsError');
  const syncGroupsLoading = document.getElementById('syncGroupsLoading');

  const { theme, notifyEnabled } = await chrome.storage.sync.get(['theme', 'notifyEnabled']);
  const stored = await getStoredAuth();
  const authToken = stored.authToken;
  const user = stored.user;
  const vtigerCredentials = stored.vtigerCredentials;

  apiUrlEl?.closest('.field') && (apiUrlEl.closest('.field').style.display = 'none');
  authEl?.closest('.field') && (authEl.closest('.field').style.display = 'none');
  if (theme === 'dark' || theme === 'light') {
    document.body.classList.toggle('dark-theme', theme === 'dark');
    themeOpts.forEach((b) => b.classList.toggle('active', b.dataset.theme === theme));
  }
  if (notifyEnabled != null) notifyEl.checked = !!notifyEnabled;

  const hasAuth = !!(authToken || vtigerCredentials);
  if (hasAuth) {
    accountInfo.textContent = (user && (user.username || user.email)) ? (user.username || user.email) : 'Авторизован';
    logoutBtn.style.display = 'block';
  } else {
    accountInfo.textContent = 'Не авторизован';
  }

  function showSyncError(msg) {
    syncGroupsError.textContent = msg || '';
    syncGroupsError.style.display = msg ? 'block' : 'none';
  }
  function renderSyncGroups(data) {
    syncGroupsList.innerHTML = '';
    showSyncError('');
    if (data.error && !data.groups) {
      showSyncError(data.error);
      return;
    }
    const groups = data.groups || [];
    if (data.is_super_admin) {
      if (groups.length === 0) {
        syncGroupsList.innerHTML = '<p class="sync-loading">Групп пока нет. Добавьте их в Supabase.</p>';
      } else {
        groups.forEach((g) => {
          const card = document.createElement('div');
          card.className = 'sync-group-card';
          const nameEl = document.createElement('div');
          nameEl.className = 'sync-group-name';
          nameEl.textContent = g.name || 'Без названия';
          const ul = document.createElement('ul');
          ul.className = 'sync-group-members';
          (g.members || []).forEach((m) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${m.vtiger_user_id}</span> <span class="role-badge ${m.role === 'admin' ? 'admin' : ''}">${m.role === 'admin' ? 'админ' : 'участник'}</span>`;
            ul.appendChild(li);
          });
          if ((g.members || []).length === 0) ul.innerHTML = '<li>Нет участников</li>';
          card.appendChild(nameEl);
          card.appendChild(ul);
          syncGroupsList.appendChild(card);
        });
      }
    } else {
      if (groups.length > 0) {
        groups.forEach((g) => {
          const card = document.createElement('div');
          card.className = 'sync-group-card';
          card.innerHTML = `<div class="sync-group-name">${(g.name || 'Без названия')}</div><ul class="sync-group-members"><li>Участник</li></ul>`;
          syncGroupsList.appendChild(card);
        });
      }
    }
  }

  // Показываем блок «Группы синхронизации» при любой авторизации
  if (hasAuth) {
    syncGroupsSection.style.display = 'block';
    const hasCreds = vtigerCredentials && vtigerCredentials.username && vtigerCredentials.password;
    if (!hasCreds) {
      syncGroupsLoading.style.display = 'none';
      showSyncError('Чтобы видеть группы из Supabase, войдите в расширении по логину и паролю CRM (в боковой панели).');
      syncGroupsList.innerHTML = '';
    } else {
      syncGroupsLoading.style.display = 'block';
      try {
        const res = await apiFetch(`${API_ENDPOINT}?action=sync-groups`, { credentials: vtigerCredentials });
        const data = await res.json().catch(() => ({}));
        syncGroupsLoading.style.display = 'none';
        if (!res.ok) {
          showSyncError(data.error || data.message || `Ошибка ${res.status}`);
          renderSyncGroups({ groups: [] });
        } else {
          renderSyncGroups(data);
        }
      } catch (e) {
        syncGroupsLoading.style.display = 'none';
        showSyncError('Не удалось загрузить группы. Проверьте доступ к API и интернет.');
        renderSyncGroups({ groups: [] });
      }
    }
  }

  saveBtn.addEventListener('click', async () => {
    await chrome.storage.sync.set({ notifyEnabled: notifyEl.checked });
  });

  themeOpts.forEach((b) => {
    b.addEventListener('click', async () => {
      const t = b.dataset.theme;
      await chrome.storage.sync.set({ theme: t });
      document.body.classList.toggle('dark-theme', t === 'dark');
      themeOpts.forEach((x) => x.classList.toggle('active', x.dataset.theme === t));
    });
  });

  logoutBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove(['authToken', 'user', 'vtigerCredentials']);
    await chrome.storage.sync.remove(['authToken', 'user', 'vtigerCredentials']);
    accountInfo.textContent = 'Не авторизован';
    logoutBtn.style.display = 'none';
    syncGroupsSection.style.display = 'none';
  });
})();
