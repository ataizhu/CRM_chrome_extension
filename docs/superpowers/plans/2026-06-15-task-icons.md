# Task Icons «Duotone» Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Привести все иконки строки задачи к единому стилю «Дуотон» (глиф акцентного цвета на полупрозрачной круглой подложке) и заменить растровый «мозг» (GIF 2.69 МБ) на инлайн-SVG с CSS-пульсацией.

**Architecture:** Три юнита с чёткими границами — (1) CSS-токены палитры `--icon-*` (единый источник цвета, свет + тёмная тема), (2) презентация слотов (CSS-классы потребляют токены, глиф красится через `currentColor`), (3) маппинг состояния→класс/глиф в `render.js` (логика не меняется; добавляется чистый хелпер `statusIconGlyph`). Изменение presentation-only.

**Tech Stack:** Vanilla ES-модули (Chrome MV3 side panel), чистый CSS (oklch-токены). Сборка — `crm/pack-extension.sh`. Нет npm/Node/тест-раннера, нет git.

**Spec:** [crm/docs/superpowers/specs/2026-06-15-task-icons-design.md](../specs/2026-06-15-task-icons-design.md)

---

## Pre-flight / соглашения этого плана (прочитать первым)

- **Нет git** → шаги «commit» отсутствуют. Вместо них — **Checkpoint** (визуальная проверка). Если захочешь версионировать: опциональный `git init` до старта (не входит в план).
- **Нет тест-раннера** → проверка **визуальная** (это уточняет §11 спеки: разворачивать Vitest-тулчейн ради визуального перекраса несоразмерно). Опциональная автоматизация — в Приложении A.
- **Как проверять (одинаково для всех Checkpoint'ов):**
  1. `chrome://extensions` → Developer mode → Load unpacked → папка `crm/` (или Reload, если уже загружено).
  2. Открыть side-панель расширения, показать список задач с разными типами/состояниями.
  3. Тему переключать кнопкой темы в UI (класс `body.dark-theme`).
  4. После правок только `render.js`/CSS — достаточно Reload расширения; пересборка `pack-extension.sh` нужна лишь для стора.
- **Файлы, затрагиваемые планом:**
  - Modify: `crm/sidepanel.css` (токены + слот-стили + keyframes)
  - Modify: `crm/js/render.js` (разметка слотов, инлайн-мозг, хелпер чипа)
  - Delete: `crm/assets/brain-process.gif`, `crm/assets/brain-static.jpg`
- **Инвариант:** логику выбора иконок (`eventStatusKind`, `activitytype`, `completed`, `end`) НЕ трогаем — только разметку слота/классы/CSS.
- Все иконочные SVG используют `stroke="currentColor"`, поэтому цвет глифа = `color` слота; подложка = `background` слота.

---

## Task 1: CSS-токены палитры `--icon-*`

Чисто аддитивно — визуально ещё ничего не меняется, просто появляются переменные.

**Files:**
- Modify: `crm/sidepanel.css` (`:root` ~строка 23 после `--success`; `body.dark-theme` ~строка 80 после `--success`)

- [ ] **Step 1: Добавить токены в `:root`**

В блок `:root` (после существующего `--success: …;`, ~строка 23) вставить:

```css
  /* === Icon palette (Duotone) — единый источник цвета иконок задач === */
  --icon-call: oklch(0.55 0.18 145);
  --icon-call-bg: oklch(0.55 0.18 145 / 0.14);
  --icon-meeting: oklch(0.55 0.2 250);
  --icon-meeting-bg: oklch(0.55 0.2 250 / 0.14);
  --icon-chat: oklch(0.6 0.15 85);
  --icon-chat-bg: oklch(0.6 0.15 85 / 0.14);
  --icon-note: var(--muted-foreground);
  --icon-note-bg: oklch(0.5 0.02 260 / 0.16);
  --icon-brain: oklch(0.52 0.23 293);          /* ≈ #7c3aed */
  --icon-brain-bg: oklch(0.52 0.23 293 / 0.14);
  --icon-done: var(--success);
  --icon-done-bg: oklch(0.6 0.18 145 / 0.14);
  --icon-cancel: var(--destructive);
  --icon-cancel-bg: oklch(0.55 0.22 25 / 0.14);
  --icon-overdue: var(--destructive);
  --icon-overdue-bg: oklch(0.55 0.22 25 / 0.14);
  --icon-muted: var(--muted-foreground);
  --icon-muted-bg: oklch(0.5 0.02 260 / 0.16);
```

- [ ] **Step 2: Добавить тёмные оверрайды в `body.dark-theme`**

В блок `body.dark-theme` (после `--success: …;`, ~строка 80) вставить:

```css
  /* Icon palette — тёмная тема (ярче stroke, 18% подложка) */
  --icon-call: oklch(0.7 0.17 150);
  --icon-call-bg: oklch(0.7 0.17 150 / 0.18);
  --icon-meeting: oklch(0.68 0.17 255);
  --icon-meeting-bg: oklch(0.68 0.17 255 / 0.18);
  --icon-chat: oklch(0.72 0.14 85);
  --icon-chat-bg: oklch(0.72 0.14 85 / 0.18);
  --icon-note: var(--muted-foreground);
  --icon-note-bg: oklch(0.6 0 0 / 0.2);
  --icon-brain: oklch(0.72 0.16 293);          /* ≈ #a78bfa */
  --icon-brain-bg: oklch(0.72 0.16 293 / 0.18);
  --icon-done: var(--success);
  --icon-done-bg: oklch(0.65 0.18 145 / 0.18);
  --icon-cancel: var(--destructive);
  --icon-cancel-bg: oklch(0.55 0.2 25 / 0.2);
  --icon-overdue: var(--destructive);
  --icon-overdue-bg: oklch(0.55 0.2 25 / 0.2);
  --icon-muted: var(--muted-foreground);
  --icon-muted-bg: oklch(0.6 0 0 / 0.2);
```

- [ ] **Step 3: Checkpoint**

Reload расширения. DevTools (инспектор side-панели) → Elements → `:root` → убедиться, что переменные `--icon-call` и т.п. видны в computed styles. Визуально список ещё прежний — это нормально.

---

## Task 2: Дуотон-геометрия слотов (общая)

Один общий блок задаёт круг 30px и размер глифа для всех левых слотов. DRY — не трогаем разметку, только CSS.

**Files:**
- Modify: `crm/sidepanel.css` (рядом со слот-правилами, ~строка 1421; и `.task-activity-icon` ~1571)

- [ ] **Step 1: Добавить общий блок геометрии**

Добавить (например, перед `.task-status-slot` ~строка 1421) :

```css
/* === Duotone icon slots: единая геометрия круга 30px === */
.task-activity-type-slot,
.task-note-type-slot,
.task-status-slot,
.task-brain-btn,
.task-brain-slot.task-brain-view-only {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  margin-top: 1px;
}
.task-activity-type-slot svg,
.task-note-type-slot svg,
.task-status-slot svg,
.task-brain-btn svg,
.task-brain-slot svg {
  width: 17px;
  height: 17px;
}
```

- [ ] **Step 2: Снять фикс-размер 20px у `.task-activity-icon`**

Заменить правило `.task-activity-icon` (~1571–1574):

```css
.task-activity-icon {
  width: 17px;
  height: 17px;
}
```

- [ ] **Step 3: Checkpoint**

Reload. Слоты типов/состояний станут крупнее (круглые контейнеры пока без подложки — её даёт Task 3–4). Проверить, что строки не «прыгают» по вертикали (текст в 1 и 2 строки выровнен по верху). При смещении — подправить `margin-top`.

---

## Task 3: Тип-слоты (звонок / встреча / чат / заметка)

**Files:**
- Modify: `crm/js/render.js` (добавить вычисление модификатора; слоты ~452, ~470, ~474)
- Modify: `crm/sidepanel.css` (~1547 note-slot, ~1560 activity-slot, удалить ~1576–1584 старые цвета)

- [ ] **Step 1: render.js — вычислить модификатор типа**

В `renderTaskItem`, рядом с `const isCallNoRecording = …` (≈388), добавить:

```javascript
  const activityTypeMod = isCallNoRecording
    ? 'is-call-no-rec'
    : task.activitytype === 'Call'
      ? 'is-call'
      : task.activitytype === 'Meeting'
        ? 'is-meeting'
        : 'is-chat';
```

- [ ] **Step 2: render.js — повесить модификатор на оба activity-слота**

Оба `<span class="task-activity-type-slot" …>` (в ветке view-only ≈452 и в общей ветке ≈474) заменить класс на:

```html
<span class="task-activity-type-slot ${activityTypeMod}" title="${iconLabel}" aria-hidden="true">${iconSvg}</span>
```

(Содержимое `${iconSvg}` и `title` не меняем.)

- [ ] **Step 3: CSS — подложки/цвета типов через токены**

Заменить блок цветов `.task-activity-icon-*` и `body.dark-theme .task-activity-icon-*` (≈1576–1584) на правила уровня слота:

```css
.task-activity-type-slot.is-call    { background: var(--icon-call-bg);    color: var(--icon-call); }
.task-activity-type-slot.is-meeting  { background: var(--icon-meeting-bg); color: var(--icon-meeting); }
.task-activity-type-slot.is-chat     { background: var(--icon-chat-bg);    color: var(--icon-chat); }
.task-activity-type-slot.is-call-no-rec { background: var(--icon-muted-bg); color: var(--icon-muted); opacity: 0.9; }
```

Удалить теперь неиспользуемые `.task-activity-icon-call`, `-meeting`, `-chat`, `-call-no-recording` и их `body.dark-theme`-версии (цвет переехал на слот; тёмная тема — через токены). Класс `.task-activity-icon-call-no-recording` на самом SVG можно оставить (он больше не несёт цвета) — strike-линия задаётся самим SVG.

- [ ] **Step 4: CSS — note-слот в серый дуотон**

Заменить правило `.task-note-type-slot` (≈1547–1554), убрав старый `color: oklch(0.55 0.15 85)`:

```css
.task-note-type-slot {
  background: var(--icon-note-bg);
  color: var(--icon-note);
}
```

(Геометрию даёт общий блок из Task 2; здесь только цвет/подложка.)

- [ ] **Step 5: Checkpoint**

Reload. В списке: звонок — зелёный круг с телефоном; звонок без записи — серый круг + перечёркнутый телефон; встреча — синий круг с календарём; чат — янтарный круг с облаком; заметка — серый круг с документом. Проверить тёмную тему.

---

## Task 4: Состояние-слоты «выполнено» / «отменено»

**Files:**
- Modify: `crm/sidepanel.css` (`.task-status-slot` варианты ~1431–1442)

- [ ] **Step 1: CSS — галочка/крестик в дуотон через токены**

Заменить правила `.task-status-slot.task-status-check` / `.task-status-cross` и их `body.dark-theme`-версии (≈1431–1442) на:

```css
.task-status-slot.task-status-check {
  background: var(--icon-done-bg);
  color: var(--icon-done);
}
.task-status-slot.task-status-cross {
  background: var(--icon-cancel-bg);
  color: var(--icon-cancel);
}
```

(Тёмная тема покрывается токенами — отдельные `body.dark-theme` правила больше не нужны, удалить ≈1437–1442. Это переводит «отменено» с серого на красный — намеренно, см. спеку §5.2.)

- [ ] **Step 2: Checkpoint**

Reload. Задача со статусом «выполнено» (held) — зелёный круг с галочкой; «отменено» (not_held) — **красный** круг с крестиком. Обе темы.

---

## Task 5: «Мозг» — инлайн-SVG + пульсирующий halo

**Files:**
- Modify: `crm/js/render.js` (удалить consts ≈445–446; заменить `<img>` блоки ≈462–465 и ≈476–479)
- Modify: `crm/sidepanel.css` (заменить ≈1840–1895 на дуотон + halo + keyframes)

- [ ] **Step 1: render.js — удалить URL-константы мозга**

Удалить строки (≈445–446):

```javascript
  const brainStaticUrl = 'assets/brain-static.jpg';
  const brainAnimatedUrl = 'assets/brain-process.gif';
```

- [ ] **Step 2: render.js — заменить мозг во view-only слоте (≈461–465)**

Блок `else if (isInWork) { checkboxHtml = … }` заменить на:

```javascript
    } else if (isInWork) {
      checkboxHtml = `<span class="task-brain-slot task-brain-view-only in-progress" title="В работе" aria-hidden="true">
      <span class="brain-halo" aria-hidden="true"></span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></svg>
    </span>`;
```

- [ ] **Step 3: render.js — заменить мозг в кнопке «Начать работу» (≈475–479)**

Блок `else if (isCrmCanWork) { checkboxHtml = … }` заменить на:

```javascript
  } else if (isCrmCanWork) {
    checkboxHtml = `<button type="button" class="task-brain-btn ${isInWork ? 'in-progress' : ''}" data-id="${task.id}" title="${isInWork ? 'В работе' : 'Начать работу'}" aria-label="${isInWork ? 'В работе' : 'Начать работу'}">
      <span class="brain-halo" aria-hidden="true"></span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></svg>
    </button>`;
```

- [ ] **Step 4: CSS — заменить брейн-правила на дуотон + halo**

Заменить весь блок `.task-brain-btn … .task-brain-slot.in-progress .brain-icon-animated` (≈1840–1895) на:

```css
.task-brain-btn,
.task-brain-slot.task-brain-view-only {
  padding: 0;
  border: none;
  background: var(--icon-brain-bg);
  color: var(--icon-brain);
  cursor: pointer;
}
.task-brain-slot.task-brain-view-only { cursor: default; }

.task-brain-btn svg,
.task-brain-slot svg {
  position: relative;
  z-index: 1;
}

.brain-halo {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--icon-brain-bg);
}
.task-brain-btn.in-progress .brain-halo,
.task-brain-slot.in-progress .brain-halo {
  animation: halopulse 1.7s ease-in-out infinite;
}
@keyframes halopulse {
  0%, 100% { transform: scale(0.78); opacity: 0.4; }
  50%      { transform: scale(1);    opacity: 1; }
}

.task-brain-btn:hover { filter: brightness(0.97); }
```

(Кнопка не in-progress = статичный мозг без пульса; halo просто статичная подложка. In-progress = пульс.)

- [ ] **Step 5: Checkpoint**

Reload. Задача «в работе» — фиолетовый круг с мозгом, подложка мягко пульсирует. CRM-задача, где доступно «Начать работу» (не в работе) — статичный фиолетовый мозг, при наведении лёгкое затемнение, без пульса. Проверить, что нет битых картинок (старые `<img>` ушли). Обе темы.

---

## Task 6: Вторичный чип срока — глиф по состоянию + хелпер

**Files:**
- Modify: `crm/js/render.js` (новый хелпер; init-разметка ≈607–613; live-update `refreshTaskTimeBadges` ≈78–108)
- Modify: `crm/sidepanel.css` (`.task-status-icon` ~1633; `.status-icon-*` ~1673–1686)

- [ ] **Step 1: render.js — добавить хелпер `statusIconGlyph`**

Рядом с другими модульными хелперами вверху `render.js` (например, перед `export function renderTaskItem`) добавить:

```javascript
/** Единый источник «класс чипа срока → SVG-глиф». Используется и при инициализации, и в live-update. */
function statusIconGlyph(statusClass) {
  if (statusClass === 'status-icon-completed') {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  }
  if (statusClass === 'status-icon-no-deadline') {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  }
  // status-icon-overdue (и дефолт) — часы
  return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
}
```

- [ ] **Step 2: render.js — использовать хелпер в init-разметке чипа (≈607–613)**

Внутри `statusGroupHtml`, зашитый `<svg>`-часы в `.task-status-icon` заменить на вызов хелпера:

```javascript
            <span class="task-status-icon ${statusClass}" data-tooltip="${statusTooltip}">
              ${statusIconGlyph(statusClass)}
            </span>
```

- [ ] **Step 3: render.js — синхронизировать глиф в live-update (`refreshTaskTimeBadges`, ≈78–108)**

Во всех трёх ветках добавить строку `statusIcon.innerHTML = statusIconGlyph(...)` сразу после `setAttribute('data-tooltip', …)`.

Ветка «без срока» (≈79–83):

```javascript
      if (statusIcon) {
        statusIcon.className = 'task-status-icon status-icon-no-deadline';
        statusIcon.setAttribute('data-tooltip', 'Без срока');
        statusIcon.innerHTML = statusIconGlyph('status-icon-no-deadline');
        statusIcon.style.display = 'flex';
      }
```

Ветка «выполнено» (≈89–93):

```javascript
      if (statusIcon) {
        statusIcon.className = 'task-status-icon status-icon-completed';
        statusIcon.setAttribute('data-tooltip', 'Выполнено');
        statusIcon.innerHTML = statusIconGlyph('status-icon-completed');
        statusIcon.style.display = 'flex';
      }
```

Ветка «просрочено» (≈102–106):

```javascript
      if (statusIcon) {
        statusIcon.className = 'task-status-icon status-icon-overdue';
        statusIcon.setAttribute('data-tooltip', 'Просрочено');
        statusIcon.innerHTML = statusIconGlyph('status-icon-overdue');
        statusIcon.style.display = 'flex';
      }
```

- [ ] **Step 4: CSS — чип в дуотон-круг с глифом**

Заменить `.task-status-icon` (≈1633–1643, сделать круг) и `.status-icon-*` (≈1673–1686, через токены):

```css
.task-status-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.2s;
  position: relative;
}
```

```css
.status-icon-completed { color: var(--icon-done);    background: var(--icon-done-bg); }
.status-icon-overdue   { color: var(--icon-overdue); background: var(--icon-overdue-bg); }
.status-icon-no-deadline { color: var(--icon-muted); background: var(--icon-muted-bg); }
```

(`:hover`, `::after`-тултип и `.task-status-icon svg { width:16px }` оставить как есть.)

- [ ] **Step 5: Checkpoint**

Reload. Личная задача без срока — серый кружок с тире; просроченная — красный кружок с часами; выполненная — зелёный кружок с галочкой. Проверить live-update: если есть задача, у которой срок истекает, глиф/цвет должны меняться вместе (можно сымитировать, выставив `end` в ближайшее прошлое и обновив список).

---

## Task 7: `prefers-reduced-motion`

**Files:**
- Modify: `crm/sidepanel.css` (рядом с `@keyframes halopulse` из Task 5)

- [ ] **Step 1: CSS — отключить пульс при reduced-motion**

```css
@media (prefers-reduced-motion: reduce) {
  .task-brain-btn.in-progress .brain-halo,
  .task-brain-slot.in-progress .brain-halo {
    animation: none;
  }
}
```

- [ ] **Step 2: Checkpoint**

В DevTools → Rendering → Emulate CSS `prefers-reduced-motion: reduce` → halo «в работе» статичен (не пульсирует), круг/глиф на месте.

---

## Task 8: Удалить ассеты мозга

**Files:**
- Delete: `crm/assets/brain-process.gif`, `crm/assets/brain-static.jpg`

- [ ] **Step 1: Проверить отсутствие ссылок**

Run: `grep -rn "brain-process\|brain-static\|brain-icon" crm --include="*.js" --include="*.css" --include="*.html" --include="*.json"`
Expected: пусто (после Task 3–6 ссылок не осталось). Если что-то есть — вычистить перед удалением.

- [ ] **Step 2: Удалить файлы**

Run: `rm "crm/assets/brain-process.gif" "crm/assets/brain-static.jpg"`

- [ ] **Step 3: Checkpoint**

Reload. Задача «в работе» по-прежнему показывает векторный мозг (он инлайн, не зависит от файлов). Размер папки `crm/assets` уменьшился на ~2.74 МБ.

---

## Task 9: Полная визуальная приёмка (это и есть «тест»)

**Files:** —

- [ ] **Step 1: Чек-лист в светлой теме**

Собрать в списке задачи всех видов и проверить дуотон-круги:
- [ ] Звонок (с записью) — зелёный круг + телефон, кнопка ▷ справа.
- [ ] Звонок без записи — серый круг + перечёркнутый телефон.
- [ ] Встреча — синий круг + календарь.
- [ ] Чат — янтарный круг + облако.
- [ ] Заметка — серый круг + документ (бейдж таймера справа не конфликтует).
- [ ] «В работе» — фиолетовый круг + мозг, halo пульсирует.
- [ ] «Начать работу» (CRM, не в работе) — статичный фиолетовый мозг, hover-затемнение.
- [ ] «Выполнено» — зелёный круг + галочка.
- [ ] «Отменено» — красный круг + крестик.
- [ ] Чип срока: без срока (серый+тире), просрочено (красный+часы), выполнено (зелёный+галочка).

- [ ] **Step 2: Чек-лист в тёмной теме**

Переключить `body.dark-theme`, пройти тот же список — stroke ярче, подложки читаемы, контраст ок.

- [ ] **Step 3: Reduced-motion**

Emulate `prefers-reduced-motion: reduce` → пульс выключен, остальное на месте.

- [ ] **Step 4: Регресс-проверки**

- [ ] CRM-группа «только просмотр»: иконки те же, мозг не кликабелен.
- [ ] Выравнивание: задачи с заголовком в 1 и 2 строки — иконка по верху, без «прыжков».
- [ ] Нет битых `<img>`/иконок в консоли (DevTools → Console чисто).

- [ ] **Step 5: Финал — напоминание о сборке**

Для публикации в стор: `bash crm/pack-extension.sh` и переаплоад. Для локальной проверки достаточно Reload.

---

## Приложение A (опционально): автоматический регресс-тест

Не входит в основной объём (в репозитории нет тест-раннера; для визуального изменения автотест даёт мало). Если позже захочется регрессии:

- [ ] Поднять минимальный Vitest + happy-dom (`npm init`, `vitest`, конфиг), застабить `window`/`vtigerUsersMap`/`CRM_GROUP_NAME`.
- [ ] Тест `renderTaskItem`: для набора задач (call с записью / call без записи / meeting / chat / note / held / not_held / in_work / personal-overdue) проверять, что строка содержит правильный класс слота (`is-call`, `task-status-cross`, `task-brain-…` и т.п.) и **не содержит** `brain-process.gif` / `brain-static.jpg` / `<img`.
- [ ] Тест `statusIconGlyph`: маппинг класс→глиф (completed→polyline-галочка, overdue→circle+polyline-часы, no-deadline→line-тире).

---

## Сводка изменений

| Файл | Что |
|---|---|
| `crm/sidepanel.css` | Токены `--icon-*` (свет+тёмная); общая геометрия слотов 30px; цвета типов/состояний/чипа через токены; `.brain-halo` + `@keyframes halopulse` + reduced-motion; удалены старые `.task-activity-icon-*` цвета и `.brain-icon`-img правила. |
| `crm/js/render.js` | `activityTypeMod` + модификаторы на activity-слоты; note-слот; инлайн-SVG мозг (×2) вместо `<img>`; удалены `brainStaticUrl`/`brainAnimatedUrl`; хелпер `statusIconGlyph` + глиф чипа в init и live-update. |
| `crm/assets/brain-process.gif`, `brain-static.jpg` | Удалены (−2.74 МБ). |
