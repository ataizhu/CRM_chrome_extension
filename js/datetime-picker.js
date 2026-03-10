// datetime-picker.js - Один календарь с выбором периода

const DT_MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const DT_WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function dtFormatDate(d) {
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dtFormatTime(d) {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function dtFormatFull(d) {
  return `${dtFormatDate(d)}, ${dtFormatTime(d)}`;
}

function dtClampHour(v) { return Math.min(23, Math.max(0, isNaN(v) ? 0 : Math.floor(v))); }
function dtClampMinute(v) { return Math.min(59, Math.max(0, isNaN(v) ? 0 : Math.floor(v))); }

function dtGetTimeFromBlock(blockEl) {
  const input = blockEl.querySelector('.dt-time-input');
  if (!input || !input.value) return { hour: 0, minute: 0 };
  const [h, m] = input.value.split(':').map((x) => parseInt(x, 10));
  return {
    hour: dtClampHour(isNaN(h) ? 0 : h),
    minute: dtClampMinute(isNaN(m) ? 0 : m)
  };
}

function dtSetTimeToBlock(blockEl, h, m) {
  const input = blockEl.querySelector('.dt-time-input');
  const hh = dtClampHour(h);
  const mm = dtClampMinute(m);
  if (input) {
    input.value = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  // Sync scroll wheels
  const hourWheel = blockEl.querySelector('.dt-wheel-hour');
  const minuteWheel = blockEl.querySelector('.dt-wheel-minute');
  if (hourWheel) dtScrollWheelTo(hourWheel, hh);
  if (minuteWheel) dtScrollWheelTo(minuteWheel, mm);
}

/** Scroll a wheel to value (center it) */
function dtScrollWheelTo(wheel, value) {
  const itemH = 32;
  // 1 padding item at top
  wheel.scrollTop = value * itemH;
}

/** Sync hidden input from wheel positions */
function dtSyncWheelToInput(blockEl) {
  const hourWheel = blockEl.querySelector('.dt-wheel-hour');
  const minuteWheel = blockEl.querySelector('.dt-wheel-minute');
  const input = blockEl.querySelector('.dt-time-input');
  if (!hourWheel || !minuteWheel || !input) return;
  const h = dtGetWheelValue(hourWheel);
  const m = dtGetWheelValue(minuteWheel);
  input.value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function dtGetWheelValue(wheel) {
  const itemH = 32;
  return Math.round(wheel.scrollTop / itemH);
}

/** Initialize scroll wheel with items */
function dtInitWheel(wheel, max, blockEl) {
  wheel.innerHTML = '';
  // Top padding (1 empty slot so first item can center)
  const padTop = document.createElement('div');
  padTop.className = 'dt-wheel-pad';
  padTop.style.height = '32px';
  padTop.style.flexShrink = '0';
  wheel.appendChild(padTop);
  for (let i = 0; i <= max; i++) {
    const item = document.createElement('div');
    item.className = 'dt-wheel-item';
    item.textContent = String(i).padStart(2, '0');
    item.dataset.value = i;
    wheel.appendChild(item);
  }
  // Bottom padding
  const padBot = document.createElement('div');
  padBot.className = 'dt-wheel-pad';
  padBot.style.height = '32px';
  padBot.style.flexShrink = '0';
  wheel.appendChild(padBot);

  let scrollTimer = null;
  wheel.addEventListener('scroll', () => {
    // Update active class
    const itemH = 32;
    const center = Math.round(wheel.scrollTop / itemH);
    wheel.querySelectorAll('.dt-wheel-item').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.value) === center);
    });
    // Debounce snap + sync
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const snapped = Math.round(wheel.scrollTop / itemH);
      wheel.scrollTo({ top: snapped * itemH, behavior: 'smooth' });
      dtSyncWheelToInput(blockEl);
    }, 80);
  }, { passive: true });

  // Click to select
  wheel.addEventListener('click', (e) => {
    const item = e.target.closest('.dt-wheel-item');
    if (!item) return;
    const val = parseInt(item.dataset.value);
    wheel.scrollTo({ top: val * 32, behavior: 'smooth' });
  });
}

/** Initialize all wheels in a time row */
function dtInitTimeWheels(blockEl) {
  const hourWheel = blockEl.querySelector('.dt-wheel-hour');
  const minuteWheel = blockEl.querySelector('.dt-wheel-minute');
  if (hourWheel && !hourWheel.dataset.init) {
    dtInitWheel(hourWheel, 23, blockEl);
    hourWheel.dataset.init = '1';
  }
  if (minuteWheel && !minuteWheel.dataset.init) {
    dtInitWheel(minuteWheel, 59, blockEl);
    minuteWheel.dataset.init = '1';
  }
  // Set initial position from hidden input
  const time = dtGetTimeFromBlock(blockEl);
  if (hourWheel) dtScrollWheelTo(hourWheel, time.hour);
  if (minuteWheel) dtScrollWheelTo(minuteWheel, time.minute);
}

function dtCombine(date, time) {
  if (!date) return null;
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setHours(dtClampHour(time.hour), dtClampMinute(time.minute), 0, 0);
  return d;
}

let rangePickerInstance = null;

function setupRangePicker() {
  const container = document.getElementById('taskDateTimeRangePicker');
  const trigger = document.getElementById('taskDateTimeRangeTrigger');
  const labelEl = document.getElementById('taskDateTimeRangeLabel');
  const popover = document.getElementById('taskDateTimeRangePopover');
  const hiddenStart = document.getElementById('taskStart');
  const hiddenEnd = document.getElementById('taskEnd');

  if (!container || !trigger || !popover || !hiddenStart || !hiddenEnd) {
    return null;
  }

  const calWrap = popover.querySelector('.dt-range-single-calendar');
  const titleEl = calWrap?.querySelector('.dt-cal-title');
  const weekdaysEl = calWrap?.querySelector('.dt-cal-weekdays');
  const gridEl = calWrap?.querySelector('.dt-cal-grid');
  const prevBtn = calWrap?.querySelector('.dt-cal-prev');
  const nextBtn = calWrap?.querySelector('.dt-cal-next');

  const startRow = popover.querySelector('.dt-range-time-row[data-range="start"]');
  const endRow = popover.querySelector('.dt-range-time-row[data-range="end"]');
  const nowStartBtn = startRow?.querySelector('.dt-now-btn');
  const nowEndBtn = endRow?.querySelector('.dt-now-btn');

  if (!calWrap || !gridEl || !startRow || !endRow) {
    return null;
  }

  let startDate = null;
  let endDate = null;
  let hoverDate = null;
  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth();

  function updateLabel() {
    const startVal = hiddenStart.value ? new Date(hiddenStart.value) : null;
    const endVal = hiddenEnd.value ? new Date(hiddenEnd.value) : null;
    const hasAny = !!(startVal || endVal);
    trigger.classList.toggle('has-value', hasAny);
    if (labelEl) {
      if (startVal && endVal) {
        labelEl.textContent = `${dtFormatFull(startVal)} — ${dtFormatFull(endVal)}`;
      } else if (startVal) {
        labelEl.textContent = `${dtFormatFull(startVal)} — …`;
      } else if (endVal) {
        labelEl.textContent = `… — ${dtFormatFull(endVal)}`;
      } else {
        labelEl.textContent = 'Выберите дату и время';
      }
    }
  }

  // Вычислить классы для дня
  function getDayClasses(date, outside, isToday, currentHover) {
    const dStr = date.toDateString();
    const isStart = startDate && dStr === startDate.toDateString();
    const isEnd = endDate && dStr === endDate.toDateString();
    const rangeEnd = endDate || currentHover;
    let inRange = false;
    if (startDate && rangeEnd && !endDate) {
      const t = date.getTime();
      const s = startDate.getTime();
      const re = rangeEnd.getTime();
      inRange = t > Math.min(s, re) && t < Math.max(s, re);
    } else if (startDate && endDate) {
      const t = date.getTime();
      inRange = t > startDate.getTime() && t < endDate.getTime();
    }
    return [
      'dt-cal-day',
      outside ? 'outside' : '',
      isToday ? 'today' : '',
      (isStart || isEnd) ? 'selected' : '',
      isStart ? 'range-start' : '',
      isEnd ? 'range-end' : '',
      inRange ? 'in-range' : ''
    ].filter(Boolean).join(' ');
  }

  // Обновить только классы на существующих кнопках (для hover)
  function updateDayClasses(currentHover) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buttons = gridEl.querySelectorAll('.dt-cal-day');
    buttons.forEach(btn => {
      const ts = Number(btn.dataset.dtTs);
      if (isNaN(ts)) return;
      const date = new Date(ts);
      const outside = btn.classList.contains('outside');
      const isToday = date.toDateString() === today.toDateString();
      btn.className = getDayClasses(date, outside, isToday, currentHover);
    });
  }

  function renderCalendar() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (titleEl) titleEl.textContent = `${DT_MONTHS[viewMonth]} ${viewYear}`;
    if (weekdaysEl) weekdaysEl.innerHTML = DT_WEEKDAYS.map((wd) => `<span class="dt-cal-weekday">${wd}</span>`).join('');

    // Генерация дней
    const first = new Date(viewYear, viewMonth, 1);
    let start = new Date(first);
    const dow = start.getDay();
    const shift = dow === 0 ? 6 : dow - 1;
    start.setDate(start.getDate() - shift);

    gridEl.innerHTML = '';
    let cur = new Date(start);

    for (let i = 0; i < 42; i++) {
      const date = new Date(cur);
      const outside = cur.getMonth() !== viewMonth;
      const isToday = cur.toDateString() === today.toDateString();

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = getDayClasses(date, outside, isToday, hoverDate);
      btn.textContent = date.getDate();
      btn.dataset.dtTs = date.getTime();
      btn.dataset.outside = outside ? '1' : '';

      gridEl.appendChild(btn);
      cur.setDate(cur.getDate() + 1);
    }
  }

  function onDaySelect(ts) {
    const day = new Date(ts);
    day.setHours(0, 0, 0, 0);
    
    if (!startDate || (startDate && endDate)) {
      // Начинаем новый выбор
      startDate = new Date(day);
      endDate = null;
    } else {
      // Завершаем выбор
      if (day.getTime() < startDate.getTime()) {
        endDate = new Date(startDate);
        startDate = new Date(day);
      } else {
        endDate = new Date(day);
      }
    }
    hoverDate = null;
    renderCalendar();
  }

  function onDayHover(ts) {
    if (!startDate || endDate) return; // Hover только когда выбрано начало, но не конец
    const newHover = ts ? new Date(ts) : null;
    if (newHover) newHover.setHours(0, 0, 0, 0);
    hoverDate = newHover;
    updateDayClasses(hoverDate);
  }

  // Делегирование событий на grid
  gridEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.dt-cal-day');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const ts = Number(btn.dataset.dtTs);
    if (!isNaN(ts)) {
      onDaySelect(ts);
    }
  });

  gridEl.addEventListener('mouseover', (e) => {
    const btn = e.target.closest('.dt-cal-day');
    if (btn) {
      const ts = Number(btn.dataset.dtTs);
      if (!isNaN(ts)) onDayHover(ts);
    }
  });

  gridEl.addEventListener('mouseleave', () => {
    if (startDate && !endDate) {
      hoverDate = null;
      updateDayClasses(null);
    }
  });

  function openFromHidden() {
    if (hiddenStart.value) {
      const d = new Date(hiddenStart.value);
      startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      viewYear = startDate.getFullYear();
      viewMonth = startDate.getMonth();
      dtSetTimeToBlock(startRow, d.getHours(), d.getMinutes());
    } else {
      startDate = null;
      dtSetTimeToBlock(startRow, 0, 0);
    }
    if (hiddenEnd.value) {
      const d = new Date(hiddenEnd.value);
      endDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      viewYear = endDate.getFullYear();
      viewMonth = endDate.getMonth();
      dtSetTimeToBlock(endRow, d.getHours(), d.getMinutes());
    } else {
      endDate = null;
      dtSetTimeToBlock(endRow, 0, 0);
    }
    hoverDate = null;
    renderCalendar();
  }

  function applyAndClose() {
    let dateStart = startDate ? new Date(startDate) : null;
    let dateEnd = endDate ? new Date(endDate) : null;
    if (dateStart && !dateEnd) dateEnd = new Date(dateStart);
    if (dateEnd && !dateStart) dateStart = new Date(dateEnd);
    const tStart = dtGetTimeFromBlock(startRow);
    const tEnd = dtGetTimeFromBlock(endRow);
    const startCombined = dtCombine(dateStart, tStart);
    const endCombined = dtCombine(dateEnd, tEnd);
    if (startCombined) hiddenStart.value = startCombined.toISOString();
    else hiddenStart.value = '';
    if (endCombined) hiddenEnd.value = endCombined.toISOString();
    else hiddenEnd.value = '';
    updateLabel();
    popover.style.display = 'none';
    hideBackdrop();
    hiddenStart.dispatchEvent(new Event('change', { bubbles: true }));
    hiddenEnd.dispatchEvent(new Event('change', { bubbles: true }));
  }

  let backdrop = null;
  // Backdrop must be inside the same stacking context as the popover
  const backdropParent = popover.closest('.modal-overlay') || document.body;
  function showBackdrop() {
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'dt-range-backdrop';
      backdrop.addEventListener('click', () => { applyAndClose(); });
    }
    backdropParent.appendChild(backdrop);
  }
  function hideBackdrop() {
    if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = popover.style.display === 'block';
    if (!open) {
      popover.style.display = 'block';
      openFromHidden();
      showBackdrop();
      // Init/sync scroll wheels
      dtInitTimeWheels(startRow);
      dtInitTimeWheels(endRow);
    } else {
      applyAndClose();
    }
  });

  nowStartBtn?.addEventListener('click', () => {
    const now = new Date();
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!endDate) {
      endDate = new Date(startDate);
      dtSetTimeToBlock(endRow, now.getHours(), now.getMinutes());
    }
    viewYear = startDate.getFullYear();
    viewMonth = startDate.getMonth();
    dtSetTimeToBlock(startRow, now.getHours(), now.getMinutes());
    renderCalendar();
  });

  nowEndBtn?.addEventListener('click', () => {
    const now = new Date();
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!startDate) {
      startDate = new Date(endDate);
      dtSetTimeToBlock(startRow, now.getHours(), now.getMinutes());
    }
    viewYear = endDate.getFullYear();
    viewMonth = endDate.getMonth();
    dtSetTimeToBlock(endRow, now.getHours(), now.getMinutes());
    renderCalendar();
  });

  prevBtn?.addEventListener('click', () => {
    viewMonth -= 1;
    if (viewMonth < 0) { viewYear -= 1; viewMonth = 11; }
    renderCalendar();
  });

  nextBtn?.addEventListener('click', () => {
    viewMonth += 1;
    if (viewMonth > 11) { viewYear += 1; viewMonth = 0; }
    renderCalendar();
  });

  // Auto-apply when closing by clicking outside
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target) && !popover.contains(e.target)) {
      if (popover.style.display === 'block') applyAndClose();
    }
  });

  popover.addEventListener('click', (e) => e.stopPropagation());

  updateLabel();

  return {
    getValue(key) {
      const hid = key === 'start' ? hiddenStart : hiddenEnd;
      const v = hid?.value;
      return v ? new Date(v) : null;
    },
    setValue(key, d) {
      const hid = key === 'start' ? hiddenStart : hiddenEnd;
      const row = key === 'start' ? startRow : endRow;
      if (d) {
        hid.value = new Date(d).toISOString();
        const dateOnly = new Date(d);
        dateOnly.setHours(0, 0, 0, 0);
        if (key === 'start') {
          startDate = new Date(dateOnly);
          viewYear = startDate.getFullYear();
          viewMonth = startDate.getMonth();
        } else {
          endDate = new Date(dateOnly);
          viewYear = endDate.getFullYear();
          viewMonth = endDate.getMonth();
        }
        dtSetTimeToBlock(row, new Date(d).getHours(), new Date(d).getMinutes());
      } else {
        hid.value = '';
        if (key === 'start') startDate = null;
        else endDate = null;
      }
      updateLabel();
      if (popover.style.display === 'block') renderCalendar();
    },
    reset() {
      hiddenStart.value = '';
      hiddenEnd.value = '';
      startDate = null;
      endDate = null;
      hoverDate = null;
      viewYear = new Date().getFullYear();
      viewMonth = new Date().getMonth();
      dtSetTimeToBlock(startRow, 0, 0);
      dtSetTimeToBlock(endRow, 0, 0);
      updateLabel();
      if (popover.style.display === 'block') renderCalendar();
    }
  };
}

export function setupSingleDateTimePicker() {}

export function initDateTimePickers() {
  rangePickerInstance = setupRangePicker();
}

export function getDateTimePickerValue(key) {
  if (!rangePickerInstance) return null;
  return rangePickerInstance.getValue(key);
}

export function setDateTimePickerValue(key, date) {
  if (rangePickerInstance) rangePickerInstance.setValue(key, date);
}

export function resetDateTimePickers() {
  if (rangePickerInstance) rangePickerInstance.reset();
}
