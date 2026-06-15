# Two-Tier Task-Row Layout — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переразложить collapsed-строку задачи в две яруса: ярус 1 — `иконка + Тема (полный перенос) + один правый контрол`; ярус 2 — мета-строки во всю ширину под иконку. Убрать зарезервированные 56px.

**Architecture:** Два юнита — head (интерактив + заголовок) и meta (информационные строки во всю ширину). `.task-row` становится колонкой; правый кластер перестаёт быть `absolute`; бейдж оставшегося времени отделяется от чипа и уходит в мету. Presentation-only.

**Tech Stack:** Vanilla ES-модули (Chrome MV3 side panel), чистый CSS. Нет npm/Node-тестов, нет git.

**Spec:** [crm/docs/superpowers/specs/2026-06-15-task-row-layout-design.md](../specs/2026-06-15-task-row-layout-design.md)

---

## Pre-flight / соглашения (прочитать первым)

- **Нет git** → нет шагов «commit»; вместо них **Checkpoint** (визуальная проверка). Версионирование — опциональный `git init`, вне плана.
- **Нет тест-раннера** → проверка визуальная (load unpacked). Изменение разметочно-стилевое.
- **render.js и CSS меняются вместе.** После одной из правок (Task 1 или 2) промежуточная раскладка будет «битой» — это нормально; визуальная приёмка **только после обеих** (Task 3).
- **Как проверять:** `chrome://extensions` → Reload расширения → открыть side-панель → список задач разных типов; тему переключать кнопкой в UI (`body.dark-theme`). Для стора — `pack-extension.sh`.
- **Инвариант:** какие данные показываются — не меняем, только расположение. Раскрытие по клику и `stopPropagation` контролов — без изменений.
- **Файлы:** Modify `crm/js/render.js` (renderTaskItem) и `crm/sidepanel.css`. Удалений нет.

---

## Task 1: render.js — двухъярусный шаблон строки

**Files:**

- Modify: `crm/js/render.js` (заменить `statusGroupHtml` ≈626-637; заменить `.task-row` в return-шаблоне ≈643-656)

- [ ] **Step 1: Заменить `statusGroupHtml` на расчёт правого контрола и меты**

Найти блок (≈626-637):

```javascript
  const statusGroupHtml = isNote
    ? `<div class="task-status-group">${timeDisplay}</div>`
    : isCallMeetingChat
      ? (recordingPlayUrls.length ? `<div class="task-status-group">${playRecordingBtnHtml}</div>` : '')
      : `<div class="task-status-group">
          ${recordingPlayUrls.length ? playRecordingBtnHtml : (statusClass ? `
            <span class="task-status-icon ${statusClass}" data-tooltip="${statusTooltip}">
              ${statusIconGlyph(statusClass)}
            </span>
          ` : '')}
          ${timeDisplay}
        </div>`;
```

Заменить на:

```javascript
  // Ярус 1 — правый контрол: один основной элемент статуса/действия.
  // Заметка → интерактивный таймер (timeDisplay); иначе записи → ▷-кнопки;
  // иначе чип срока, НО только если это НЕ call/meeting/chat — у звонков/встреч/чатов
  // чип НЕ показывался (исходная логика: только ▷-кнопки записи либо ничего). Сохраняем.
  let rightControlHtml = '';
  if (isNote) {
    rightControlHtml = timeDisplay;
  } else if (recordingPlayUrls.length) {
    rightControlHtml = playRecordingBtnHtml;
  } else if (statusClass && !isCallMeetingChat) {
    rightControlHtml = `<span class="task-status-icon ${statusClass}" data-tooltip="${statusTooltip}">${statusIconGlyph(statusClass)}</span>`;
  }
  const rightControlBlock = rightControlHtml
    ? `<div class="task-meta"><div class="task-status-group">${rightControlHtml}</div></div>`
    : '';

  // Ярус 2 — мета во всю ширину. Порядок: время → связанное → кто → группа.
  // Для не-заметок timeDisplay — это .task-time-badge (остаток времени) → уходит в мету.
  const metaTimeBadge = isNote ? '' : timeDisplay;
  const metaLinesHtml = [
    taskTimeAboveTitle ? `<div class="task-row-time">${escapeHtml(taskTimeAboveTitle)}</div>` : '',
    metaTimeBadge,
    taskRowRelatedHtml,
    isNote && task.assignedTo ? `<div class="task-row-assignee"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${escapeHtml(task.assignedToName || vtigerUsersMap[task.assignedTo] || task.assignedTo)}</div>` : '',
    task.group === CRM_GROUP_NAME && task.user_display_name ? `<div class="task-row-crm-owner"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${escapeHtml(task.user_display_name)}</div>` : '',
    (isCrm || isCrmGroupViewOnly) && task.creator_display_name ? `<div class="task-row-creator" title="Кто создал задачу"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Создал: ${escapeHtml(task.creator_display_name)}</div>` : '',
    isNote && task.syncGroupName ? `<div class="task-row-sync-group">${escapeHtml(task.syncGroupName)}</div>` : '',
  ].filter(Boolean).join('');
  const metaFullHtml = metaLinesHtml ? `<div class="task-row-meta">${metaLinesHtml}</div>` : '';
```

(Снимки разметки assignee / crm-owner / creator / sync-group / time взяты дословно из текущего шаблона — это перенос, не переписывание.)

- [ ] **Step 2: Заменить `.task-row` в return-шаблоне на два яруса**

Найти (≈643-656):

```javascript
      <div class="task-row">
        ${checkboxHtml}
        <div class="task-row-text-wrap">
          ${taskTimeAboveTitle ? `<div class="task-row-time">${escapeHtml(taskTimeAboveTitle)}</div>` : ''}
          ${isNote && task.syncGroupName ? `<div class="task-row-sync-group">${escapeHtml(task.syncGroupName)}</div>` : ''}
          <p class="task-text">${escapeHtml(task.text)}</p>
          ${isNote && task.assignedTo ? `<div class="task-row-assignee"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${escapeHtml(task.assignedToName || vtigerUsersMap[task.assignedTo] || task.assignedTo)}</div>` : ''}
          ${task.group === CRM_GROUP_NAME && task.user_display_name ? `<div class="task-row-crm-owner"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${escapeHtml(task.user_display_name)}</div>` : ''}
          ${(isCrm || isCrmGroupViewOnly) && task.creator_display_name ? `<div class="task-row-creator" title="Кто создал задачу"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Создал: ${escapeHtml(task.creator_display_name)}</div>` : ''}
          ${taskRowRelatedHtml}
        </div>
        <div class="task-meta">
          ${statusGroupHtml}
        </div>
      </div>
```

Заменить на:

```javascript
      <div class="task-row">
        <div class="task-row-head">
          ${checkboxHtml}
          <div class="task-row-text-wrap"><p class="task-text">${escapeHtml(task.text)}</p></div>
          ${rightControlBlock}
        </div>
        ${metaFullHtml}
      </div>
```

- [ ] **Step 3: Проверка синтаксиса**

Run: `node --check "crm/js/render.js"`
Expected: без вывода (OK). Также: `grep -n "statusGroupHtml" crm/js/render.js` → пусто (переменная удалена, висячих ссылок нет).

- [ ] **Step 4: Checkpoint**

Раскладка пока будет «битой» (CSS старый) — это ожидаемо до Task 2. Достаточно `node --check` OK.

---

## Task 2: sidepanel.css — `.task-row` в колонку + ярусы

**Files:**

- Modify: `crm/sidepanel.css` (`.task-row` ≈1496-1505; `.task-meta` ≈1644-1654; добавить `.task-row-head` / `.task-row-meta`; редундантный override ≈1620)

- [ ] **Step 1: `.task-row` → колонка, убрать резерв 56px**

Заменить правило `.task-row` (≈1496-1505):

```css
.task-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  cursor: pointer;
  transition: background var(--transition);
  position: relative;
}
```

- [ ] **Step 2: Добавить `.task-row-head` и `.task-row-meta`**

Сразу после правила `.task-row` добавить:

```css
/* Ярус 1: иконка + тема + один правый контрол */
.task-row-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
/* Ярус 2: мета во всю ширину под иконку */
.task-row-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
```

(`.task-row-text-wrap` оставить как есть — `flex:1; min-width:0`; теперь держит только тему. `.task-text` уже с полным переносом по умолчанию.)

- [ ] **Step 3: `.task-meta` — убрать абсолют, сделать флекс-элементом яруса 1**

Заменить правило `.task-meta` (≈1644-1654):

```css
.task-meta {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}
```

(Убраны `position:absolute; right:12px; top:50%; transform:translateY(-50%)`. `.task-status-group` и его `:has(...)`-правило для ряда ▷-кнопок не трогаем.)

- [ ] **Step 4: Снять устаревшие `.task-type-simple` правила старой раскладки**

Удалить **оба** правила (≈1619-1625) — они опирались на старый резерв/абсолютную `.task-meta`:

```css
.task-type-simple:not(.task-has-row-recording) .task-row {
  padding-right: 12px;
}

.task-type-simple:not(.task-has-row-recording) .task-meta {
  display: none;
}
```

`padding-right:12px` больше не нужен (база — симметричные 12px). `.task-meta { display:none }` устарел: теперь `.task-meta` рендерится **только** при наличии правого контрола (`rightControlBlock`), а у call/meeting/chat без записи контрола нет → пустой `.task-meta` вообще не создаётся, прятать нечего.

Затем грепом просмотреть остальные правила старой раскладки: `grep -n "task-type-simple\|padding-right: 56px\|task-meta" crm/sidepanel.css` — убрать осиротевшее (что ссылалось на абсолютную `.task-meta`), не трогая живые `.task-meta` / `.task-status-group`.

**Важно:** сам класс `.task-type-simple` НЕ удалять — он остаётся живым в JS (применяется в `render.js` к строкам call/meeting/chat и проверяется в `refreshTaskTimeBadges`). Из CSS он просто больше не используется.

- [ ] **Step 5: Checkpoint**

Reload расширения. Строка стала двухъярусной: тема сверху рядом с иконкой и контролом; мета — во всю ширину ниже, без правого «жёлоба». Накладок нет.

---

## Task 3: Визуальная приёмка (это и есть «тест»)

**Files:** —

- [ ] **Step 1: Светлая тема — по типам**
- [ ] CRM-задача: верх — иконка + тема + **чип срока**; ниже во всю ширину — `2 ч` / `Сделка: …` / `Создал: …`.
- [ ] Звонок с записью: верх — ▷ кнопка; ниже — `12:30 · Сделка: …`.
- [ ] Звонок без записи / встреча / чат: верх — **пусто** (чип у этих типов не показывается); время — в мете.
- [ ] Заметка с таймером: верх — **таймер** (играет/пауза работает); ниже — группа / назначено.
- [ ] Личная задача: слева чекбокс, справа чип (если есть срок); мета может отсутствовать (ярус 2 не рендерится).
- [ ] Состояния: просрочено (красный чип) / без срока / выполнено.
- [ ] **Step 2: Длинная тема**

Тема в 2-3 строки — **полный перенос**, видна целиком; иконка и контрол выровнены по верху; мета — ниже, без наложения.

- [ ] **Step 3: Тёмная тема** — пройти Step 1 повторно; цвета/иконки не изменились, контраст ок.
- [ ] **Step 4: Регресс**
- [ ] Клик по строке разворачивает деталь; чекбокс / ▷ / таймер / чип по клику **не** разворачивают строку.
- [ ] Несколько записей у звонка — ряд ▷-кнопок; если вылезает за ширину панели, добавить перенос (`flex-wrap`/на свою строку) и перепроверить.
- [ ] Нет пустого правого «жёлоба»; в консоли (F12) нет ошибок.
- [ ] **Step 5: Сборка (для стора)**

`bash crm/pack-extension.sh` + переаплоад. Для локальной проверки достаточно Reload.

---

## Сводка изменений

| Файл              | Что                                                                                                                                                                                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crm/js/render.js`  | `statusGroupHtml` → `rightControlHtml` (ярус 1: чип/▷/таймер) + `metaFullHtml` (ярус 2: время → связанное → кто → группа, с отделённым бейджем времени); новый return-шаблон `.task-row > (.task-row-head, .task-row-meta)`. |
| `crm/sidepanel.css` | `.task-row` → колонка, без `padding-right:56px`; новые `.task-row-head` / `.task-row-meta`; `.task-meta` без `absolute`; удалён редундантный `.task-type-simple … padding-right:12px`.                                                                            |
