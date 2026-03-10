// auth.js - Авторизация

import { authEndpoint, authMode, authToken, user, vtigerCredentials, setAuthToken, setUser, setVtigerCredentials } from './config.js';
import { loadAuth, saveAuth, clearAuth as clearAuthStorage } from './storage.js';
import { _formEl, loginModal, loginForm } from './utils.js';

// Проверка необходимости логина
export function requiresLogin() {
  return !!authEndpoint;
}

export function isVtigerAuth() {
  return authMode === 'vtiger' || authMode === 'vtiger_password';
}

export function isAuthed() {
  if (isVtigerAuth()) return !!vtigerCredentials;
  return !!authToken;
}

export async function checkAuth() {
  const result = await loadAuth();
  setAuthToken(result.authToken);
  setUser(result.user);
  setVtigerCredentials(result.vtigerCredentials);
  if (vtigerCredentials && !user) {
    setUser({ username: vtigerCredentials.username });
  }
  if (typeof window !== 'undefined' && result.user && result.user.id != null) {
    window._currentVtigerUserId = String(result.user.id);
  }
}

export async function saveAuthToken(token, userData = null) {
  setAuthToken(token);
  setUser(userData);
  await saveAuth({ authToken: token, user: userData });
}

export async function saveVtigerCredentials(cred) {
  setVtigerCredentials(cred);
  await saveAuth({ vtigerCredentials: cred });
}

export async function clearAuth() {
  setAuthToken(null);
  setUser(null);
  setVtigerCredentials(null);
  await clearAuthStorage();
}

export function showLoginModal() {
  const lab = document.getElementById('loginPasswordLabel');
  const pw = document.getElementById('loginPassword');
  const hint = document.getElementById('loginHint');
  if (authMode === 'vtiger') {
    if (lab) lab.textContent = 'Access Key';
    if (pw) { pw.placeholder = 'Access Key'; pw.type = 'password'; }
    if (hint) hint.textContent = 'Логин и Access Key из CRM (Настройки → Сменить Access Key).';
  } else if (authMode === 'vtiger_password') {
    if (lab) lab.textContent = 'Пароль';
    if (pw) { pw.placeholder = 'Пароль'; pw.type = 'password'; }
    if (hint) hint.textContent = 'Логин и пароль как при входе в веб-интерфейс Vtiger.';
  } else {
    if (lab) lab.textContent = 'Пароль';
    if (pw) { pw.placeholder = 'Пароль'; pw.type = 'password'; }
    if (hint) hint.textContent = 'Настройте API и endpoint авторизации в настройках.';
  }
  if (loginModal) loginModal.style.display = 'flex';
  hideLoginError();
}

export function hideLoginModal() {
  if (loginModal) loginModal.style.display = 'none';
}

export function showLoginError(msg) {
  const loginError = document.getElementById('loginError');
  if (loginError) {
    loginError.textContent = msg;
    loginError.style.display = 'block';
  }
}

export function hideLoginError() {
  const loginError = document.getElementById('loginError');
  if (loginError) {
    loginError.textContent = '';
    loginError.style.display = 'none';
  }
}

// Функция login будет импортировать зависимости динамически
export async function login(username, password, dependencies = {}) {
  const { updateSettingsUI, loadGroups, loadTasks, updateGroupTriggerLabel, renderGroupDropdownList, renderFormGroupDropdownList, updateFormGroupTriggerLabel, checkPendingTask } = dependencies;
  
  hideLoginError();
  const loginSubmitBtn = _formEl('loginSubmitBtn');
  if (loginSubmitBtn) loginSubmitBtn.disabled = true;
  try {
    if (authMode === 'vtiger_password') {
      if (!authEndpoint) {
        showLoginError('Endpoint авторизации не настроен.');
        return false;
      }
      const res = await fetch(`${authEndpoint}?action=login&debug=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (data._debug && Array.isArray(data._debug)) {
        // console.group('🔍 Login Debug Logs');
        // data._debug.forEach(log => console.log(log));
        // console.groupEnd();
      }
      // console.log('Login response:', { status: res.status, statusText: res.statusText, data: { ...data, _debug: undefined } });
      if (!res.ok) {
        showLoginError(data.message || data.error || `Ошибка ${res.status}`);
        return false;
      }
      const userData = data.user ? { username: data.user.username || data.user.user_name || username, id: data.user.id } : { username };
      await saveVtigerCredentials({ username, password });
      setUser(userData);
      await saveAuth({ user: userData });
      if (loginForm) loginForm.reset();
      hideLoginError();
      if (updateSettingsUI) await updateSettingsUI();
      if (loadGroups) await loadGroups(dependencies);
      if (renderGroupDropdownList) renderGroupDropdownList(dependencies);
      if (renderFormGroupDropdownList) renderFormGroupDropdownList();
      
      // Автоматически добавляем CRM в видимые группы после авторизации (если пользователь не удалял её)
      const { visibleGroups: currentVisibleGroups, setVisibleGroups } = await import('./config.js');
      const { loadUserHiddenGroups } = await import('./storage.js');
      const hidden = await loadUserHiddenGroups();
      if (!hidden.includes('CRM') && !currentVisibleGroups.includes('CRM')) {
        const newVisibleGroups = [...currentVisibleGroups, 'CRM'];
        setVisibleGroups(newVisibleGroups);
        await chrome.storage.sync.set({ visibleGroups: newVisibleGroups });
        if (renderGroupDropdownList) renderGroupDropdownList(dependencies);
      }
      
      if (dependencies.applyAutoLoad) await dependencies.applyAutoLoad(dependencies);
      if (updateGroupTriggerLabel) updateGroupTriggerLabel();
      if (updateFormGroupTriggerLabel) updateFormGroupTriggerLabel();
      if (checkPendingTask) await checkPendingTask();
      return true;
    }

    if (authMode === 'vtiger') {
      if (!authEndpoint) {
        showLoginError('Endpoint авторизации не настроен.');
        return false;
      }
      const meUrl = `${authEndpoint}?action=me`;
      const b64 = btoa(unescape(encodeURIComponent(`${username}:${password}`)));
      const res = await fetch(meUrl, {
        method: 'GET',
        headers: { 'Authorization': `Basic ${b64}` },
      });
      const responseText = await res.clone().text().catch(() => '');
      // console.log('Login (vtiger) response:', { status: res.status, statusText: res.statusText, body: responseText });
      if (!res.ok) {
        const t = await res.text();
        let msg = `Ошибка ${res.status}`;
        try { const j = JSON.parse(t); msg = j.message || j.error || msg; } catch (_) { }
        showLoginError(msg);
        return false;
      }
      const data = await res.json().catch(() => ({}));
      const result = data.result || data;
      await saveVtigerCredentials({ username, password });
      let userData = { username: result.user_name || result.first_name || result.email1 || username };
      if (result.id != null) userData.id = result.id;
      else {
        try {
          const sgRes = await fetch(`${authEndpoint}?action=sync-groups`, {
            method: 'GET',
            headers: { 'Authorization': `Basic ${b64}` },
          });
          if (sgRes.ok) {
            const sgData = await sgRes.json().catch(() => ({}));
            if (sgData.my_user_id != null) userData.id = sgData.my_user_id;
          }
        } catch (_) {}
      }
      setUser(userData);
      if (userData.id) window._currentVtigerUserId = String(userData.id);
      await saveAuth({ user: userData });
      if (loginForm) loginForm.reset();
      hideLoginError();
      if (updateSettingsUI) await updateSettingsUI();
      if (loadGroups) await loadGroups(dependencies);
      if (renderGroupDropdownList) renderGroupDropdownList(dependencies);
      if (renderFormGroupDropdownList) renderFormGroupDropdownList();
      
      // Автоматически добавляем CRM в видимые группы после авторизации (если пользователь не удалял её)
      const { visibleGroups: currentVisibleGroups, setVisibleGroups } = await import('./config.js');
      const { loadUserHiddenGroups } = await import('./storage.js');
      const hidden = await loadUserHiddenGroups();
      if (!hidden.includes('CRM') && !currentVisibleGroups.includes('CRM')) {
        const newVisibleGroups = [...currentVisibleGroups, 'CRM'];
        setVisibleGroups(newVisibleGroups);
        await chrome.storage.sync.set({ visibleGroups: newVisibleGroups });
        if (renderGroupDropdownList) renderGroupDropdownList(dependencies);
      }
      
      if (dependencies.applyAutoLoad) await dependencies.applyAutoLoad(dependencies);
      if (updateGroupTriggerLabel) updateGroupTriggerLabel();
      if (updateFormGroupTriggerLabel) updateFormGroupTriggerLabel();
      if (checkPendingTask) await checkPendingTask();
      return true;
    }

    if (!authEndpoint) {
      showLoginError('Укажите endpoint авторизации в настройках.');
      return false;
    }
    const res = await fetch(`${authEndpoint}?action=login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, login: username, password }),
    });
    const data = await res.json().catch(() => ({}));
    // console.log('Login (bearer) response:', { status: res.status, statusText: res.statusText, data });
    if (!res.ok) {
      showLoginError(data.message || data.error || `Ошибка ${res.status}`);
      return false;
    }
    const token = data.token ?? data.access_token ?? data.accessToken ?? data.jwt;
    if (!token) {
      showLoginError('Сервер не вернул токен.');
      return false;
    }
    await saveAuthToken(token, data.user ?? { username });
    if (loginForm) loginForm.reset();
    hideLoginError();
    if (updateSettingsUI) await updateSettingsUI();
    if (loadGroups) await loadGroups(dependencies);
    
    // Автоматически добавляем CRM в видимые группы после авторизации (если пользователь не удалял её)
    const { visibleGroups: currentVisibleGroups, setVisibleGroups } = await import('./config.js');
    const { loadUserHiddenGroups } = await import('./storage.js');
    const hidden = await loadUserHiddenGroups();
    if (!hidden.includes('CRM') && !currentVisibleGroups.includes('CRM')) {
      const newVisibleGroups = [...currentVisibleGroups, 'CRM'];
      setVisibleGroups(newVisibleGroups);
      await chrome.storage.sync.set({ visibleGroups: newVisibleGroups });
    }
    
    if (dependencies.applyAutoLoad) await dependencies.applyAutoLoad(dependencies);
    if (updateGroupTriggerLabel) updateGroupTriggerLabel();
    if (checkPendingTask) await checkPendingTask();
    return true;
  } finally {
    const loginSubmitBtn = _formEl('loginSubmitBtn');
    if (loginSubmitBtn) loginSubmitBtn.disabled = false;
  }
}

export async function logout(dependencies = {}) {
  const { loadTasks, updateSettingsUI, loadGroups, renderGroupDropdownList, renderFormGroupDropdownList, updateGroupTriggerLabel, updateFormGroupTriggerLabel } = dependencies;
  await clearAuth();
  if (loadGroups) await loadGroups(dependencies);
  if (renderGroupDropdownList) renderGroupDropdownList(dependencies);
  if (renderFormGroupDropdownList) renderFormGroupDropdownList();
  if (updateGroupTriggerLabel) updateGroupTriggerLabel();
  if (updateFormGroupTriggerLabel) updateFormGroupTriggerLabel();
  if (loadTasks) await loadTasks(dependencies);
  if (updateSettingsUI) await updateSettingsUI();
}
