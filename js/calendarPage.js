// js/calendarPage.js
import {
  getCalendarPeriods,
  getCalendarRows,
  addCalendarPeriod,
  deleteCalendarPeriodsByDateRange,
  addCalendarRows,
  saveCalendarRowsBatch,
  saveCalendarPeriodRowsBatch,
  deleteCalendarRowsByScope,
  deleteCalendarRowsByCriteria,
  getScheduleTypesByYear,
  getUnitsByYearAndType,
  getHourSettings,
  getCalendarHolidays,
  saveCalendarHoliday,
  deleteCalendarHoliday,
  findCalendarHolidayByDate,
  getBudgets,
  getUnits,
  getHolidayNames,
  getHolidayNameOptionsFromCalendarHolidays,
  saveHolidayName,
  deleteHolidayName,
  isHolidayNameUsed,
  ensureHolidayNamesFromExistingCalendarHolidays
} from './dataStore.js?v=1.6.0-hour-budget-batch-hotfix-7';
import { runWithMutationUiLock } from './mutationUi.js?v=1.6.0-hour-budget-batch-hotfix-7';
import {
  showToast,
  isValidDate,
  getWeekdayFromDate,
  formatDateForDisplay,
  getDatesInRange,
  formatTimeRange,
  normalizeDateInput,
  formatDateForManualInput,
  bindDatePickerField,
  inferAcademicYearFromDate,
  renderPagination
} from './utils.js?v=1.6.0-hour-budget-batch-hotfix-7';
import {
  getDistinctValidBudgetNames,
  getYearsForBudgetName,
  resolveBudgetForNameAndYear,
  filterCalendarRowsByBudgetScope,
  getAllowedUnitCodesForBudgetNameYear,
  getDuplicateBudgetNameYears
} from './hourBudgetScopeUtils.js?v=1.6.0-hour-budget-batch-hotfix-7';
import {
  CALENDAR_WAGE_YEAR_WARNING,
  buildCalendarRowFromHourSetting,
  getAcademicYearRangeHint,
  getCalendarWagePreviewText,
  validateCalendarIntervalRange,
  validateIntervalHourlyWage
} from './calendarWageUtils.js?v=1.6.0-hour-budget-batch-hotfix-7';

let containerEl = null;

let periodModalMode = 'add'; // 'add' | 'delete'
let intervalModalMode = 'add'; // 'add' | 'delete'

let selectedSourceIdsForDelete = new Set();
let selectedIntervalScheduleTypes = new Set();
let selectedIntervalUnitCodes = new Set();

let calendarFilter = {
  selectedBudgetName: '',
  mode: 'academicYear',
  academicYear: '',
  startDate: '',
  endDate: '',
  queried: false,
  warnings: []
};

let holidayCurrentPage = 1;
let holidayModalTab = 'records'; // records | names
let holidayNameCurrentPage = 1;
const HOLIDAY_PAGE_SIZE = 20;

export function initCalendarPage(container) {
  containerEl = container;
  container.innerHTML = `
    <div class="page-header">
      <h2>行事曆</h2>
      <div class="toolbar toolbar-right">
        <div class="toolbar-row">
          <button id="btn-holiday-setting" class="btn-primary">國定與校定假日設定</button>
          <button id="btn-add-period" class="btn-primary">新增週期</button>
          <button id="btn-add-interval" class="btn-primary" style="display:none;" disabled>新增作息區間</button>
        </div>
        <div class="toolbar-row">
          <button id="btn-del-period" class="btn-danger">刪除週期</button>
          <button id="btn-del-interval" class="btn-danger" style="display:none;" disabled>刪除作息區間</button>
        </div>
      </div>
    </div>

    <!-- Calendar Filter -->
    <div class="calendar-filter">
      <div class="filter-controls calendar-filter-controls">
        <div class="query-field" id="cal-budget-group-field">
          <label>預算單位</label>
          <select id="cal-filter-budget-group">
            <option value="">請選擇預算單位</option>
          </select>
        </div>

        <div id="cal-secondary-filters" class="cal-secondary-filters" style="display:none;">
          <div class="query-field">
            <label>查詢模式</label>
            <select id="cal-filter-mode">
              <option value="academicYear">依學年度</option>
              <option value="dateRange">依日期區間</option>
            </select>
          </div>

          <div class="query-field" id="cal-year-field">
            <label>學年度</label>
            <select id="cal-filter-year" class="filter-year">
              <option value="">請選擇學年度</option>
            </select>
          </div>

          <div id="cal-filter-date-range" class="filter-date-range" style="display:none;">
            <div class="date-input-wrap">
              <input type="text" id="cal-filter-start" class="date-text-input" placeholder="yyyy/mm/dd">
              <button type="button" id="cal-filter-start-btn" class="date-picker-btn" title="選擇日期">📅</button>
              <input type="date" id="cal-filter-start-native" class="date-native-input">
            </div>
            <span class="date-range-sep">~</span>
            <div class="date-input-wrap">
              <input type="text" id="cal-filter-end" class="date-text-input" placeholder="yyyy/mm/dd">
              <button type="button" id="cal-filter-end-btn" class="date-picker-btn" title="選擇日期">📅</button>
              <input type="date" id="cal-filter-end-native" class="date-native-input">
            </div>
          </div>

          <button id="cal-filter-query" class="btn-primary">查詢</button>
        </div>
      </div>
      <div id="cal-query-summary" class="cal-query-summary" style="display:none;"></div>
      <div id="cal-query-warnings" class="cal-query-warnings" style="display:none;"></div>
    </div>

    <div class="table-wrapper" id="calendar-table-wrap" style="display:none;" data-cal-table-hidden="true">
      <table class="data-table calendar-table" id="calendar-table">
        <thead>
          <tr>
            <th>日期</th>
            <th>學年度</th>
            <th>週期</th>
            <th>作息</th>
            <th>單位</th>
            <th>開館時間</th>
            <th style="text-align:right">時數</th>
            <th style="text-align:right">時薪</th>
            <th>備註</th>
          </tr>
        </thead>
        <tbody id="calendar-tbody"></tbody>
      </table>
    </div>

    <!-- Period Modal (新增/刪除週期) -->
    <div id="period-modal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="period-modal-title">新增週期</h3>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>起始日期 <span class="required">*</span></label>
            <div class="date-input-wrap">
              <input type="text" id="period-start" class="date-text-input" placeholder="yyyy/mm/dd">
              <button type="button" id="period-start-btn" class="date-picker-btn" title="選擇日期">📅</button>
              <input type="date" id="period-start-native" class="date-native-input">
            </div>
          </div>
          <div class="form-group">
            <label>結束日期 <span class="required">*</span></label>
            <div class="date-input-wrap">
              <input type="text" id="period-end" class="date-text-input" placeholder="yyyy/mm/dd">
              <button type="button" id="period-end-btn" class="date-picker-btn" title="選擇日期">📅</button>
              <input type="date" id="period-end-native" class="date-native-input">
            </div>
          </div>
          <div class="help-text" id="period-help">新增會依日期區間建立每日紀錄。刪除週期為全域操作，將清除該區間內所有預算群組的作息資料。</div>
        </div>
        <div class="modal-footer">
          <button id="period-confirm-btn" class="btn-primary">儲存</button>
          <button id="period-cancel-btn" class="btn-secondary">取消</button>
        </div>
      </div>
    </div>

    <!-- Interval Modal (新增/刪除作息區間) -->
    <div id="interval-modal" class="modal">
      <div class="modal-content modal-wide">
        <div class="modal-header">
          <h3 id="interval-modal-title">新增作息區間</h3>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>起始日期 <span class="required">*</span></label>
              <div class="date-input-wrap">
                <input type="text" id="int-start" class="date-text-input" placeholder="yyyy/mm/dd">
                <button type="button" id="int-start-btn" class="date-picker-btn" title="選擇日期">📅</button>
                <input type="date" id="int-start-native" class="date-native-input">
              </div>
            </div>
            <div class="form-group">
              <label>結束日期 <span class="required">*</span></label>
              <div class="date-input-wrap">
                <input type="text" id="int-end" class="date-text-input" placeholder="yyyy/mm/dd">
                <button type="button" id="int-end-btn" class="date-picker-btn" title="選擇日期">📅</button>
                <input type="date" id="int-end-native" class="date-native-input">
              </div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>學年度 <span class="required">*</span></label>
              <select id="int-academicYear"></select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" id="int-hourly-wage-group">
              <label>時薪 <span class="required">*</span></label>
              <input type="number" id="int-hourly-wage" min="1" step="1" placeholder="請輸入此日期區間適用的時薪">
              <div id="int-wage-year-warning" class="calendar-wage-warning"></div>
              <div id="int-academic-year-range-hint" class="help-text"></div>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>作息類型 <span class="required">*</span></label>
              <div id="int-scheduleType-buttons" class="weekday-buttons"></div>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>單位 <span class="required">*</span></label>
              <div id="int-unit-buttons" class="weekday-buttons"></div>
            </div>
          </div>

          <div class="preview-box">
            <div class="preview-title">套用規則預覽</div>
            <div id="int-preview"></div>
          </div>

          <div class="help-text">系統會自動依選取條件套用符合的時數設定到日期區間內的對應星期。</div>
        </div>
        <div class="modal-footer">
          <button id="int-confirm-btn" class="btn-primary">儲存</button>
          <button id="int-cancel-btn" class="btn-secondary">取消</button>
        </div>
      </div>
    </div>

    <!-- Holiday Modal (國定與校定假日設定) -->
    <div id="holiday-modal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>國定與校定假日設定</h3>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>日期 <span class="required">*</span></label>
            <div class="date-input-wrap">
              <input type="text" id="holiday-date" class="date-text-input" placeholder="yyyy/mm/dd">
              <button type="button" id="holiday-date-btn" class="date-picker-btn" title="選擇日期">📅</button>
              <input type="date" id="holiday-date-native" class="date-native-input">
            </div>
          </div>
          <div class="form-group">
            <label>節日名稱 <span class="required">*</span></label>
            <select id="holiday-name"></select>
          </div>
          <div style="color:#dc3545; font-size:14px; line-height:1.4; margin: 4px 0 8px;">
            校慶、畢業典禮等特殊假日若仍需上班，請不要設定為假日。
          </div>
          <div style="font-size:14px; color:#666; margin-top:8px; border-top:1px solid #eee; padding-top:6px;">
            <div class="subtab-row">
              <button type="button" id="holiday-tab-records" class="subtab-btn active">目前已設定假日</button>
              <button type="button" id="holiday-tab-names" class="subtab-btn">目前記錄的節日</button>
            </div>
            <div id="holiday-name-add-panel" class="form-group" style="display:none; margin-top:8px;">
              <label>新增節日</label>
              <div class="inline-form-row">
                <input type="text" id="holiday-name-new" placeholder="例如：國慶日、中秋節、校定假日">
                <button type="button" id="holiday-name-save-btn" class="btn-primary">儲存</button>
              </div>
            </div>
            <div id="holiday-list-container" class="paged-list-container">
              <ul id="holiday-list" style="margin:2px 0 0; padding-left:18px; font-size:14px;"></ul>
            </div>
            <div id="holiday-pagination" class="pagination"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="holiday-save-btn" class="btn-primary">儲存</button>
          <button id="holiday-cancel-btn" class="btn-secondary">退出</button>
        </div>
      </div>
    </div>
  `;

  bindCalendarEvents();
  setupDatePickers(containerEl);
  initDefaultCalendarFilter();
  // 初始不自動查詢、不載入全體資料
  updateCalendarQueryChrome();
  clearCalendarResultDom();
}

function setupDatePickers(root) {
  // 綁定所有日期輸入元件 (統一支援手動輸入 + 📅 picker)
  bindDatePickerField(root, '#period-start', '#period-start-native', '#period-start-btn');
  bindDatePickerField(root, '#period-end', '#period-end-native', '#period-end-btn');
  bindDatePickerField(root, '#int-start', '#int-start-native', '#int-start-btn');
  bindDatePickerField(root, '#int-end', '#int-end-native', '#int-end-btn');
  bindDatePickerField(root, '#holiday-date', '#holiday-date-native', '#holiday-date-btn');
  // filter date range
  bindDatePickerField(root, '#cal-filter-start', '#cal-filter-start-native', '#cal-filter-start-btn');
  bindDatePickerField(root, '#cal-filter-end', '#cal-filter-end-native', '#cal-filter-end-btn');
}

function bindCalendarEvents() {
  // Toolbar buttons
  containerEl.querySelector('#btn-add-period').addEventListener('click', () => showPeriodModal('add'));
  containerEl.querySelector('#btn-del-period').addEventListener('click', () => showPeriodModal('delete'));
  containerEl.querySelector('#btn-add-interval').addEventListener('click', () => showIntervalModal('add'));
  containerEl.querySelector('#btn-del-interval').addEventListener('click', () => showIntervalModal('delete'));
  const holidayBtn = containerEl.querySelector('#btn-holiday-setting');
  if (holidayBtn) holidayBtn.addEventListener('click', showHolidayModal);

  // Period modal
  const pModal = containerEl.querySelector('#period-modal');
  const pConfirm = containerEl.querySelector('#period-confirm-btn');
  const pCancel = containerEl.querySelector('#period-cancel-btn');

  pConfirm.addEventListener('click', handlePeriodConfirm);
  pCancel.addEventListener('click', () => hidePeriodModal());
  pModal.addEventListener('click', e => { if (e.target === pModal) hidePeriodModal(); });

  // Interval modal cascading
  const iModal = containerEl.querySelector('#interval-modal');
  const iConfirm = containerEl.querySelector('#int-confirm-btn');
  const iCancel = containerEl.querySelector('#int-cancel-btn');
  const iWage = containerEl.querySelector('#int-hourly-wage');

  iConfirm.addEventListener('click', handleIntervalConfirm);
  iCancel.addEventListener('click', () => hideIntervalModal());
  iModal.addEventListener('click', e => { if (e.target === iModal) hideIntervalModal(); });
  iWage.addEventListener('input', updateIntervalPreview);

  // Holiday modal bindings
  const hModal = containerEl.querySelector('#holiday-modal');
  const hSave = containerEl.querySelector('#holiday-save-btn');
  const hCancel = containerEl.querySelector('#holiday-cancel-btn');
  if (hSave) hSave.addEventListener('click', handleHolidaySave);
  if (hCancel) hCancel.addEventListener('click', () => hideHolidayModal());
  // 背景點擊不要關閉，避免誤關（只按「退出」關閉）

  // 新增節日 + tabs
  const nameSaveBtn = containerEl.querySelector('#holiday-name-save-btn');
  if (nameSaveBtn) nameSaveBtn.addEventListener('click', handleHolidayNameSave);

  const tabRecords = containerEl.querySelector('#holiday-tab-records');
  if (tabRecords) tabRecords.addEventListener('click', () => {
    holidayModalTab = 'records';
    holidayCurrentPage = 1;
    updateHolidayTabsUI();
    renderHolidayListInModal();
  });

  const tabNames = containerEl.querySelector('#holiday-tab-names');
  if (tabNames) tabNames.addEventListener('click', () => {
    holidayModalTab = 'names';
    holidayNameCurrentPage = 1;
    updateHolidayTabsUI();
    renderHolidayListInModal();
  });

  const aySel = containerEl.querySelector('#int-academicYear');

  aySel.addEventListener('change', () => {
    selectedSourceIdsForDelete.clear();
    selectedIntervalScheduleTypes.clear();
    selectedIntervalUnitCodes.clear();
    populateScheduleTypeButtonsForInterval(true);
    populateUnitButtonsForInterval(true);
    updateIntervalYearGuidance();
    updateIntervalPreview();
  });

  // Calendar filter events
  setupCalendarFilterEvents();
}

// ===== CALENDAR FILTER HELPERS =====
function clearCalendarResultDom() {
  const tbody = containerEl ? containerEl.querySelector('#calendar-tbody') : null;
  if (tbody) tbody.innerHTML = '';
  const wrap = containerEl ? containerEl.querySelector('#calendar-table-wrap') : null;
  if (wrap) {
    wrap.style.display = 'none';
    wrap.setAttribute('data-cal-table-hidden', 'true');
  }
  const sum = containerEl ? containerEl.querySelector('#cal-query-summary') : null;
  if (sum) {
    sum.style.display = 'none';
    sum.textContent = '';
  }
  const warn = containerEl ? containerEl.querySelector('#cal-query-warnings') : null;
  if (warn) {
    warn.style.display = 'none';
    warn.textContent = '';
  }
}

function invalidateCalendarQuery() {
  calendarFilter.queried = false;
  calendarFilter.warnings = [];
  clearCalendarResultDom();
  updateCalendarQueryChrome();
}

function updateCalendarQueryChrome() {
  if (!containerEl) return;
  const hasBudget = Boolean(calendarFilter.selectedBudgetName);
  const secondary = containerEl.querySelector('#cal-secondary-filters');
  if (secondary) secondary.style.display = hasBudget ? '' : 'none';

  const addInt = containerEl.querySelector('#btn-add-interval');
  const delInt = containerEl.querySelector('#btn-del-interval');
  const showIntervalOps = hasBudget && calendarFilter.queried;
  [addInt, delInt].forEach(btn => {
    if (!btn) return;
    btn.style.display = showIntervalOps ? '' : 'none';
    btn.disabled = !showIntervalOps;
  });
}

function populateCalendarBudgetGroupSelect(selected = '') {
  const sel = containerEl.querySelector('#cal-filter-budget-group');
  if (!sel) return;
  const names = getDistinctValidBudgetNames(getBudgets());
  const dups = names.filter(n => getDuplicateBudgetNameYears(getBudgets(), n).length > 0);
  if (dups.length) {
    console.warn('[行事曆] 同年度同名預算單位異常：', dups);
  }

  sel.innerHTML = '';
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = '請選擇預算單位';
  sel.appendChild(ph);
  names.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
  if (selected && names.includes(selected)) sel.value = selected;
  else sel.value = '';
}

function populateCalendarYearSelect(selected = '') {
  const sel = containerEl.querySelector('#cal-filter-year');
  if (!sel) return;
  sel.innerHTML = '';

  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = '請選擇學年度';
  sel.appendChild(ph);

  const years = getYearsForBudgetName(getBudgets(), calendarFilter.selectedBudgetName);
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    sel.appendChild(opt);
  });

  // 不自動選最新；僅在 selected 有效時套用
  if (selected && years.includes(selected)) sel.value = selected;
  else sel.value = '';
}

function initDefaultCalendarFilter() {
  calendarFilter = {
    selectedBudgetName: '',
    mode: 'academicYear',
    academicYear: '',
    startDate: '',
    endDate: '',
    queried: false,
    warnings: []
  };

  populateCalendarBudgetGroupSelect('');
  const modeSel = containerEl.querySelector('#cal-filter-mode');
  if (modeSel) modeSel.value = 'academicYear';
  populateCalendarYearSelect('');
  updateFilterUI();
  updateCalendarQueryChrome();
}

function updateFilterUI() {
  const modeSel = containerEl.querySelector('#cal-filter-mode');
  const yearField = containerEl.querySelector('#cal-year-field');
  const dateRangeDiv = containerEl.querySelector('#cal-filter-date-range');
  if (!modeSel || !yearField || !dateRangeDiv) return;

  if (modeSel.value === 'academicYear') {
    yearField.style.display = '';
    dateRangeDiv.style.display = 'none';
  } else {
    yearField.style.display = 'none';
    dateRangeDiv.style.display = 'flex';
  }
}

function setupCalendarFilterEvents() {
  const budgetSel = containerEl.querySelector('#cal-filter-budget-group');
  const modeSel = containerEl.querySelector('#cal-filter-mode');
  const yearSel = containerEl.querySelector('#cal-filter-year');
  const queryBtn = containerEl.querySelector('#cal-filter-query');
  const startEl = containerEl.querySelector('#cal-filter-start');
  const endEl = containerEl.querySelector('#cal-filter-end');

  if (budgetSel) {
    budgetSel.addEventListener('change', () => {
      calendarFilter.selectedBudgetName = budgetSel.value || '';
      calendarFilter.academicYear = '';
      calendarFilter.startDate = '';
      calendarFilter.endDate = '';
      if (startEl) startEl.value = '';
      if (endEl) endEl.value = '';
      populateCalendarYearSelect('');
      invalidateCalendarQuery();
      updateFilterUI();
    });
  }

  if (modeSel) {
    modeSel.addEventListener('change', () => {
      calendarFilter.mode = modeSel.value;
      invalidateCalendarQuery();
      updateFilterUI();
    });
  }

  if (yearSel) {
    yearSel.addEventListener('change', () => {
      invalidateCalendarQuery();
    });
  }
  if (startEl) startEl.addEventListener('change', () => invalidateCalendarQuery());
  if (endEl) endEl.addEventListener('change', () => invalidateCalendarQuery());

  if (queryBtn) {
    queryBtn.addEventListener('click', handleCalendarFilterQuery);
  }

  updateFilterUI();
}

function handleCalendarFilterQuery() {
  const modeSel = containerEl.querySelector('#cal-filter-mode');
  const yearSel = containerEl.querySelector('#cal-filter-year');
  const startEl = containerEl.querySelector('#cal-filter-start');
  const endEl = containerEl.querySelector('#cal-filter-end');
  const budgetName = calendarFilter.selectedBudgetName ||
    (containerEl.querySelector('#cal-filter-budget-group')?.value || '');

  if (!budgetName) {
    showToast('請先選擇預算單位', 'error');
    return;
  }
  if (!modeSel) return;

  calendarFilter.selectedBudgetName = budgetName;
  calendarFilter.mode = modeSel.value;
  calendarFilter.warnings = [];

  if (calendarFilter.mode === 'academicYear') {
    calendarFilter.academicYear = yearSel ? yearSel.value : '';
    calendarFilter.startDate = '';
    calendarFilter.endDate = '';
    if (!calendarFilter.academicYear) {
      showToast('請選擇學年度', 'error');
      calendarFilter.queried = false;
      updateCalendarQueryChrome();
      return;
    }
    const resolved = resolveBudgetForNameAndYear(getBudgets(), budgetName, calendarFilter.academicYear);
    if (!resolved.ok) {
      if (resolved.error === 'duplicate_year_group') {
        showToast('此學年度存在重複預算單位資料，請先修正預算設定', 'error');
      } else {
        showToast('所選學年度沒有此預算單位', 'error');
      }
      calendarFilter.queried = false;
      clearCalendarResultDom();
      updateCalendarQueryChrome();
      return;
    }
  } else {
    const sRaw = startEl ? startEl.value.trim() : '';
    const eRaw = endEl ? endEl.value.trim() : '';
    const start = normalizeDateInput(sRaw);
    const end = normalizeDateInput(eRaw);
    if (!start || !end) {
      showToast('請輸入有效的日期區間', 'error');
      return;
    }
    if (start > end) {
      showToast('起始日期不可大於結束日期', 'error');
      return;
    }
    calendarFilter.startDate = start;
    calendarFilter.endDate = end;
    calendarFilter.academicYear = '';
  }

  calendarFilter.queried = true;
  updateCalendarQueryChrome();
  renderCalendarTable();
}

function getFilteredData() {
  if (!calendarFilter.queried || !calendarFilter.selectedBudgetName) {
    return { periods: [], rows: [], holidays: [], warnings: [] };
  }

  let periods = getCalendarPeriods();
  let holidays = getCalendarHolidays();
  const f = calendarFilter;
  const budgets = getBudgets();

  let scopeOpts = {};
  if (f.mode === 'academicYear' && f.academicYear) {
    periods = periods.filter(p => inferAcademicYearFromDate(p.date) === f.academicYear);
    holidays = holidays.filter(h => inferAcademicYearFromDate(h.date) === f.academicYear);
    scopeOpts = { academicYear: f.academicYear };
  } else if (f.mode === 'dateRange' && f.startDate && f.endDate) {
    const s = f.startDate;
    const e = f.endDate;
    periods = periods.filter(p => p.date >= s && p.date <= e);
    holidays = holidays.filter(h => h.date >= s && h.date <= e);
    scopeOpts = { startDate: s, endDate: e };
  } else {
    return { periods: [], rows: [], holidays: [], warnings: [] };
  }

  const scoped = filterCalendarRowsByBudgetScope(getCalendarRows(), budgets, f.selectedBudgetName, scopeOpts);
  return { periods, rows: scoped.rows, holidays, warnings: scoped.warnings || [] };
}

function renderCalendarSummary(warnings = []) {
  const sum = containerEl.querySelector('#cal-query-summary');
  const warnEl = containerEl.querySelector('#cal-query-warnings');
  if (sum) {
    const name = calendarFilter.selectedBudgetName || '';
    let text = '';
    if (calendarFilter.mode === 'academicYear') {
      text = `預算單位：${name}｜學年度：${calendarFilter.academicYear || ''}`;
    } else {
      text = `預算單位：${name}｜日期：${formatDateForDisplay(calendarFilter.startDate)}～${formatDateForDisplay(calendarFilter.endDate)}`;
    }
    sum.style.display = 'block';
    sum.textContent = text;
  }
  if (warnEl) {
    if (warnings && warnings.length) {
      warnEl.style.display = 'block';
      warnEl.textContent = warnings.join('；');
    } else {
      warnEl.style.display = 'none';
      warnEl.textContent = '';
    }
  }
}

// ===== RENDER CALENDAR TABLE (with grouping) =====
export function renderCalendarTable() {
  if (!containerEl) return;
  const tbody = containerEl.querySelector('#calendar-tbody');
  if (!tbody) return;

  if (!calendarFilter.queried) {
    clearCalendarResultDom();
    updateCalendarQueryChrome();
    return;
  }

  const wrap = containerEl.querySelector('#calendar-table-wrap');
  if (wrap) {
    wrap.style.display = '';
    wrap.setAttribute('data-cal-table-hidden', 'false');
  }

  const { periods, rows, holidays, warnings } = getFilteredData();
  calendarFilter.warnings = warnings || [];
  renderCalendarSummary(calendarFilter.warnings);

  // unit color map (from units settings, not from rows)
  const unitsForColor = getUnits();
  const unitColorMap = new Map(unitsForColor.map(u => [u.unitCode, u.colorKey || 'default']));

  function getColorHex(key) {
    const map = {
      default: '#212529',
      blue: '#0d6efd',
      green: '#198754',
      orange: '#fd7e14',
      purple: '#6f42c1',
      red: '#dc3545',
      gray: '#6c757d'
    };
    return map[key] || map.default;
  }

  tbody.innerHTML = '';

  if (periods.length === 0 && rows.length === 0 && holidays.length === 0) {
    const msg = (calendarFilter.mode === 'academicYear' && calendarFilter.academicYear)
      ? `尚無 ${calendarFilter.academicYear} 學年度的行事曆資料。`
      : '尚無符合查詢條件的行事曆資料。';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="9" style="text-align:center;color:#888">${msg}</td>`;
    tbody.appendChild(tr);
    return;
  }

  // 備註來源：以 sourceHourSettingId 對應時數設定 note（不改 calendar schema）
  const hourNoteById = new Map(
    (getHourSettings() || []).map(h => [String(h.id || ''), String(h.note || '')])
  );

  // 依日期分組
  const rowMap = new Map();
  rows.forEach(row => {
    if (!rowMap.has(row.date)) rowMap.set(row.date, []);
    rowMap.get(row.date).push(row);
  });

  const periodMap = new Map();
  periods.forEach(period => {
    periodMap.set(period.date, period);
  });

  const holidayMap = new Map();
  holidays.forEach(h => {
    holidayMap.set(h.date, h);
  });

  const allDates = [...new Set([
    ...periods.map(p => p.date),
    ...rows.map(r => r.date),
    ...holidays.map(h => h.date)
  ])].sort((a, b) => a.localeCompare(b));

  allDates.forEach(date => {
    const period = periodMap.get(date);
    const holiday = holidayMap.get(date);

    // 假日優先覆蓋：顯示假日，不顯示作息、不顯示「尚未套用」
    if (holiday) {
      const tr = document.createElement('tr');
      tr.classList.add('holiday-row');
      tr.innerHTML = `
        <td>${formatDateForDisplay(date)}</td>
        <td></td>
        <td>${escapeHtml(period ? period.weekday : getWeekdayFromDate(date))}</td>
        <td colspan="6" style="color:#c00;font-weight:500;">${escapeHtml(holiday.name)}　假日，不計算上班時間</td>
      `;
      tbody.appendChild(tr);
      return;
    }

    const dayRows = rowMap.get(date) || [];

    dayRows.sort((a, b) => {
      if (a.scheduleType !== b.scheduleType) return a.scheduleType.localeCompare(b.scheduleType);
      if (a.unitName !== b.unitName) return String(a.unitName || '').localeCompare(String(b.unitName || ''), 'zh-Hant');
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      if (a.endTime !== b.endTime) return a.endTime.localeCompare(b.endTime);
      return 0;
    });

    // 有週期但尚未套用作息
    if (dayRows.length === 0) {
      const tr = document.createElement('tr');
      tr.classList.add('period-only-row');
      tr.innerHTML = `
        <td>${formatDateForDisplay(date)}</td>
        <td></td>
        <td>${escapeHtml(period ? period.weekday : getWeekdayFromDate(date))}</td>
        <td colspan="6" style="color:#888">尚未套用作息區間</td>
      `;
      tbody.appendChild(tr);
      return;
    }

    let firstRowOfDate = true;
    let prevScheduleType = '';
    dayRows.forEach(row => {
      const isFirstOfSchedule = row.scheduleType !== prevScheduleType;
      if (isFirstOfSchedule) {
        prevScheduleType = row.scheduleType;
      }

      const tr = document.createElement('tr');
      if (!firstRowOfDate) tr.classList.add('grouped-row');

      const dateDisp = firstRowOfDate ? formatDateForDisplay(row.date) : '';
      const yearDisp = firstRowOfDate ? row.academicYear : '';
      const wdDisp = firstRowOfDate ? (row.weekday || (period ? period.weekday : getWeekdayFromDate(row.date))) : '';
      const scheduleDisp = isFirstOfSchedule ? escapeHtml(row.scheduleType) : '';
      const unitDisp = escapeHtml(row.unitName);
      const timeDisp = `${row.startTime}~${row.endTime}`;
      const sourceId = String(row.sourceHourSettingId || '');
      const noteDisp = sourceId && hourNoteById.has(sourceId)
        ? escapeHtml(hourNoteById.get(sourceId) || '')
        : '';

      const colorKey = unitColorMap.get(row.unitCode) || 'default';
      const color = getColorHex(colorKey);

      tr.innerHTML = `
        <td>${dateDisp}</td>
        <td>${yearDisp}</td>
        <td>${escapeHtml(wdDisp)}</td>
        <td>${scheduleDisp}</td>
        <td class="calendar-unit-cell"><span class="calendar-unit-name" style="color:${color};">${unitDisp}</span></td>
        <td>${timeDisp}</td>
        <td style="text-align:right">${row.hours}</td>
        <td style="text-align:right">${row.hourlyWage}</td>
        <td>${noteDisp}</td>
      `;
      tbody.appendChild(tr);

      firstRowOfDate = false;
    });
  });
}

// ===== PERIOD MODAL =====
function showPeriodModal(mode) {
  periodModalMode = mode;
  const modal = containerEl.querySelector('#period-modal');
  const title = containerEl.querySelector('#period-modal-title');
  const confirmBtn = containerEl.querySelector('#period-confirm-btn');
  const help = containerEl.querySelector('#period-help');

  title.textContent = mode === 'add' ? '新增週期' : '刪除週期';
  confirmBtn.textContent = mode === 'add' ? '儲存' : '確定';
  help.textContent = mode === 'add'
    ? '依日期區間建立每日紀錄（只建立日期與星期）。'
    : '將刪除該區間內所有日期與其作息資料。';

  // clear inputs
  containerEl.querySelector('#period-start').value = '';
  containerEl.querySelector('#period-end').value = '';

  modal.style.display = 'flex';
}

function hidePeriodModal() {
  containerEl.querySelector('#period-modal').style.display = 'none';
}

async function handlePeriodConfirm() {
  const startRaw = containerEl.querySelector('#period-start').value.trim();
  const endRaw = containerEl.querySelector('#period-end').value.trim();

  const start = normalizeDateInput(startRaw);
  const end = normalizeDateInput(endRaw);

  if (!isValidDate(start) || !isValidDate(end)) {
    showToast('日期格式錯誤，請使用 yyyy/mm/dd 或 yyyy-mm-dd', 'error');
    return;
  }
  if (start > end) {
    showToast('起始日期不可大於結束日期', 'error');
    return;
  }

  if (periodModalMode === 'add') {
    // 展開並新增 period
    const dates = getDatesInRange(start, end);
    let addedCount = 0;

    let results; try { results=await runWithMutationUiLock(containerEl.querySelector('#period-confirm-btn'),()=>Promise.all(dates.map(d => {
      const wd = getWeekdayFromDate(d); return addCalendarPeriod({ date: d, weekday: wd });
    })),{blocking:true}); } catch { return; }
    addedCount = results.filter(Boolean).length;

    showToast(`新增完成（新增 ${addedCount} 天，重複者已略過）`);
  } else {
    // delete
    if (!confirm(`確定刪除 ${start} ~ ${end} 區間的週期及所有作息資料？`)) {
      return;
    }
    try { await runWithMutationUiLock(containerEl.querySelector('#period-confirm-btn'),()=>deleteCalendarPeriodsByDateRange(start, end),{blocking:true}); } catch { return; }
    showToast('刪除週期完成');
  }

  hidePeriodModal();
  renderCalendarTable();
}

// ===== INTERVAL MODAL =====
function showIntervalModal(mode) {
  if (!calendarFilter.queried || !calendarFilter.selectedBudgetName) {
    showToast('請先選擇預算單位並完成查詢', 'error');
    return;
  }

  intervalModalMode = mode;
  const modal = containerEl.querySelector('#interval-modal');
  const title = containerEl.querySelector('#interval-modal-title');
  const confirmBtn = containerEl.querySelector('#int-confirm-btn');

  title.textContent = mode === 'add' ? '新增作息區間' : '刪除作息區間';
  confirmBtn.textContent = mode === 'add' ? '儲存' : '確定';

  // reset
  containerEl.querySelector('#int-start').value = '';
  containerEl.querySelector('#int-end').value = '';
  containerEl.querySelector('#int-hourly-wage').value = '';
  containerEl.querySelector('#int-hourly-wage-group').style.display = mode === 'add' ? '' : 'none';

  selectedSourceIdsForDelete.clear();
  selectedIntervalScheduleTypes.clear();
  selectedIntervalUnitCodes.clear();
  populateAcademicYearsForInterval();
  populateScheduleTypeButtonsForInterval(true);
  populateUnitButtonsForInterval(true);
  updateIntervalYearGuidance();
  updateIntervalPreview();

  modal.style.display = 'flex';
}

function hideIntervalModal() {
  containerEl.querySelector('#interval-modal').style.display = 'none';
}

function updateIntervalYearGuidance() {
  const warning = containerEl.querySelector('#int-wage-year-warning');
  const rangeHint = containerEl.querySelector('#int-academic-year-range-hint');
  const academicYear = containerEl.querySelector('#int-academicYear').value;
  const isAddMode = intervalModalMode === 'add';
  if (warning) {
    warning.textContent = isAddMode ? CALENDAR_WAGE_YEAR_WARNING : '';
    warning.style.display = isAddMode ? '' : 'none';
  }
  if (rangeHint) {
    rangeHint.textContent = isAddMode ? getAcademicYearRangeHint(academicYear) : '';
    rangeHint.style.display = isAddMode && academicYear ? '' : 'none';
  }
}

function populateAcademicYearsForInterval() {
  const sel = containerEl.querySelector('#int-academicYear');
  sel.innerHTML = '<option value="">請選擇</option>';

  // 只列出所選 budgetName 存在的有效年度，且與目前查詢條件有交集
  const name = calendarFilter.selectedBudgetName;
  let years = getYearsForBudgetName(getBudgets(), name);

  if (calendarFilter.mode === 'academicYear' && calendarFilter.academicYear) {
    years = years.filter(y => y === calendarFilter.academicYear);
  } else if (calendarFilter.mode === 'dateRange' && calendarFilter.startDate && calendarFilter.endDate) {
    // 依區間涉及學年度過濾
    const involved = new Set();
    let d = calendarFilter.startDate;
    let guard = 0;
    while (d && d <= calendarFilter.endDate && guard < 800) {
      const ay = inferAcademicYearFromDate(d);
      if (ay) involved.add(ay);
      // next day
      const dt = new Date(d + 'T00:00:00');
      dt.setDate(dt.getDate() + 1);
      d = dt.toISOString().slice(0, 10);
      guard += 1;
    }
    years = years.filter(y => involved.has(y));
  }

  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    sel.appendChild(opt);
  });

  // 預設帶入目前查詢學年度（若有效）
  if (calendarFilter.mode === 'academicYear' && years.includes(calendarFilter.academicYear)) {
    sel.value = calendarFilter.academicYear;
  } else if (years.length === 1) {
    sel.value = years[0];
  }
}

function populateScheduleTypeButtonsForInterval(reset = false) {
  const ay = containerEl.querySelector('#int-academicYear').value;
  const wrap = containerEl.querySelector('#int-scheduleType-buttons');
  if (!wrap) return;
  wrap.innerHTML = '';

  if (reset) selectedIntervalScheduleTypes.clear();

  if (!ay) {
    wrap.innerHTML = '<span style="color:#666;font-size:14px;">請先選擇學年度</span>';
    return;
  }

  const types = getScheduleTypesByYear(ay);
  if (types.length === 0) {
    wrap.innerHTML = '<span style="color:#666;font-size:14px;">此學年度沒有作息類型</span>';
    return;
  }

  selectedIntervalScheduleTypes = new Set(
    Array.from(selectedIntervalScheduleTypes).filter(t => types.includes(t))
  );

  types.forEach(t => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'weekday-btn';
    btn.textContent = t;
    btn.dataset.value = t;
    if (selectedIntervalScheduleTypes.has(t)) btn.classList.add('active');
    btn.addEventListener('click', () => {
      if (selectedIntervalScheduleTypes.has(t)) {
        selectedIntervalScheduleTypes.delete(t);
      } else {
        selectedIntervalScheduleTypes.add(t);
      }
      selectedSourceIdsForDelete.clear();
      btn.classList.toggle('active', selectedIntervalScheduleTypes.has(t));
      populateUnitButtonsForInterval(false);
      updateIntervalPreview();
    });
    wrap.appendChild(btn);
  });
}

function populateUnitButtonsForInterval(reset = false) {
  const ay = containerEl.querySelector('#int-academicYear').value;
  const wrap = containerEl.querySelector('#int-unit-buttons');
  if (!wrap) return;
  wrap.innerHTML = '';

  if (reset) selectedIntervalUnitCodes.clear();

  if (!ay) {
    wrap.innerHTML = '<span style="color:#666;font-size:14px;">請先選擇學年度</span>';
    return;
  }

  const selectedTypes = getSelectedIntervalScheduleTypes();
  if (selectedTypes.length === 0) {
    selectedIntervalUnitCodes.clear();
    wrap.innerHTML = '<span style="color:#666;font-size:14px;">請先選擇作息類型</span>';
    return;
  }

  // 預算群組 unitCodes 限制（各年度自己的 scope）
  const allowed = getAllowedUnitCodesForBudgetNameYear(
    getBudgets(),
    calendarFilter.selectedBudgetName,
    ay
  );
  if (!allowed.ok) {
    selectedIntervalUnitCodes.clear();
    wrap.innerHTML = '<span style="color:#c00;font-size:14px;">此學年度沒有有效預算單位或資料異常</span>';
    return;
  }
  const allowedSet = new Set(allowed.unitCodes);

  const map = new Map();
  selectedTypes.forEach(type => {
    getUnitsByYearAndType(ay, type).forEach(u => {
      if (!allowedSet.has(u.unitCode)) return;
      if (!map.has(u.unitCode)) {
        map.set(u.unitCode, u);
      }
    });
  });

  // 也允許預算群組內、且存在於 master、並有 hour setting 的代碼順序依 budget.unitCodes
  const master = getUnits();
  const masterMap = new Map(master.map(u => [u.unitCode, u]));
  const ordered = [];
  allowed.unitCodes.forEach(code => {
    if (map.has(code)) ordered.push(map.get(code));
  });
  // 補充 map 中其餘（理論上應已覆蓋）
  map.forEach((u, code) => {
    if (!ordered.some(x => x.unitCode === code)) ordered.push(u);
  });

  selectedIntervalUnitCodes = new Set(
    Array.from(selectedIntervalUnitCodes).filter(code => map.has(code))
  );

  if (ordered.length === 0) {
    wrap.innerHTML = '<span style="color:#666;font-size:14px;">找不到符合所選作息類型且屬於本預算單位的實際單位</span>';
    return;
  }

  ordered.forEach(u => {
    const latest = masterMap.get(u.unitCode) || u;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'weekday-btn';
    btn.textContent = `${latest.unitCode} - ${latest.unitName}`;
    btn.dataset.value = latest.unitCode;
    if (selectedIntervalUnitCodes.has(latest.unitCode)) btn.classList.add('active');
    btn.addEventListener('click', () => {
      if (selectedIntervalUnitCodes.has(latest.unitCode)) {
        selectedIntervalUnitCodes.delete(latest.unitCode);
      } else {
        selectedIntervalUnitCodes.add(latest.unitCode);
      }
      selectedSourceIdsForDelete.clear();
      btn.classList.toggle('active', selectedIntervalUnitCodes.has(latest.unitCode));
      updateIntervalPreview();
    });
    wrap.appendChild(btn);
  });
}

function getSelectedIntervalScheduleTypes() {
  return Array.from(selectedIntervalScheduleTypes);
}

function getSelectedIntervalUnitCodes() {
  return Array.from(selectedIntervalUnitCodes);
}

function getIntervalHourSettingMatches(academicYear, scheduleTypes, unitCodes) {
  const typeSet = new Set(scheduleTypes);
  const unitSet = new Set(unitCodes);
  // 雙重保險：再以預算群組 scope 過濾
  const allowed = getAllowedUnitCodesForBudgetNameYear(
    getBudgets(),
    calendarFilter.selectedBudgetName,
    academicYear
  );
  const scopeSet = allowed.ok ? new Set(allowed.unitCodes) : new Set();
  return getHourSettings().filter(h =>
    h.academicYear === academicYear &&
    typeSet.has(h.scheduleType) &&
    unitSet.has(h.unitCode) &&
    scopeSet.has(h.unitCode)
  );
}

function updateIntervalPreview() {
  const previewEl = containerEl.querySelector('#int-preview');
  const ay = containerEl.querySelector('#int-academicYear').value;
  const scheduleTypes = getSelectedIntervalScheduleTypes();
  const unitCodes = getSelectedIntervalUnitCodes();
  const wageInput = containerEl.querySelector('#int-hourly-wage').value;

  previewEl.innerHTML = '';

  if (intervalModalMode === 'add') {
    const wageSummary = document.createElement('div');
    wageSummary.id = 'int-preview-wage';
    wageSummary.className = 'calendar-wage-preview';
    wageSummary.textContent = getCalendarWagePreviewText(wageInput);
    previewEl.appendChild(wageSummary);
  }

  const appendPreviewMessage = (message, color = '#666') => {
    const div = document.createElement('div');
    div.style.color = color;
    div.textContent = message;
    previewEl.appendChild(div);
  };

  if (!ay) {
    appendPreviewMessage('請選擇學年度');
    return;
  }

  if (scheduleTypes.length === 0) {
    appendPreviewMessage('請至少選擇一個作息類型');
    return;
  }

  if (unitCodes.length === 0) {
    appendPreviewMessage('請至少選擇一個單位');
    return;
  }

  const matches = getIntervalHourSettingMatches(ay, scheduleTypes, unitCodes);

  if (matches.length === 0) {
    appendPreviewMessage('找不到符合的時數設定', '#c00');
    return;
  }

  const ul = document.createElement('div');
  ul.className = 'preview-list';

  const isDeleteMode = intervalModalMode === 'delete';

  matches.forEach(m => {
    const div = document.createElement('div');
    div.className = 'preview-item';

    const content = `
      <div><strong>作息類型：</strong>${m.scheduleType}</div>
      <div><strong>單位：</strong>${m.unitCode} - ${m.unitName}</div>
      <div><strong>週期類型：</strong>${m.weekdays.replace(/\|/g, '、')}</div>
      <div><strong>開館時間：</strong>${m.startTime}~${m.endTime}</div>
      <div><strong>時數：</strong>${m.hours}</div>
      <div style="font-size:14px;color:#666">來源設定 ID: ${m.id}</div>
    `;

    if (isDeleteMode) {
      const checked = selectedSourceIdsForDelete.has(m.id) ? 'checked' : '';
      div.innerHTML = `
        <label style="display:block; cursor:pointer; margin:0;">
          <input type="checkbox" class="del-source-cb" data-id="${m.id}" ${checked}>
          ${content}
        </label>
      `;
      const cb = div.querySelector('input.del-source-cb');
      cb.addEventListener('change', () => {
        if (cb.checked) {
          selectedSourceIdsForDelete.add(m.id);
        } else {
          selectedSourceIdsForDelete.delete(m.id);
        }
      });
    } else {
      div.innerHTML = content;
    }

    ul.appendChild(div);
  });

  previewEl.appendChild(ul);
}

async function handleIntervalConfirm() {
  const startRaw = containerEl.querySelector('#int-start').value.trim();
  const endRaw = containerEl.querySelector('#int-end').value.trim();
  const ay = containerEl.querySelector('#int-academicYear').value;
  const scheduleTypes = getSelectedIntervalScheduleTypes();
  const unitCodes = getSelectedIntervalUnitCodes();
  const wageInput = containerEl.querySelector('#int-hourly-wage').value;

  const start = normalizeDateInput(startRaw);
  const end = normalizeDateInput(endRaw);

  if (!isValidDate(start) || !isValidDate(end) || start > end) {
    showToast('日期區間錯誤', 'error');
    return;
  }
  if (!ay) {
    showToast('請選擇學年度', 'error');
    return;
  }
  const rangeValidation = validateCalendarIntervalRange(start, end, ay);
  if (!rangeValidation.ok) {
    showToast(rangeValidation.error, 'error');
    return;
  }

  if (scheduleTypes.length === 0) {
    showToast('請至少選擇一個作息類型', 'error');
    return;
  }

  if (unitCodes.length === 0) {
    showToast('請至少選擇一個單位', 'error');
    return;
  }

  const matches = getIntervalHourSettingMatches(ay, scheduleTypes, unitCodes);

  if (matches.length === 0) {
    showToast('找不到符合的時數設定', 'error');
    return;
  }

  const dates = getDatesInRange(start, end);

  if (intervalModalMode === 'add') {
    const wageValidation = validateIntervalHourlyWage(wageInput);
    if (!wageValidation.ok) {
      showToast(wageValidation.error, 'error');
      return;
    }
    const intervalHourlyWage = wageValidation.hourlyWage;
    // 自動建立缺少的 period
    const rowsToAdd = [];
    let skippedHolidayCount = 0;

    dates.forEach(d => {
      if (findCalendarHolidayByDate(d)) {
        skippedHolidayCount++;
        return;
      }
      const wd = getWeekdayFromDate(d);
      matches.forEach(match => {
        // 判斷該日期的星期是否在此設定內
        const wdList = match.weekdays.split('|');
        if (!wdList.includes(wd)) return;

        rowsToAdd.push(buildCalendarRowFromHourSetting({
          date: d,
          academicYear: ay,
          weekday: wd,
          match,
          hourlyWage: intervalHourlyWage
        }));
      });
    });

    let batch; try { batch=await runWithMutationUiLock(containerEl.querySelector('#int-confirm-btn'),()=>saveCalendarPeriodRowsBatch(dates.map(d=>({date:d,weekday:getWeekdayFromDate(d)})),rowsToAdd),{blocking:true}); } catch { return; }
    const added = batch.addedRecords || [];
    let msg = `作息區間新增完成（新增 ${added.length} 筆）`;
    if (skippedHolidayCount > 0) {
      msg += `，已略過 ${skippedHolidayCount} 個假日日期`;
    }
    showToast(msg);
  } else {
    // 刪除作息區間（只刪 rows）
    if (!confirm('確定刪除此條件範圍內的作息區間資料？（日期週期不會被刪除）')) return;

    if (selectedSourceIdsForDelete.size === 0) {
      showToast('請至少勾選一筆來源時數設定', 'error');
      return;
    }

    const idsToDelete = Array.from(selectedSourceIdsForDelete);
    try { await runWithMutationUiLock(containerEl.querySelector('#int-confirm-btn'),()=>deleteCalendarRowsByScope({selectedBudgetName:calendarFilter.selectedBudgetName,startDate:start,endDate:end,academicYear:ay,sourceHourSettingIds:idsToDelete}),{blocking:true}); } catch { return; }

    showToast(`作息區間刪除完成（已針對 ${idsToDelete.length} 筆設定）`);
    selectedSourceIdsForDelete.clear();
  }

  hideIntervalModal();
  renderCalendarTable();
}

// ===== HOLIDAY MODAL (minimal) =====
function showHolidayModal() {
  const modal = containerEl.querySelector('#holiday-modal');
  if (!modal) return;
  ensureHolidayNamesFromExistingCalendarHolidays();
  containerEl.querySelector('#holiday-date').value = '';
  const nameNew = containerEl.querySelector('#holiday-name-new');
  if (nameNew) nameNew.value = '';
  populateHolidayNameSelect();
  holidayModalTab = 'records';
  holidayCurrentPage = 1;
  // 確保 tabs 狀態正確
  updateHolidayTabsUI();
  modal.style.display = 'flex';
  renderHolidayListInModal();
}

function hideHolidayModal() {
  const modal = containerEl.querySelector('#holiday-modal');
  if (modal) modal.style.display = 'none';
}

function renderHolidayListInModal() {
  if (holidayModalTab === 'records') {
    renderHolidayRecordListInModal();
  } else {
    renderHolidayNameListInModal();
  }
}

function updateHolidayTabsUI() {
  const recordsBtn = containerEl.querySelector('#holiday-tab-records');
  const namesBtn = containerEl.querySelector('#holiday-tab-names');
  const addPanel = containerEl.querySelector('#holiday-name-add-panel');
  if (recordsBtn) recordsBtn.classList.toggle('active', holidayModalTab === 'records');
  if (namesBtn) namesBtn.classList.toggle('active', holidayModalTab === 'names');
  if (addPanel) addPanel.style.display = holidayModalTab === 'names' ? '' : 'none';
}

function populateHolidayNameSelect(selected = '') {
  const sel = containerEl.querySelector('#holiday-name');
  if (!sel) return;
  sel.innerHTML = '';

  const names = getHolidayNameOptionsFromCalendarHolidays();
  // 依名稱排序
  names.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hant'));

  // 第一個選項
  const placeholder = document.createElement('option');
  if (names.length === 0) {
    placeholder.textContent = '請先到「目前記錄的節日」新增節日';
    placeholder.value = '';
  } else {
    placeholder.textContent = '請選擇節日名稱';
    placeholder.value = '';
  }
  sel.appendChild(placeholder);

  names.forEach(n => {
    const opt = document.createElement('option');
    opt.value = n.name;
    opt.textContent = n.name;
    sel.appendChild(opt);
  });

  // 若 selected 存在
  if (selected) {
    const found = Array.from(sel.options).some(o => o.value === selected);
    if (!found) {
      // 臨時加入原值
      const temp = document.createElement('option');
      temp.value = selected;
      temp.textContent = `${selected}（未在節日清單）`;
      sel.appendChild(temp);
    }
    sel.value = selected;
  } else {
    sel.value = '';
  }
}

function renderHolidayRecordListInModal() {
  const listEl = containerEl.querySelector('#holiday-list');
  const pagEl = containerEl.querySelector('#holiday-pagination');
  if (!listEl || !pagEl) return;

  listEl.innerHTML = '';
  pagEl.innerHTML = '';

  let hs = getCalendarHolidays();
  // 日期降冪
  hs.sort((a, b) => b.date.localeCompare(a.date));

  const total = hs.length;
  if (total === 0) {
    const li = document.createElement('li');
    li.style.color = '#888';
    li.textContent = '目前無假日設定';
    listEl.appendChild(li);
    return;
  }

  const pageSize = HOLIDAY_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (holidayCurrentPage > totalPages) holidayCurrentPage = totalPages;
  if (holidayCurrentPage < 1) holidayCurrentPage = 1;

  const page = holidayCurrentPage;
  const start = (page - 1) * pageSize;
  const pageItems = hs.slice(start, start + pageSize);

  pageItems.forEach(h => {
    const li = document.createElement('li');
    li.style.marginBottom = '2px';
    li.innerHTML = `<span style="color:#151922;">${formatDateForDisplay(h.date)}</span> ${escapeHtml(h.name)} <span style="color:#c00; cursor:pointer; font-weight:bold;" data-id="${h.id}">×</span>`;
    const delSpan = li.querySelector('span[data-id]');
    delSpan.addEventListener('click', async () => {
      if (confirm(`確定刪除 ${formatDateForDisplay(h.date)}「${h.name}」的假日設定？`)) {
        try { await runWithMutationUiLock(delSpan,()=>deleteCalendarHoliday(h.id)); } catch { return; }
        renderHolidayListInModal();
        renderCalendarTable();
      }
    });
    listEl.appendChild(li);
  });

  renderPagination(pagEl, page, totalPages, (newPage) => {
    holidayCurrentPage = newPage;
    renderHolidayListInModal();
  });
}

function renderHolidayNameListInModal() {
  const listEl = containerEl.querySelector('#holiday-list');
  const pagEl = containerEl.querySelector('#holiday-pagination');
  if (!listEl || !pagEl) return;

  listEl.innerHTML = '';
  pagEl.innerHTML = '';

  let ns = getHolidayNames();
  // 名稱升冪排序
  ns.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hant'));

  const total = ns.length;
  if (total === 0) {
    const li = document.createElement('li');
    li.style.color = '#888';
    li.textContent = '目前無節日紀錄';
    listEl.appendChild(li);
    return;
  }

  const pageSize = HOLIDAY_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (holidayNameCurrentPage > totalPages) holidayNameCurrentPage = totalPages;
  if (holidayNameCurrentPage < 1) holidayNameCurrentPage = 1;

  const page = holidayNameCurrentPage;
  const start = (page - 1) * pageSize;
  const pageItems = ns.slice(start, start + pageSize);

  pageItems.forEach(n => {
    const li = document.createElement('li');
    li.style.marginBottom = '2px';
    li.innerHTML = `${escapeHtml(n.name)} <span style="color:#c00; cursor:pointer; font-weight:bold;" data-name="${n.name}" data-id="${n.id}">×</span>`;
    const delSpan = li.querySelector('span[data-id]');
    delSpan.addEventListener('click', async () => {
      const name = n.name;
      if (isHolidayNameUsed(name)) {
        showToast('此節日已被假日紀錄使用，請先移除相關假日設定再刪除', 'error');
        return;
      }
      if (confirm(`確定刪除節日名稱「${name}」？`)) {
        try { await runWithMutationUiLock(delSpan,()=>deleteHolidayName(n.id)); } catch { return; }
        // 刷新下拉與列表
        populateHolidayNameSelect();
        renderHolidayListInModal();
      }
    });
    listEl.appendChild(li);
  });

  renderPagination(pagEl, page, totalPages, (newPage) => {
    holidayNameCurrentPage = newPage;
    renderHolidayListInModal();
  });
}

async function handleHolidaySave() {
  const dateRaw = containerEl.querySelector('#holiday-date').value.trim();
  const dateVal = normalizeDateInput(dateRaw);
  const sel = containerEl.querySelector('#holiday-name');
  const name = sel ? sel.value.trim() : '';

  if (!dateVal || !name) {
    showToast('請填寫日期與節日名稱', 'error');
    return;
  }
  if (name === '' || name === '請選擇節日名稱' || name === '請先到「目前記錄的節日」新增節日') {
    showToast('請先新增並選擇節日名稱', 'error');
    return;
  }

  const existing = findCalendarHolidayByDate(dateVal);
  if (existing) {
    showToast('此日期已設定假日', 'error');
    return;
  }

  let saved; try { saved=await runWithMutationUiLock(containerEl.querySelector('#holiday-save-btn'),()=>saveCalendarHoliday({ date: dateVal, name })); } catch { return; }
  if (!saved) {
    showToast('此日期已設定假日', 'error');
    return;
  }

  showToast('假日設定已儲存');
  // 按儲存後不清空子視窗，切換到 records tab
  holidayCurrentPage = 1;
  holidayModalTab = 'records';
  updateHolidayTabsUI();
  containerEl.querySelector('#holiday-date').value = '';
  if (sel) sel.value = '';
  populateHolidayNameSelect('');
  renderHolidayListInModal();
  renderCalendarTable();
  // 不要 hideHolidayModal()
}

async function handleHolidayNameSave() {
  const input = containerEl.querySelector('#holiday-name-new');
  if (!input) return;
  const name = (input.value || '').trim();
  if (!name) {
    showToast('節日名稱不可空白', 'error');
    return;
  }
  try {
    await runWithMutationUiLock(containerEl.querySelector('#holiday-name-save-btn'),()=>saveHolidayName({ name }));
    showToast('節日已儲存');
    input.value = '';
    input.focus();
    populateHolidayNameSelect();
    holidayModalTab = 'names';
    holidayNameCurrentPage = 1;
    updateHolidayTabsUI();
    renderHolidayListInModal();
  } catch (e) {
    showToast(e.message || '儲存失敗', 'error');
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
