// changelog.js — версия и список изменений для всплывашки

import { CHANGELOG } from './changelog-data.js';

/** Текущая версия (fallback, в рантайме берётся из manifest) */
export const APP_VERSION = CHANGELOG[0]?.version || '1.0.0';
export { CHANGELOG };

const STORAGE_KEY_LAST_SEEN_VERSION = 'lastSeenVersion';

export async function getLastSeenVersion() {
  const r = await chrome.storage.local.get([STORAGE_KEY_LAST_SEEN_VERSION]);
  return r[STORAGE_KEY_LAST_SEEN_VERSION] || null;
}

export async function setLastSeenVersion(version) {
  await chrome.storage.local.set({ [STORAGE_KEY_LAST_SEEN_VERSION]: version });
}

function escapeHtmlChangelog(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/** Показать модалку с changelog. Возвращает Promise, резолвится при закрытии. */
export function showChangelogModal() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay changelog-overlay';
    overlay.style.display = 'flex';

    const modal = document.createElement('div');
    modal.className = 'modal changelog-modal';
    modal.style.maxWidth = '420px';
    modal.style.maxHeight = '85vh';
    modal.style.overflow = 'hidden';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';

    const versionFromManifest = typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.()?.version || APP_VERSION;
    const html = `
      <div class="modal-head" style="flex-shrink: 0;">
        <h2 style="margin: 0; font-size: 1.1rem;">Что нового · v${versionFromManifest}</h2>
        <button type="button" class="icon-btn close-modal-btn" aria-label="Закрыть">✕</button>
      </div>
      <div class="changelog-body" style="padding: 16px 20px; overflow-y: auto; flex: 1;">
        ${CHANGELOG.map((entry) => `
          <div class="changelog-entry" style="margin-bottom: 16px;">
            <div class="changelog-version" style="font-weight: 600; color: var(--foreground); margin-bottom: 4px;">
              v${entry.version}${entry.date && entry.date !== '—' ? ` · ${entry.date}` : ''}
            </div>
            ${entry.title ? `<div class="changelog-title" style="font-size: 12px; color: var(--muted-foreground); margin-bottom: 6px;">${entry.title}</div>` : ''}
            <ul class="changelog-list" style="margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.5; color: var(--foreground);">
              ${(entry.items || []).map((item) => `<li style="margin-bottom: 4px;">${escapeHtmlChangelog(item)}</li>`).join('')}
            </ul>
          </div>
        `).join('')}
      </div>
      <div class="modal-footer" style="padding: 12px 20px; border-top: 1px solid var(--border); flex-shrink: 0;">
        <button type="button" class="btn-dock btn-dock-primary close-changelog-btn" style="width: 100%;">Понятно</button>
      </div>
    `;

    modal.innerHTML = html;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => {
      document.body.removeChild(overlay);
      resolve();
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    modal.querySelector('.close-modal-btn').addEventListener('click', close);
    modal.querySelector('.close-changelog-btn').addEventListener('click', close);
  });
}

/**
 * Если сохранённая версия отличается от текущей — показать changelog и сохранить текущую.
 * При первой установке (lastSeen === null) не показываем, только сохраняем версию.
 */
export async function showChangelogIfNew() {
  const current = typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.()?.version || APP_VERSION;
  const lastSeen = await getLastSeenVersion();
  if (lastSeen === null) {
    await setLastSeenVersion(current);
    return;
  }
  if (lastSeen === current) return;
  await showChangelogModal();
  await setLastSeenVersion(current);
}
