// PTB 1.6.0：Google Calendar 風格的週／月／年行事曆顯示層。
// 僅讀取 calendarPage.js 已渲染的 legacy table，不改資料 schema、查詢或寫入契約。

const ASSET_VERSION = '1.6.0-calendar-google-views-hotfix-1';
const VIEW_IDS = ['week', 'month', 'year'];
const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 23;
const HOUR_HEIGHT = 52;

const installs = new WeakMap();

export function installCalendarGoogleViews(root) {
  if (!root || installs.has(root)) return;

  const legacyWrap = root.querySelector('#calendar-table-wrap');
  const legacyBody = root.querySelector('#calendar-tbody');
  const warnings = root.querySelector('#cal-query-warnings');
  if (!legacyWrap || !legacyBody || !warnings) return;

  ensureStylesheet();

  const state = {
    root,
    legacyWrap,
    legacyBody,
    view: 'month',
    anchorDate: startOfMonth(new Date()),
    queried: false,
    querySignature: '',
    dateMap: new Map(),
    observer: null,
    syncQueued: false,
    dialogDateKey: ''
  };

  const shell = buildShell();
  warnings.insertAdjacentElement('afterend', shell);
  state.shell = shell;
  state.titleEl = shell.querySelector('[data-calendar-title]');
  state.statusEl = shell.querySelector('[data-calendar-view-status]');
  state.weekView = shell.querySelector('[data-calendar-view="week"]');
  state.monthView = shell.querySelector('[data-calendar-view="month"]');
  state.yearView = shell.querySelector('[data-calendar-view="year"]');
  state.dialog = shell.querySelector('[data-calendar-day-dialog]');

  legacyWrap.classList.add('ptb-calendar-legacy-source');
  bindControls(state);

  state.observer = new MutationObserver(() => queueSync(state));
  state.observer.observe(legacyBody, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true
  });
  state.observer.observe(legacyWrap, {
    attributes: true,
    attributeFilter: ['data-cal-table-hidden', 'style']
  });

  installs.set(root, state);
  queueSync(state);
}

function ensureStylesheet() {
  if (document.querySelector('link[data-ptb-calendar-google-views]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.dataset.ptbCalendarGoogleViews = 'true';
  link.href = new URL(`../css/calendarGoogleViews.css?v=${ASSET_VERSION}`, import.meta.url).href;
  document.head.appendChild(link);
}

function buildShell() {
  const shell = document.createElement('section');
  shell.className = 'ptb-gcal';
  shell.dataset.calendarGoogleViews = 'true';
  shell.innerHTML = `
    <div class="ptb-gcal-topbar">
      <div class="ptb-gcal-navigation">
        <button type="button" class="ptb-gcal-btn ptb-gcal-today" data-calendar-action="today">今天</button>
        <button type="button" class="ptb-gcal-icon-btn" data-calendar-action="previous" aria-label="上一個期間">‹</button>
        <button type="button" class="ptb-gcal-icon-btn" data-calendar-action="next" aria-label="下一個期間">›</button>
        <div class="ptb-gcal-title" data-calendar-title></div>
      </div>
      <div class="ptb-gcal-view-switch" role="group" aria-label="切換行事曆檢視">
        <button type="button" data-calendar-view-button="week">週</button>
        <button type="button" class="active" data-calendar-view-button="month">月</button>
        <button type="button" data-calendar-view-button="year">年</button>
      </div>
    </div>

    <div class="ptb-gcal-status" data-calendar-view-status>
      行事曆固定顯示目前日期。選擇預算單位並查詢後，才會載入組別作息。
    </div>

    <div class="ptb-gcal-view" data-calendar-view="week" hidden></div>
    <div class="ptb-gcal-view" data-calendar-view="month"></div>
    <div class="ptb-gcal-view" data-calendar-view="year" hidden></div>

    <div class="ptb-gcal-dialog-backdrop" data-calendar-day-dialog hidden>
      <section class="ptb-gcal-dialog" role="dialog" aria-modal="true" aria-labelledby="ptb-gcal-dialog-title">
        <header class="ptb-gcal-dialog-header">
          <div class="ptb-gcal-date-badge">
            <span data-dialog-weekday></span>
            <strong data-dialog-day></strong>
          </div>
          <div class="ptb-gcal-dialog-heading">
            <h3 id="ptb-gcal-dialog-title" data-dialog-title></h3>
            <p data-dialog-subtitle></p>
          </div>
          <button type="button" class="ptb-gcal-dialog-close" data-dialog-close aria-label="關閉">×</button>
        </header>
        <div class="ptb-gcal-dialog-summary" data-dialog-summary></div>
        <div class="ptb-gcal-agenda" data-dialog-agenda></div>
      </section>
    </div>
  `;
  return shell;
}

function bindControls(state) {
  state.shell.querySelectorAll('[data-calendar-view-button]').forEach(button => {
    button.addEventListener('click', () => {
      const view = button.dataset.calendarViewButton;
      if (!VIEW_IDS.includes(view)) return;
      state.view = view;
      render(state);
    });
  });

  state.shell.querySelector('[data-calendar-action="today"]').addEventListener('click', () => {
    state.anchorDate = startOfDay(new Date());
    render(state);
  });

  state.shell.querySelector('[data-calendar-action="previous"]').addEventListener('click', () => {
    state.anchorDate = moveAnchor(state.anchorDate, state.view, -1);
    render(state);
  });

  state.shell.querySelector('[data-calendar-action="next"]').addEventListener('click', () => {
    state.anchorDate = moveAnchor(state.anchorDate, state.view, 1);
    render(state);
  });

  state.dialog.querySelector('[data-dialog-close]').addEventListener('click', () => closeDialog(state));
  state.dialog.addEventListener('click', event => {
    if (event.target === state.dialog) closeDialog(state);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !state.dialog.hidden) closeDialog(state);
  });
}

function queueSync(state) {
  if (state.syncQueued) return;
  state.syncQueued = true;
  queueMicrotask(() => {
    state.syncQueued = false;
    syncFromLegacyTable(state);
  });
}

function syncFromLegacyTable(state) {
  const queried = state.legacyWrap.getAttribute('data-cal-table-hidden') === 'false';
  const querySignature = readQuerySignature(state.root);
  const signatureChanged = queried && querySignature && querySignature !== state.querySignature;

  state.queried = queried;
  state.querySignature = queried ? querySignature : '';
  state.dateMap = queried ? parseLegacyRows(state.legacyBody) : new Map();

  if (signatureChanged) {
    state.anchorDate = resolveInitialAnchor(state.root, state.dateMap);
  }

  render(state);
}

function readQuerySignature(root) {
  const summary = root.querySelector('#cal-query-summary');
  return summary && summary.style.display !== 'none' ? summary.textContent.trim() : '';
}

function parseLegacyRows(tbody) {
  const dateMap = new Map();
  let currentDateKey = '';
  let currentAcademicYear = '';
  let currentWeekday = '';
  let currentScheduleType = '';

  Array.from(tbody.querySelectorAll('tr')).forEach(row => {
    const cells = Array.from(row.cells);
    if (!cells.length) return;

    const displayedDate = cells[0]?.textContent.trim() || '';
    const parsedDate = parseDisplayedDate(displayedDate);
    if (parsedDate) {
      currentDateKey = toDateKey(parsedDate);
      currentScheduleType = '';
    }
    if (!currentDateKey) return;

    const academicYear = cells[1]?.textContent.trim() || '';
    const weekday = cells[2]?.textContent.trim() || '';
    if (academicYear) currentAcademicYear = academicYear;
    if (weekday) currentWeekday = weekday;

    const day = ensureDayRecord(dateMap, currentDateKey);
    day.academicYear = currentAcademicYear;
    day.weekday = currentWeekday;

    if (row.classList.contains('holiday-row')) {
      const raw = cells[3]?.textContent.trim() || '假日';
      day.holidayName = raw
        .replace(/　?假日，不計算上班時間.*$/, '')
        .trim() || '假日';
      return;
    }

    if (row.classList.contains('period-only-row')) {
      day.periodOnly = true;
      return;
    }

    if (cells.length < 9) return;

    const scheduleType = cells[3]?.textContent.trim() || '';
    if (scheduleType) currentScheduleType = scheduleType;

    const unitNameEl = cells[4]?.querySelector('.calendar-unit-name');
    const unitName = unitNameEl?.textContent.trim() || cells[4]?.textContent.trim() || '';
    const color = normalizeColor(unitNameEl?.style.color || '');
    const [startTime = '', endTime = ''] = String(cells[5]?.textContent || '')
      .trim()
      .split(/\s*[~～]\s*/);

    if (!unitName && !startTime && !endTime) return;

    day.events.push({
      unitName,
      scheduleType: currentScheduleType,
      startTime,
      endTime,
      hours: cells[6]?.textContent.trim() || '',
      hourlyWage: cells[7]?.textContent.trim() || '',
      note: cells[8]?.textContent.trim() || '',
      color
    });
  });

  dateMap.forEach(day => {
    day.events.sort((a, b) => {
      const timeCompare = a.startTime.localeCompare(b.startTime);
      if (timeCompare !== 0) return timeCompare;
      return a.unitName.localeCompare(b.unitName, 'zh-Hant');
    });
  });

  return dateMap;
}

function ensureDayRecord(dateMap, key) {
  if (!dateMap.has(key)) {
    dateMap.set(key, {
      dateKey: key,
      academicYear: '',
      weekday: '',
      holidayName: '',
      periodOnly: false,
      events: []
    });
  }
  return dateMap.get(key);
}

function normalizeColor(value) {
  if (!value) return '#1a73e8';
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return value;
  const match = value.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/i);
  if (!match) return '#1a73e8';
  return `#${[match[1], match[2], match[3]]
    .map(part => Number(part).toString(16).padStart(2, '0'))
    .join('')}`;
}

function resolveInitialAnchor(root, dateMap) {
  const today = startOfDay(new Date());
  const mode = root.querySelector('#cal-filter-mode')?.value || 'academicYear';

  if (mode === 'dateRange') {
    const start = parseInputDate(root.querySelector('#cal-filter-start')?.value || '');
    const end = parseInputDate(root.querySelector('#cal-filter-end')?.value || '');
    if (start && end && today >= start && today <= end) return today;
    if (start) return start;
  } else {
    const academicYear = Number(root.querySelector('#cal-filter-year')?.value || '');
    if (academicYear) {
      if (inferAcademicYear(today) === academicYear) return today;
      return new Date(academicYear + 1911, 7, 1);
    }
  }

  const firstKey = [...dateMap.keys()].sort()[0];
  return firstKey ? parseDateKey(firstKey) : today;
}

function render(state) {
  updateViewButtons(state);
  updateTitle(state);
  updateStatus(state);

  state.weekView.hidden = state.view !== 'week';
  state.monthView.hidden = state.view !== 'month';
  state.yearView.hidden = state.view !== 'year';

  if (state.view === 'week') renderWeek(state);
  else if (state.view === 'year') renderYear(state);
  else renderMonth(state);

  if (!state.dialog.hidden && state.dialogDateKey) {
    renderDialog(state, state.dialogDateKey);
  }
}

function updateViewButtons(state) {
  state.shell.querySelectorAll('[data-calendar-view-button]').forEach(button => {
    const active = button.dataset.calendarViewButton === state.view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function updateTitle(state) {
  const anchor = state.anchorDate;
  if (state.view === 'month') {
    state.titleEl.textContent = `${anchor.getFullYear()} 年 ${anchor.getMonth() + 1} 月`;
    return;
  }
  if (state.view === 'year') {
    state.titleEl.textContent = `${anchor.getFullYear()} 年`;
    return;
  }

  const start = startOfWeek(anchor);
  const end = addDays(start, 6);
  if (start.getFullYear() !== end.getFullYear()) {
    state.titleEl.textContent =
      `${start.getFullYear()} 年 ${start.getMonth() + 1} 月 ${start.getDate()} 日` +
      `–${end.getFullYear()} 年 ${end.getMonth() + 1} 月 ${end.getDate()} 日`;
  } else if (start.getMonth() !== end.getMonth()) {
    state.titleEl.textContent =
      `${start.getFullYear()} 年 ${start.getMonth() + 1} 月 ${start.getDate()} 日` +
      `–${end.getMonth() + 1} 月 ${end.getDate()} 日`;
  } else {
    state.titleEl.textContent =
      `${start.getFullYear()} 年 ${start.getMonth() + 1} 月 ${start.getDate()}–${end.getDate()} 日`;
  }
}

function updateStatus(state) {
  if (!state.queried) {
    state.statusEl.className = 'ptb-gcal-status';
    state.statusEl.textContent =
      '行事曆固定顯示目前日期。選擇預算單位並查詢後，才會載入組別作息。';
    return;
  }

  state.statusEl.className = 'ptb-gcal-status loaded';
  state.statusEl.textContent = state.querySignature || '查詢完成。點選日期可查看完整單日作息。';
}

function renderMonth(state) {
  const target = state.monthView;
  target.replaceChildren();

  const weekdays = document.createElement('div');
  weekdays.className = 'ptb-gcal-month-weekdays';
  WEEKDAYS.forEach(name => {
    const item = document.createElement('div');
    item.textContent = name;
    weekdays.appendChild(item);
  });

  const grid = document.createElement('div');
  grid.className = 'ptb-gcal-month-grid';
  const first = startOfMonth(state.anchorDate);
  const gridStart = addDays(first, -first.getDay());
  const today = startOfDay(new Date());

  for (let index = 0; index < 42; index += 1) {
    const date = addDays(gridStart, index);
    const key = toDateKey(date);
    const day = state.dateMap.get(key);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'ptb-gcal-month-day';
    if (date.getMonth() !== first.getMonth()) cell.classList.add('outside');
    if (sameDate(date, today)) cell.classList.add('today');
    if (day?.holidayName) cell.classList.add('holiday');

    const dayNumber = document.createElement('span');
    dayNumber.className = 'ptb-gcal-day-number';
    dayNumber.textContent = String(date.getDate());
    cell.appendChild(dayNumber);

    const events = document.createElement('div');
    events.className = 'ptb-gcal-month-events';

    if (state.queried && day?.holidayName) {
      events.appendChild(createMonthHoliday(day.holidayName));
    }

    const visibleLimit = day?.holidayName ? 2 : 3;
    const visibleEvents = day?.events.slice(0, visibleLimit) || [];
    visibleEvents.forEach(event => events.appendChild(createMonthEvent(event)));

    const hiddenCount = Math.max(0, (day?.events.length || 0) - visibleEvents.length);
    if (hiddenCount) {
      const more = document.createElement('span');
      more.className = 'ptb-gcal-more';
      more.textContent = `還有 ${hiddenCount} 項`;
      events.appendChild(more);
    } else if (state.queried && day?.periodOnly && !day.events.length && !day.holidayName) {
      const empty = document.createElement('span');
      empty.className = 'ptb-gcal-period-only';
      empty.textContent = '尚未套用作息';
      events.appendChild(empty);
    }

    cell.appendChild(events);
    cell.addEventListener('click', () => openDialog(state, key));
    grid.appendChild(cell);
  }

  target.append(weekdays, grid);
}

function createMonthHoliday(name) {
  const item = document.createElement('span');
  item.className = 'ptb-gcal-month-event holiday-event';
  item.title = name;
  item.innerHTML = `<i></i>${escapeHtml(name)}`;
  return item;
}

function createMonthEvent(event) {
  const item = document.createElement('span');
  item.className = 'ptb-gcal-month-event';
  item.style.backgroundColor = event.color;
  item.title = `${event.startTime}–${event.endTime} ${event.unitName}`;
  item.textContent = `${event.startTime} ${event.unitName}`;
  return item;
}

function renderWeek(state) {
  const target = state.weekView;
  target.replaceChildren();
  const weekStart = startOfWeek(state.anchorDate);
  const today = startOfDay(new Date());

  const head = document.createElement('div');
  head.className = 'ptb-gcal-week-head';
  head.appendChild(document.createElement('div'));

  for (let index = 0; index < 7; index += 1) {
    const date = addDays(weekStart, index);
    const key = toDateKey(date);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ptb-gcal-week-day-head';
    if (sameDate(date, today)) button.classList.add('today');
    button.innerHTML = `
      <span>${WEEKDAYS[date.getDay()]}</span>
      <strong>${date.getDate()}</strong>
    `;
    button.addEventListener('click', () => openDialog(state, key));
    head.appendChild(button);
  }

  const scroll = document.createElement('div');
  scroll.className = 'ptb-gcal-week-scroll';
  const canvas = document.createElement('div');
  canvas.className = 'ptb-gcal-week-canvas';

  const gutter = document.createElement('div');
  gutter.className = 'ptb-gcal-time-gutter';
  gutter.style.height = `${(DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT}px`;
  for (let hour = DAY_START_HOUR; hour <= DAY_END_HOUR; hour += 1) {
    const label = document.createElement('span');
    label.style.top = `${(hour - DAY_START_HOUR) * HOUR_HEIGHT}px`;
    label.textContent = `${String(hour).padStart(2, '0')}:00`;
    gutter.appendChild(label);
  }
  canvas.appendChild(gutter);

  for (let index = 0; index < 7; index += 1) {
    const date = addDays(weekStart, index);
    const key = toDateKey(date);
    const day = state.dateMap.get(key);
    const column = document.createElement('div');
    column.className = 'ptb-gcal-week-column';
    column.style.height = `${(DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT}px`;
    if (sameDate(date, today)) column.classList.add('today');
    column.addEventListener('click', () => openDialog(state, key));

    if (state.queried && day?.holidayName) {
      const holiday = document.createElement('button');
      holiday.type = 'button';
      holiday.className = 'ptb-gcal-week-holiday';
      holiday.textContent = day.holidayName;
      holiday.addEventListener('click', event => {
        event.stopPropagation();
        openDialog(state, key);
      });
      column.appendChild(holiday);
    }

    const timed = (day?.events || []).filter(event =>
      parseClock(event.startTime) !== null && parseClock(event.endTime) !== null
    );
    timed.forEach((event, eventIndex) => {
      const start = parseClock(event.startTime);
      const end = parseClock(event.endTime);
      const laneCount = Math.max(1, timed.length);
      const top = Math.max(0, (start - DAY_START_HOUR) * HOUR_HEIGHT);
      const height = Math.max(30, (end - start) * HOUR_HEIGHT);
      const block = document.createElement('button');
      block.type = 'button';
      block.className = 'ptb-gcal-week-event';
      block.style.backgroundColor = event.color;
      block.style.top = `${top}px`;
      block.style.height = `${height}px`;
      block.style.left = `calc(${eventIndex * (100 / laneCount)}% + 2px)`;
      block.style.width = `calc(${100 / laneCount}% - 4px)`;
      block.title = `${event.unitName}｜${event.startTime}–${event.endTime}｜${event.scheduleType}`;
      block.innerHTML = `
        <strong>${escapeHtml(event.unitName)}</strong>
        <span>${escapeHtml(event.startTime)}–${escapeHtml(event.endTime)}</span>
        <span>${escapeHtml(event.scheduleType)}</span>
      `;
      block.addEventListener('click', clickEvent => {
        clickEvent.stopPropagation();
        openDialog(state, key);
      });
      column.appendChild(block);
    });

    canvas.appendChild(column);
  }

  if (!state.queried) {
    const note = document.createElement('div');
    note.className = 'ptb-gcal-week-empty-note';
    note.textContent = '選擇預算單位並查詢後，週檢視才會顯示各組作息時間區塊。';
    canvas.appendChild(note);
  }

  scroll.appendChild(canvas);
  target.append(head, scroll);

  requestAnimationFrame(() => {
    scroll.scrollTop = Math.max(0, (8 - DAY_START_HOUR) * HOUR_HEIGHT);
  });
}

function renderYear(state) {
  const target = state.yearView;
  target.replaceChildren();
  const grid = document.createElement('div');
  grid.className = 'ptb-gcal-year-grid';
  const year = state.anchorDate.getFullYear();
  const today = startOfDay(new Date());

  for (let month = 0; month < 12; month += 1) {
    const card = document.createElement('section');
    card.className = 'ptb-gcal-mini-month';

    const title = document.createElement('h4');
    title.textContent = `${month + 1} 月`;

    const weekdays = document.createElement('div');
    weekdays.className = 'ptb-gcal-mini-weekdays';
    ['日', '一', '二', '三', '四', '五', '六'].forEach(name => {
      const span = document.createElement('span');
      span.textContent = name;
      weekdays.appendChild(span);
    });

    const days = document.createElement('div');
    days.className = 'ptb-gcal-mini-days';
    const first = new Date(year, month, 1);
    const gridStart = addDays(first, -first.getDay());

    for (let index = 0; index < 42; index += 1) {
      const date = addDays(gridStart, index);
      const key = toDateKey(date);
      const record = state.dateMap.get(key);
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(date.getDate());
      if (date.getMonth() !== month) button.classList.add('outside');
      if (sameDate(date, today)) button.classList.add('today');
      if (record && (record.events.length || record.holidayName)) button.classList.add('has-events');
      if (record?.holidayName) button.classList.add('holiday');
      button.addEventListener('click', () => openDialog(state, key));
      days.appendChild(button);
    }

    card.append(title, weekdays, days);
    grid.appendChild(card);
  }

  target.appendChild(grid);
}

function openDialog(state, dateKey) {
  state.dialogDateKey = dateKey;
  renderDialog(state, dateKey);
  state.dialog.hidden = false;
  document.body.classList.add('ptb-gcal-dialog-open');
}

function closeDialog(state) {
  state.dialog.hidden = true;
  state.dialogDateKey = '';
  document.body.classList.remove('ptb-gcal-dialog-open');
}

function renderDialog(state, dateKey) {
  const date = parseDateKey(dateKey);
  if (!date) return;
  const day = state.dateMap.get(dateKey);
  const dialog = state.dialog;

  dialog.querySelector('[data-dialog-weekday]').textContent = WEEKDAYS[date.getDay()];
  dialog.querySelector('[data-dialog-day]').textContent = String(date.getDate());
  dialog.querySelector('[data-dialog-title]').textContent =
    `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  dialog.querySelector('[data-dialog-subtitle]').textContent =
    state.queried ? (state.querySignature || '目前查詢結果') : '尚未載入預算單位資料';

  const summary = dialog.querySelector('[data-dialog-summary]');
  const agenda = dialog.querySelector('[data-dialog-agenda]');
  agenda.replaceChildren();

  if (!state.queried) {
    summary.textContent = '請先選擇預算單位並執行查詢';
    agenda.appendChild(createEmptyAgenda('行事曆固定顯示日期，但目前沒有載入任何單位作息。'));
    return;
  }

  const events = day?.events || [];
  const totalHours = events.reduce((sum, event) => sum + (Number(event.hours) || 0), 0);
  const wageLevels = new Set(events.map(event => event.hourlyWage).filter(Boolean)).size;
  summary.textContent =
    `${events.length + (day?.holidayName ? 1 : 0)} 項資料｜${formatNumber(totalHours)} 小時｜${wageLevels} 種時薪級距`;

  if (day?.holidayName) {
    const holiday = document.createElement('article');
    holiday.className = 'ptb-gcal-agenda-item holiday';
    holiday.innerHTML = `
      <div class="ptb-gcal-agenda-time">全天</div>
      <i></i>
      <div>
        <strong>${escapeHtml(day.holidayName)}</strong>
        <p>假日，不計算上班時間</p>
      </div>
    `;
    agenda.appendChild(holiday);
  }

  events.forEach(event => {
    const amount = (Number(event.hours) || 0) * (Number(event.hourlyWage) || 0);
    const item = document.createElement('article');
    item.className = 'ptb-gcal-agenda-item';
    item.innerHTML = `
      <div class="ptb-gcal-agenda-time">
        ${escapeHtml(event.startTime)}<br>${escapeHtml(event.endTime)}
      </div>
      <i style="background:${escapeHtml(event.color)}"></i>
      <div>
        <strong>${escapeHtml(event.unitName)}</strong>
        <div class="ptb-gcal-agenda-meta">
          <span>${escapeHtml(event.scheduleType)}</span>
          <span>${escapeHtml(event.hours)} 小時</span>
          <span>時薪 ${escapeHtml(event.hourlyWage)} 元</span>
          <span>預估 ${formatNumber(amount)} 元</span>
        </div>
        ${event.note ? `<p>${escapeHtml(event.note)}</p>` : ''}
      </div>
    `;
    agenda.appendChild(item);
  });

  if (!day?.holidayName && !events.length) {
    agenda.appendChild(createEmptyAgenda(
      day?.periodOnly ? '本日已建立週期，但尚未套用作息區間。' : '此日期沒有符合目前查詢條件的資料。'
    ));
  }
}

function createEmptyAgenda(text) {
  const empty = document.createElement('div');
  empty.className = 'ptb-gcal-agenda-empty';
  empty.textContent = text;
  return empty;
}

function moveAnchor(date, view, direction) {
  if (view === 'week') return addDays(date, 7 * direction);
  if (view === 'year') return new Date(date.getFullYear() + direction, 0, 1);
  return new Date(date.getFullYear(), date.getMonth() + direction, 1);
}

function parseClock(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) + Number(match[2]) / 60;
}

function parseDisplayedDate(value) {
  const match = String(value || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseInputDate(value) {
  const normalized = String(value || '').trim().replaceAll('/', '-');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateKey(value) {
  return parseInputDate(value);
}

function toDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfWeek(date) {
  const start = startOfDay(date);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function addDays(date, count) {
  const result = new Date(date);
  result.setDate(result.getDate() + count);
  return result;
}

function sameDate(left, right) {
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();
}

function inferAcademicYear(date) {
  const rocYear = date.getFullYear() - 1911;
  return date.getMonth() >= 7 ? rocYear : rocYear - 1;
}

function formatNumber(value) {
  return new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
