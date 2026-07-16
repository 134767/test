// PTB 1.6.0 calendar Google views hotfix-3：新增「日」模式的單月條列檢視。
// 此模式只讀取既有 legacy calendar table，不改查詢、資料 schema 或寫入契約。

const ASSET_VERSION = '1.6.0-calendar-google-views-hotfix-3';
const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const installs = new WeakMap();

export function installCalendarGoogleDayListView(root) {
  if (!root || installs.has(root)) return;

  const shell = root.querySelector('[data-calendar-google-views]');
  const legacyWrap = root.querySelector('#calendar-table-wrap');
  const legacyBody = root.querySelector('#calendar-tbody');
  const summary = root.querySelector('#cal-query-summary');
  if (!shell || !legacyWrap || !legacyBody || !summary) return;

  ensureStylesheet();

  const viewSwitch = shell.querySelector('.ptb-gcal-view-switch');
  const firstBaseButton = viewSwitch?.querySelector('[data-calendar-view-button]');
  const firstBaseView = shell.querySelector('[data-calendar-view]');
  if (!viewSwitch || !firstBaseButton || !firstBaseView) return;

  const dayButton = document.createElement('button');
  dayButton.type = 'button';
  dayButton.textContent = '日';
  dayButton.dataset.calendarDayListButton = 'true';
  dayButton.setAttribute('aria-pressed', 'false');
  viewSwitch.insertBefore(dayButton, firstBaseButton);

  const dayView = document.createElement('div');
  dayView.className = 'ptb-gcal-view ptb-gcal-day-list-view';
  dayView.dataset.calendarDayListView = 'true';
  dayView.hidden = true;
  firstBaseView.insertAdjacentElement('beforebegin', dayView);

  const state = {
    root,
    shell,
    legacyWrap,
    legacyBody,
    summary,
    dayButton,
    dayView,
    active: false,
    anchorMonth: startOfMonth(new Date()),
    queried: false,
    querySignature: '',
    dateMap: new Map(),
    syncQueued: false,
    observer: null
  };

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
  state.observer.observe(summary, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true
  });

  installs.set(root, state);
  queueSync(state);
}

function ensureStylesheet() {
  if (document.querySelector('link[data-ptb-calendar-day-list]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.dataset.ptbCalendarDayList = 'true';
  link.href = new URL(`../css/calendarGoogleDayListView.css?v=${ASSET_VERSION}`, import.meta.url).href;
  document.head.appendChild(link);
}

function bindControls(state) {
  state.dayButton.addEventListener('click', event => {
    event.preventDefault();
    state.active = true;
    activateDayView(state);
    renderDayList(state);
  });

  state.shell.querySelectorAll('[data-calendar-view-button]').forEach(button => {
    button.addEventListener('click', () => {
      state.active = false;
      state.dayButton.classList.remove('active');
      state.dayButton.setAttribute('aria-pressed', 'false');
      state.dayView.hidden = true;
    }, { capture: true });
  });

  const today = state.shell.querySelector('[data-calendar-action="today"]');
  const previous = state.shell.querySelector('[data-calendar-action="previous"]');
  const next = state.shell.querySelector('[data-calendar-action="next"]');

  today?.addEventListener('click', event => {
    if (!state.active) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.anchorMonth = startOfMonth(new Date());
    renderDayList(state);
  }, { capture: true });

  previous?.addEventListener('click', event => {
    if (!state.active) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.anchorMonth = addMonths(state.anchorMonth, -1);
    renderDayList(state);
  }, { capture: true });

  next?.addEventListener('click', event => {
    if (!state.active) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.anchorMonth = addMonths(state.anchorMonth, 1);
    renderDayList(state);
  }, { capture: true });
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
  const querySignature = state.summary.style.display !== 'none'
    ? state.summary.textContent.trim()
    : '';
  const signatureChanged = queried && querySignature && querySignature !== state.querySignature;

  state.queried = queried;
  state.querySignature = queried ? querySignature : '';
  state.dateMap = queried ? parseLegacyRows(state.legacyBody) : new Map();

  if (signatureChanged) {
    state.anchorMonth = resolveInitialMonth(state);
  }

  if (state.active) {
    activateDayView(state);
    renderDayList(state);
  }
}

function activateDayView(state) {
  state.shell.querySelectorAll('[data-calendar-view]').forEach(view => {
    view.hidden = true;
  });
  state.dayView.hidden = false;

  state.shell.querySelectorAll('[data-calendar-view-button]').forEach(button => {
    button.classList.remove('active');
    button.setAttribute('aria-pressed', 'false');
  });
  state.dayButton.classList.add('active');
  state.dayButton.setAttribute('aria-pressed', 'true');
}

function renderDayList(state) {
  activateDayView(state);
  const title = state.shell.querySelector('[data-calendar-title]');
  if (title) {
    title.textContent = `${state.anchorMonth.getFullYear()} 年 ${state.anchorMonth.getMonth() + 1} 月`;
  }

  state.dayView.replaceChildren();

  if (!state.queried) {
    state.dayView.appendChild(createEmptyState(
      '選擇預算單位並執行查詢後，「日」模式會以日期分段顯示目前月份的全部作息。'
    ));
    return;
  }

  const monthStart = startOfMonth(state.anchorMonth);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const records = [...state.dateMap.values()]
    .filter(day => day.date >= monthStart && day.date <= monthEnd)
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));

  const header = document.createElement('div');
  header.className = 'ptb-gcal-day-list-month-summary';
  const eventCount = records.reduce((sum, day) => sum + day.events.length, 0);
  const holidayCount = records.filter(day => day.holidayName).length;
  header.innerHTML = `
    <strong>${monthStart.getFullYear()} 年 ${monthStart.getMonth() + 1} 月</strong>
    <span>${records.length} 個日期｜${eventCount} 筆作息｜${holidayCount} 個假日</span>
  `;
  state.dayView.appendChild(header);

  if (!records.length) {
    state.dayView.appendChild(createEmptyState('此月份沒有符合目前查詢條件的行事曆資料。'));
    return;
  }

  const list = document.createElement('div');
  list.className = 'ptb-gcal-day-list';
  records.forEach(day => list.appendChild(createDaySection(day)));
  state.dayView.appendChild(list);
}

function createDaySection(day) {
  const section = document.createElement('section');
  section.className = 'ptb-gcal-day-list-section';
  if (day.holidayName) section.classList.add('holiday');

  const totalHours = day.events.reduce((sum, event) => sum + (Number(event.hours) || 0), 0);
  const header = document.createElement('header');
  header.className = 'ptb-gcal-day-list-date';
  header.innerHTML = `
    <div class="ptb-gcal-day-list-date-badge">
      <span>${WEEKDAYS[day.date.getDay()]}</span>
      <strong>${day.date.getDate()}</strong>
    </div>
    <div class="ptb-gcal-day-list-date-title">
      <strong>${day.date.getFullYear()} 年 ${day.date.getMonth() + 1} 月 ${day.date.getDate()} 日</strong>
      <span>${escapeHtml(day.academicYear ? `${day.academicYear} 學年度` : '')}</span>
    </div>
    <div class="ptb-gcal-day-list-date-summary">
      ${day.events.length + (day.holidayName ? 1 : 0)} 項資料｜${formatNumber(totalHours)} 小時
    </div>
  `;
  section.appendChild(header);

  const rows = document.createElement('div');
  rows.className = 'ptb-gcal-day-list-rows';

  if (day.holidayName) {
    const holiday = document.createElement('article');
    holiday.className = 'ptb-gcal-day-list-row holiday-row';
    holiday.innerHTML = `
      <div class="ptb-gcal-day-list-time">全天</div>
      <i></i>
      <div class="ptb-gcal-day-list-main">
        <strong>${escapeHtml(day.holidayName)}</strong>
        <div class="ptb-gcal-day-list-meta"><span>假日，不計算上班時間</span></div>
      </div>
    `;
    rows.appendChild(holiday);
  }

  day.events.forEach(event => {
    const amount = (Number(event.hours) || 0) * (Number(event.hourlyWage) || 0);
    const row = document.createElement('article');
    row.className = 'ptb-gcal-day-list-row';
    row.innerHTML = `
      <div class="ptb-gcal-day-list-time">
        <span>${escapeHtml(event.startTime)}</span>
        <span>${escapeHtml(event.endTime)}</span>
      </div>
      <i style="background:${escapeHtml(event.color)}"></i>
      <div class="ptb-gcal-day-list-main">
        <strong>${escapeHtml(event.unitName)}</strong>
        <div class="ptb-gcal-day-list-meta">
          <span>${escapeHtml(event.scheduleType)}</span>
          <span>${escapeHtml(event.hours)} 小時</span>
          <span>時薪 ${escapeHtml(event.hourlyWage)} 元</span>
          <span>預估 ${formatNumber(amount)} 元</span>
        </div>
        ${event.note ? `<p>${escapeHtml(event.note)}</p>` : ''}
      </div>
    `;
    rows.appendChild(row);
  });

  if (!day.holidayName && !day.events.length) {
    const empty = document.createElement('div');
    empty.className = 'ptb-gcal-day-list-row empty-row';
    empty.textContent = day.periodOnly
      ? '本日已建立週期，但尚未套用作息區間。'
      : '本日沒有符合目前查詢條件的資料。';
    rows.appendChild(empty);
  }

  section.appendChild(rows);
  return section;
}

function createEmptyState(text) {
  const empty = document.createElement('div');
  empty.className = 'ptb-gcal-day-list-empty';
  empty.textContent = text;
  return empty;
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
      day.holidayName = raw.replace(/　?假日，不計算上班時間.*$/, '').trim() || '假日';
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
      color: normalizeColor(unitNameEl?.style.color || '')
    });
  });

  dateMap.forEach(day => {
    day.events.sort((left, right) => {
      const timeCompare = left.startTime.localeCompare(right.startTime);
      return timeCompare || left.unitName.localeCompare(right.unitName, 'zh-Hant');
    });
  });
  return dateMap;
}

function ensureDayRecord(dateMap, key) {
  if (!dateMap.has(key)) {
    dateMap.set(key, {
      dateKey: key,
      date: parseDateKey(key),
      academicYear: '',
      weekday: '',
      holidayName: '',
      periodOnly: false,
      events: []
    });
  }
  return dateMap.get(key);
}

function resolveInitialMonth(state) {
  const today = startOfMonth(new Date());
  const values = [...state.dateMap.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  if (values.some(day => day.date.getFullYear() === today.getFullYear() && day.date.getMonth() === today.getMonth())) {
    return today;
  }
  return values.length ? startOfMonth(values[0].date) : today;
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

function parseDisplayedDate(value) {
  const match = String(value || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateKey(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function toDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, count) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
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
