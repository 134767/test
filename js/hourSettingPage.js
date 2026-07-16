// js/hourSettingPage.js
import {
  getBudgets,
  getUnits,
  getHourSettings,
  saveHourSettingCombinations,
  saveHourSettingsBatch,
  deleteHourSettings,
  isHourSettingUsed,
  getScheduleTypes,
  saveScheduleType,
  deleteScheduleType,
  isScheduleTypeUsed
} from './dataStore.js?v=1.6.0-batch-search-style-hotfix-10';
import { formatNumber, showToast, formatTimeRange, getWeekdaysArray, arrayToWeekdays, renderPagination } from './utils.js?v=1.6.0-batch-search-style-hotfix-10';
import {
  buildHourSettingDuplicateKey,
  filterHourSettingsByBudget,
  findSameNameTargetBudget,
  getBatchSourceAcademicYears,
  getUniqueBudgetAcademicYears,
  planBatchHourCopy
} from './hourBatchUtils.js?v=1.6.0-batch-search-style-hotfix-10';
import {
  analyzeBudgetOptionsForYear,
  getValidBudgetsForYear,
  deriveHourBudgetUnit,
  findBudgetsByYearAndUnit,
  budgetOptionValue,
  findBudgetByOptionValue
} from './hourBudgetScopeUtils.js?v=1.6.0-batch-search-style-hotfix-10';
import { runWithMutationUiLock } from './mutationUi.js?v=1.6.0-batch-search-style-hotfix-10';
import { filterHourSettingsAdvanced } from './hourFilterUtils.js?v=1.6.0-batch-search-style-hotfix-10';

export {
  buildHourSettingDuplicateKey,
  getUniqueBudgetAcademicYears,
  getValidBudgetUnitCodesForYear,
  isUnitInTargetBudgetScope,
  planBatchHourCopy
} from './hourBatchUtils.js?v=1.6.0-batch-search-style-hotfix-10';

export {
  getValidBudgetsForYear,
  findBudgetsByYearAndUnit,
  resolveBudgetForNameAndYear,
  getDistinctValidBudgetNames,
  filterCalendarRowsByBudgetScope
} from './hourBudgetScopeUtils.js?v=1.6.0-batch-search-style-hotfix-10';

let containerEl = null;
let currentEditingId = null;
const emptyHourFilters = () => ({ academicYear: '', budgetName: '', scheduleType: '', unitCode: '', keyword: '' });
let draftHourFilters = emptyHourFilters();
let appliedHourFilters = emptyHourFilters();
/** @type {string[]} ids currently previewed in batch modal */
let batchModalSelectedIds = [];
let batchModalMode = 'scope';
/** @type {'ok'|'none'|'multiple'|'empty_year'} */
let hourEditBudgetStatus = 'ok';
let hourEditBlockSave = false;
let selectedScheduleTypes = new Set();
let selectedUnitCodes = new Set();

const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

let stypeCurrentPage = 1;
const STYPE_PAGE_SIZE = 20;

export function initHourSettingPage(container) {
  containerEl = container;
  draftHourFilters = emptyHourFilters();
  appliedHourFilters = emptyHourFilters();
  container.innerHTML = `
    <div class="page-header">
      <h2>時數設定</h2>
      <div class="toolbar">
        <button id="btn-add-schedule-type" class="btn-primary">新增作息</button>
        <button id="btn-add-hour" class="btn-primary">新增時數</button>
        <button id="btn-batch-add-hour" class="btn-primary">批次新增</button>
        <button id="btn-delete-hour" class="btn-danger">刪除</button>
      </div>
    </div>
    <div class="query-panel hour-filter-panel">
      <div class="query-row">
        <div class="query-field"><label for="hour-filter-year">學年度</label><select id="hour-filter-year"></select></div>
        <div class="query-field"><label for="hour-filter-budget">預算單位</label><select id="hour-filter-budget"></select></div>
        <div class="query-field"><label for="hour-filter-schedule-type">作息類型</label><select id="hour-filter-schedule-type"></select></div>
        <div class="query-field"><label for="hour-filter-unit">單位</label><select id="hour-filter-unit"></select></div>
        <div class="query-field hour-filter-keyword-field"><label for="hour-filter-keyword">文字搜尋</label><input type="text" id="hour-filter-keyword" placeholder="搜尋週期／開館時間／備註或其他關鍵字"></div>
        <div class="query-actions"><button id="hour-filter-query" class="btn-primary">查詢</button></div>
      </div>
    </div>
    <div class="table-wrapper">
      <table class="data-table" id="hour-table">
        <thead>
          <tr>
            <th style="width:42px"><input type="checkbox" id="hour-all-check"></th>
            <th>學年度</th>
            <th>預算單位</th>
            <th>作息類型</th>
            <th>單位</th>
            <th>週期類型</th>
            <th>開館時間</th>
            <th style="text-align:right">時數</th>
            <th>備註</th>
            <th style="width:80px">操作</th>
          </tr>
        </thead>
        <tbody id="hour-tbody"></tbody>
      </table>
    </div>

    <div id="hour-modal" class="modal">
      <div class="modal-content modal-wide">
        <div class="modal-header">
          <h3 id="hour-modal-title">新增時數設定</h3>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>學年度 <span class="required">*</span></label>
              <select id="hour-academicYear"></select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex:1;">
              <label>單位 <span class="required">*</span></label>
              <select id="hour-budget-group"></select>
              <div id="hour-budget-group-hint" class="help-text" style="display:none;color:#c00;margin-top:4px;"></div>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>作息類型 <span class="required">*</span></label>
              <div id="hour-scheduleType" class="weekday-buttons hour-choice-buttons" role="group" aria-label="作息類型複選"></div>
            </div>
            <div class="form-group">
              <label>實際單位 <span class="required">*</span></label>
              <div id="hour-unit" class="weekday-buttons hour-choice-buttons" role="group" aria-label="實際單位複選"></div>
            </div>
          </div>

          <div class="form-group">
            <label>週期類型 <span class="required">*</span></label>
            <div id="hour-weekdays" class="weekday-buttons"></div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>開始時間</label>
              <input type="time" id="hour-startTime" value="08:00" class="time-input">
            </div>
            <div class="form-group">
              <label>結束時間</label>
              <input type="time" id="hour-endTime" value="21:30" class="time-input">
            </div>
            <div class="form-group">
              <label>時數 <span class="required">*</span></label>
              <input type="number" step="0.1" id="hour-hours" placeholder="34">
            </div>
          </div>

          <div class="form-group">
            <label>備註</label>
            <textarea id="hour-note" rows="2"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button id="hour-save-btn" class="btn-primary">儲存</button>
          <button id="hour-cancel-btn" class="btn-secondary">取消</button>
        </div>
      </div>
    </div>

    <!-- Schedule Type Modal (新增作息) -->
    <div id="schedule-type-modal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>新增作息</h3>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>作息類型 <span class="required">*</span></label>
            <input type="text" id="stype-name" placeholder="例如 開學期間">
          </div>
          <div style="font-size:14px; color:#666; margin-top:8px; border-top:1px solid #eee; padding-top:6px;">
            目前已設定作息：
            <div id="stype-list-container" class="paged-list-container">
              <ul id="stype-list" style="margin:2px 0 0; padding-left:18px; font-size:14px;"></ul>
            </div>
            <div id="stype-pagination" class="pagination"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="stype-save-btn" class="btn-primary">儲存</button>
          <button id="stype-cancel-btn" class="btn-secondary">退出</button>
        </div>
      </div>
    </div>

    <!-- Batch Add Hour Modal -->
    <div id="hour-batch-add-modal" class="modal">
      <div class="modal-content modal-wide hour-batch-modal">
        <div class="modal-header">
          <h3>批次新增時數設定</h3>
        </div>
        <div class="modal-body">
          <div class="form-row hour-batch-meta-row">
            <div class="form-group hour-batch-year-group">
              <label>來源學年度 <span class="required">*</span></label>
              <select id="hour-batch-source-year"><option value="">請選擇來源學年度</option></select>
            </div>
            <div class="form-group hour-batch-budget-group">
              <label>來源預算單位 <span class="required">*</span></label>
              <input id="hour-batch-source-budget-search" type="search" placeholder="搜尋來源預算單位">
              <select id="hour-batch-source-budget"><option value="">請選擇來源預算單位</option></select>
            </div>
          </div>
          <div class="form-row hour-batch-meta-row">
            <div class="form-group hour-batch-year-group">
              <label>目標學年度 <span class="required">*</span></label>
              <select id="hour-batch-target-year">
                <option value="">請選擇目標學年度</option>
              </select>
            </div>
            <div class="form-group hour-batch-budget-group">
              <label>目標預算單位 <span class="required">*</span></label>
              <select id="hour-batch-target-budget"><option value="">請選擇目標預算單位</option></select>
            </div>
          </div>
          <div class="help-text" style="margin-bottom:8px;">
            系統會將來源學年度／來源預算單位的時數設定，複製至指定的目標學年度／目標預算單位。僅複製目標預算單位仍包含的實際單位；來源資料不會被修改。
          </div>
          <div id="hour-batch-selected-count" class="hour-batch-selected-count">0 筆時數設定</div>
          <div id="hour-batch-plan-summary" class="hour-batch-plan-summary"></div>
          <div class="table-wrapper hour-batch-preview-wrap">
            <table class="data-table hour-batch-preview-table" id="hour-batch-preview-table">
              <thead>
                <tr>
                  <th>來源學年度</th>
                  <th>來源預算單位</th>
                  <th>作息類型</th>
                  <th>實際單位</th>
                  <th>週期類型</th>
                  <th>開館時間</th>
                  <th style="text-align:right">時數</th>
                  <th>備註</th>
                </tr>
              </thead>
              <tbody id="hour-batch-preview-tbody"></tbody>
            </table>
          </div>
          <div id="hour-batch-result" class="hour-batch-result" style="display:none;"></div>
        </div>
        <div class="modal-footer">
          <button id="hour-batch-confirm-btn" class="btn-primary">全部新增</button>
          <button id="hour-batch-cancel-btn" class="btn-secondary">取消</button>
        </div>
      </div>
    </div>
  `;

  bindHourEvents();
  refreshHourFilterOptions();
  renderHourTable();
  updateBatchAddButtonState();
}

function bindHourEvents() {
  const addBtn = containerEl.querySelector('#btn-add-hour');
  const batchBtn = containerEl.querySelector('#btn-batch-add-hour');
  const delBtn = containerEl.querySelector('#btn-delete-hour');
  const allCheck = containerEl.querySelector('#hour-all-check');

  bindHourFilterEvents();

  addBtn.addEventListener('click', () => showHourModal());
  if (batchBtn) batchBtn.addEventListener('click', () => showBatchAddHourModal());
  delBtn.addEventListener('click', handleDeleteSelected);

  const addStypeBtn = containerEl.querySelector('#btn-add-schedule-type');
  if (addStypeBtn) addStypeBtn.addEventListener('click', () => showScheduleTypeModal());

  allCheck.addEventListener('change', (e) => {
    const checked = e.target.checked;
    containerEl.querySelectorAll('#hour-tbody .row-check').forEach(b => { b.checked = checked; });
    updateBatchAddButtonState();
  });

  const saveBtn = containerEl.querySelector('#hour-save-btn');
  const cancelBtn = containerEl.querySelector('#hour-cancel-btn');
  const modal = containerEl.querySelector('#hour-modal');

  saveBtn.addEventListener('click', handleSaveHourSetting);
  cancelBtn.addEventListener('click', () => hideHourModal());

  modal.addEventListener('click', (e) => { if (e.target === modal) hideHourModal(); });

  // 學年度 → 預算單位 → 實際單位 連動
  const aySelect = containerEl.querySelector('#hour-academicYear');
  const budgetSel = containerEl.querySelector('#hour-budget-group');

  aySelect.addEventListener('change', () => {
    hourEditBudgetStatus = 'ok';
    hourEditBlockSave = false;
    setHourBudgetHint('');
    populateBudgetGroupSelect('');
    selectedUnitCodes.clear();
    renderActualUnitButtons();
  });

  if (budgetSel) {
    budgetSel.addEventListener('change', () => {
      hourEditBudgetStatus = 'ok';
      hourEditBlockSave = false;
      setHourBudgetHint('');
      selectedUnitCodes.clear();
      renderActualUnitButtons();
    });
  }

  // Schedule type modal bindings (背景點擊不關閉)
  const stSave = containerEl.querySelector('#stype-save-btn');
  const stCancel = containerEl.querySelector('#stype-cancel-btn');
  if (stSave) stSave.addEventListener('click', handleScheduleTypeSave);
  if (stCancel) stCancel.addEventListener('click', () => hideScheduleTypeModal());
  // 故意不綁定背景點擊關閉

  // Batch modal (背景點擊關閉，沿用 hour-modal 慣例)
  const batchModal = containerEl.querySelector('#hour-batch-add-modal');
  const batchConfirm = containerEl.querySelector('#hour-batch-confirm-btn');
  const batchCancel = containerEl.querySelector('#hour-batch-cancel-btn');
  if (batchConfirm) batchConfirm.addEventListener('click', () => handleBatchAddHourSettings());
  if (batchCancel) batchCancel.addEventListener('click', () => hideBatchAddHourModal());
  if (batchModal) {
    batchModal.addEventListener('click', (e) => {
      if (e.target === batchModal) hideBatchAddHourModal();
    });
  }
  const sourceYear = containerEl.querySelector('#hour-batch-source-year');
  const sourceSearch = containerEl.querySelector('#hour-batch-source-budget-search');
  const sourceBudget = containerEl.querySelector('#hour-batch-source-budget');
  const targetYear = containerEl.querySelector('#hour-batch-target-year');
  const targetBudget = containerEl.querySelector('#hour-batch-target-budget');
  if (sourceYear) sourceYear.addEventListener('change', () => {
    populateBatchSourceBudgetSelect('');
    rebuildBatchHourPreview({ autoTarget: true });
  });
  if (sourceSearch) sourceSearch.addEventListener('input', () => {
    const selected = sourceBudget?.value || '';
    populateBatchSourceBudgetSelect(selected);
    rebuildBatchHourPreview({ autoTarget: true });
  });
  if (sourceBudget) sourceBudget.addEventListener('change', () => rebuildBatchHourPreview({ autoTarget: true }));
  if (targetYear) targetYear.addEventListener('change', () => {
    populateBatchTargetBudgetSelect('', true);
    rebuildBatchPlanSummary();
  });
  if (targetBudget) targetBudget.addEventListener('change', rebuildBatchPlanSummary);
}

function setHourFilterOptions(select, placeholder, items, selected) {
  if (!select) return;
  select.replaceChildren();
  const first = document.createElement('option');
  first.value = '';
  first.textContent = placeholder;
  select.appendChild(first);
  items.forEach(item => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    select.appendChild(option);
  });
  if (selected && !items.some(item => item.value === selected)) {
    const retained = document.createElement('option');
    retained.value = selected;
    retained.textContent = selected;
    select.appendChild(retained);
  }
  select.value = selected || '';
}

function refreshHourFilterOptions() {
  if (!containerEl) return;
  const hours = getHourSettings();
  const budgets = getBudgets();
  const years = [...new Set(hours.map(row => String(row.academicYear || '').trim()).filter(Boolean))]
    .sort((a, b) => Number(b) - Number(a) || b.localeCompare(a, 'zh-Hant'));
  setHourFilterOptions(
    containerEl.querySelector('#hour-filter-year'),
    '全部學年度',
    years.map(value => ({ value, label: value })),
    draftHourFilters.academicYear
  );

  const yearRows = filterHourSettingsAdvanced({
    hourSettings: hours,
    budgets,
    academicYear: draftHourFilters.academicYear
  });
  const budgetNames = [...new Set(yearRows.map(row => deriveHourBudgetUnit(budgets, row.academicYear, row.unitCode).label))]
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  setHourFilterOptions(
    containerEl.querySelector('#hour-filter-budget'),
    '全部預算單位',
    budgetNames.map(value => ({ value, label: value })),
    draftHourFilters.budgetName
  );

  const budgetRows = filterHourSettingsAdvanced({
    hourSettings: hours,
    budgets,
    academicYear: draftHourFilters.academicYear,
    budgetName: draftHourFilters.budgetName
  });
  const scheduleTypes = [...new Set(budgetRows.map(row => String(row.scheduleType || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  setHourFilterOptions(
    containerEl.querySelector('#hour-filter-schedule-type'),
    '全部作息類型',
    scheduleTypes.map(value => ({ value, label: value })),
    draftHourFilters.scheduleType
  );

  const scheduleRows = filterHourSettingsAdvanced({
    hourSettings: hours,
    budgets,
    academicYear: draftHourFilters.academicYear,
    budgetName: draftHourFilters.budgetName,
    scheduleType: draftHourFilters.scheduleType
  });
  const nameByCode = new Map(getUnits().map(unit => [String(unit.unitCode || '').trim(), unit.unitName || unit.unitCode]));
  const unitCodes = [...new Set(scheduleRows.map(row => String(row.unitCode || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  setHourFilterOptions(
    containerEl.querySelector('#hour-filter-unit'),
    '全部單位',
    unitCodes.map(value => ({ value, label: `${value} - ${nameByCode.get(value) || value}` })),
    draftHourFilters.unitCode
  );
  const keyword = containerEl.querySelector('#hour-filter-keyword');
  if (keyword && keyword.value !== draftHourFilters.keyword) keyword.value = draftHourFilters.keyword;
}

function applyDraftHourFilters() {
  draftHourFilters.keyword = String(containerEl.querySelector('#hour-filter-keyword')?.value || '').trim();
  appliedHourFilters = { ...draftHourFilters };
  const allCheck = containerEl.querySelector('#hour-all-check');
  if (allCheck) allCheck.checked = false;
  containerEl.querySelectorAll('#hour-tbody .row-check').forEach(check => { check.checked = false; });
  renderHourTable();
}

function bindHourFilterEvents() {
  const year = containerEl.querySelector('#hour-filter-year');
  const budget = containerEl.querySelector('#hour-filter-budget');
  const schedule = containerEl.querySelector('#hour-filter-schedule-type');
  const unit = containerEl.querySelector('#hour-filter-unit');
  const keyword = containerEl.querySelector('#hour-filter-keyword');
  year.addEventListener('change', () => {
    draftHourFilters = { ...draftHourFilters, academicYear: year.value, budgetName: '', scheduleType: '', unitCode: '' };
    refreshHourFilterOptions();
  });
  budget.addEventListener('change', () => {
    draftHourFilters = { ...draftHourFilters, budgetName: budget.value, scheduleType: '', unitCode: '' };
    refreshHourFilterOptions();
  });
  schedule.addEventListener('change', () => {
    draftHourFilters = { ...draftHourFilters, scheduleType: schedule.value, unitCode: '' };
    refreshHourFilterOptions();
  });
  unit.addEventListener('change', () => { draftHourFilters = { ...draftHourFilters, unitCode: unit.value }; });
  keyword.addEventListener('input', () => { draftHourFilters = { ...draftHourFilters, keyword: keyword.value }; });
  keyword.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    applyDraftHourFilters();
  });
  containerEl.querySelector('#hour-filter-query').addEventListener('click', applyDraftHourFilters);
}

function setHourBudgetHint(text) {
  const el = containerEl ? containerEl.querySelector('#hour-budget-group-hint') : null;
  if (!el) return;
  if (!text) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  el.style.display = 'block';
  el.textContent = text;
}

function getSelectedHourBudgetRecord() {
  const ay = containerEl.querySelector('#hour-academicYear')?.value || '';
  const val = containerEl.querySelector('#hour-budget-group')?.value || '';
  return findBudgetByOptionValue(getBudgets(), val, ay);
}

/** Populate hour-budget-group for current academic year. */
function populateBudgetGroupSelect(selectedBudgetIdOrValue = '') {
  const sel = containerEl.querySelector('#hour-budget-group');
  if (!sel) return;
  const ay = containerEl.querySelector('#hour-academicYear')?.value || '';
  const list = getValidBudgetsForYear(getBudgets(), ay);

  sel.innerHTML = '';
  if (!ay) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '請先選擇學年度';
    sel.appendChild(opt);
    sel.disabled = true;
    return;
  }

  if (list.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '此學年度尚未建立有效預算單位';
    sel.appendChild(opt);
    sel.disabled = true;
    return;
  }

  sel.disabled = false;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '請選擇單位';
  sel.appendChild(placeholder);

  // Detect duplicate budgetName within year for display
  const nameCount = new Map();
  list.forEach(b => nameCount.set(b.budgetName, (nameCount.get(b.budgetName) || 0) + 1));

  list.forEach(b => {
    const opt = document.createElement('option');
    opt.value = budgetOptionValue(b);
    const dup = (nameCount.get(b.budgetName) || 0) > 1;
    if (dup) {
      const shortId = String(b.id || '').slice(-6) || 'dup';
      opt.textContent = `${b.budgetName}（${shortId}）`;
    } else {
      opt.textContent = b.budgetName;
    }
    sel.appendChild(opt);
  });

  if (selectedBudgetIdOrValue) {
    const match = list.find(b =>
      budgetOptionValue(b) === selectedBudgetIdOrValue ||
      b.id === selectedBudgetIdOrValue ||
      b.budgetName === selectedBudgetIdOrValue
    );
    if (match) sel.value = budgetOptionValue(match);
    else sel.value = '';
  } else {
    sel.value = '';
  }
}

function renderChoiceButton(group, value, label, selectedSet) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'weekday-btn hour-choice-btn';
  button.textContent = label;
  button.dataset.value = value;
  const update = () => {
    const active = selectedSet.has(value);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  };
  update();
  button.addEventListener('click', () => {
    if (selectedSet.has(value)) selectedSet.delete(value);
    else selectedSet.add(value);
    update();
  });
  group.appendChild(button);
}

function renderChoiceEmpty(group, text) {
  const hint = document.createElement('span');
  hint.className = 'hour-choice-empty';
  hint.textContent = text;
  group.appendChild(hint);
}

/** Render actual-unit buttons filtered by the selected budget unitCodes. */
function renderActualUnitButtons() {
  const group = containerEl.querySelector('#hour-unit');
  if (!group) return;
  group.replaceChildren();
  const budget = getSelectedHourBudgetRecord();
  if (!budget) {
    renderChoiceEmpty(group, '請先選擇單位');
    return;
  }

  const master = getUnits();
  const masterMap = new Map(master.map(u => [u.unitCode, u]));
  const missing = [];
  const orderedCodes = (budget.unitCodes || []).slice();

  orderedCodes.forEach(code => {
    const u = masterMap.get(code);
    if (!u) {
      missing.push(code);
      return;
    }
    renderChoiceButton(group, u.unitCode, `${u.unitCode} - ${u.unitName}`, selectedUnitCodes);
  });

  if (missing.length) {
    console.warn('[時數設定] 預算群組 unitCodes 在單位設定中不存在：', missing);
  }

  if (!group.querySelector('button')) renderChoiceEmpty(group, '此預算群組沒有可選的實際單位');
}

function renderScheduleTypeButtons() {
  const group = containerEl.querySelector('#hour-scheduleType');
  if (!group) return;
  group.replaceChildren();

  const types = getScheduleTypes();
  types.forEach(t => {
    renderChoiceButton(group, t.name, t.name, selectedScheduleTypes);
  });

  // 編輯時若舊值不在全域清單，只顯示原值，不建立主檔資料。
  selectedScheduleTypes.forEach(value => {
    if (types.some(t => t.name === value)) return;
    renderChoiceButton(group, value, value + '（原值，未在全域作息清單）', selectedScheduleTypes);
  });
  if (!group.querySelector('button')) renderChoiceEmpty(group, '請先建立作息類型');
}

export function renderHourTable() {
  if (!containerEl) return;
  refreshHourFilterOptions();
  const tbody = containerEl.querySelector('#hour-tbody');
  const allCheck = containerEl.querySelector('#hour-all-check');
  if (!tbody) return;

  const budgets = getBudgets();
  const filtered = filterHourSettingsAdvanced({ hourSettings: getHourSettings(), budgets, ...appliedHourFilters });
  const data = filtered.map(item => ({ item, derived: deriveHourBudgetUnit(budgets, item.academicYear, item.unitCode) }));

  // 排序：學年度 desc, 作息, 單位
  data.sort((a, b) => {
    const ai = a.item;
    const bi = b.item;
    if (ai.academicYear !== bi.academicYear) return bi.academicYear.localeCompare(ai.academicYear);
    if (a.derived.label !== b.derived.label) return a.derived.label.localeCompare(b.derived.label, 'zh-Hant');
    if (ai.scheduleType !== bi.scheduleType) return ai.scheduleType.localeCompare(bi.scheduleType, 'zh-Hant');
    return (ai.unitName || ai.unitCode || '').localeCompare(bi.unitName || bi.unitCode || '', 'zh-Hant');
  });

  tbody.innerHTML = '';

  if (!data.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="10" style="text-align:center;color:#666;">查無符合條件的時數設定</td>';
    tbody.appendChild(tr);
  }

  data.forEach(({ item, derived }) => {
    const tr = document.createElement('tr');
    const wd = item.weekdays ? item.weekdays.replace(/\|/g, '、') : '';
    const time = `${item.startTime}~${item.endTime}`;

    tr.innerHTML = `
      <td><input type="checkbox" class="row-check" data-id="${item.id}"></td>
      <td>${item.academicYear}</td>
      <td class="${derived.warning ? 'hour-budget-unit-warning' : ''}">${escapeHtml(derived.label)}</td>
      <td>${escapeHtml(item.scheduleType)}</td>
      <td>${escapeHtml(item.unitName)}</td>
      <td>${escapeHtml(wd)}</td>
      <td>${time}</td>
      <td style="text-align:right">${item.hours}</td>
      <td>${escapeHtml(item.note || '')}</td>
      <td><button class="btn-edit" data-id="${item.id}">編輯</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.row-check').forEach(chk => {
    chk.addEventListener('change', () => {
      updateHourAllCheck();
      updateBatchAddButtonState();
    });
  });
  tbody.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = getHourSettings().find(h => h.id === btn.dataset.id);
      if (item) showHourModal(item);
    });
  });

  if (allCheck) allCheck.checked = false;
  updateBatchAddButtonState();
}

function updateHourAllCheck() {
  const allCheck = containerEl.querySelector('#hour-all-check');
  const checks = containerEl.querySelectorAll('#hour-tbody .row-check');
  const all = checks.length > 0 && Array.from(checks).every(c => c.checked);
  if (allCheck) allCheck.checked = all;
}

export function getSelectedHourIds() {
  if (!containerEl) return [];
  return Array.from(containerEl.querySelectorAll('#hour-tbody .row-check:checked'))
    .map(c => c.dataset.id)
    .filter(Boolean);
}

export function updateBatchAddButtonState() {
  if (!containerEl) return;
  const btn = containerEl.querySelector('#btn-batch-add-hour');
  if (!btn) return;
  btn.disabled = false;
}

async function handleDeleteSelected() {
  const ids = getSelectedHourIds();
  if (ids.length === 0) {
    showToast('請先勾選要刪除的資料', 'error');
    return;
  }

  const blocked = [];
  const deletable = [];

  ids.forEach(id => {
    if (isHourSettingUsed(id)) {
      const h = getHourSettings().find(x => x.id === id);
      blocked.push(h ? `${h.academicYear}-${h.scheduleType}-${h.unitName}` : id);
    } else {
      deletable.push(id);
    }
  });

  if (blocked.length) {
    showToast(`以下已被行事曆使用，無法刪除：${blocked.join('、')}`, 'error');
  }

  if (deletable.length === 0) return;

  if (!confirm(`確定刪除 ${deletable.length} 筆時數設定？`)) return;

  try { await runWithMutationUiLock(containerEl.querySelector('#btn-delete-hour'),()=>deleteHourSettings(deletable)); showToast('刪除成功'); renderHourTable(); updateBatchAddButtonState(); } catch {}
}

// ===== Batch Add =====

function fillBatchSelect(sel, placeholderText, items, selected = '') {
  if (!sel) return;
  sel.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = placeholderText;
  sel.appendChild(placeholder);
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.value;
    opt.textContent = item.label;
    opt.disabled = Boolean(item.disabled);
    if (item.status) opt.dataset.status = item.status;
    if (item.value && item.value === selected) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.disabled = items.length === 0;
}

export function populateBatchSourceYearSelect(selected = '') {
  const sel = containerEl?.querySelector('#hour-batch-source-year');
  const years = getBatchSourceAcademicYears(getHourSettings(), getBudgets());
  fillBatchSelect(sel, years.length ? '請選擇來源學年度' : '沒有可用的來源學年度', years.map(y => ({ value: y, label: y })), String(selected || ''));
  return years;
}

export function populateBatchTargetYearSelect(selected = '') {
  const sel = containerEl ? containerEl.querySelector('#hour-batch-target-year') : null;
  const years = getUniqueBudgetAcademicYears(getBudgets());
  fillBatchSelect(sel, years.length ? '請選擇目標學年度' : '請先建立預算設定', years.map(y => ({ value: y, label: y })), String(selected || ''));
  return { years, hasYears: true };
}

export function populateBatchSourceBudgetSelect(selected = '') {
  const year = containerEl?.querySelector('#hour-batch-source-year')?.value || '';
  const query = (containerEl?.querySelector('#hour-batch-source-budget-search')?.value || '').trim().toLowerCase();
  const list = analyzeBudgetOptionsForYear(getBudgets(), year).options
    .filter(option => !query || option.budgetName.toLowerCase().includes(query));
  fillBatchSelect(
    containerEl?.querySelector('#hour-batch-source-budget'),
    year ? (list.length ? '請選擇來源預算單位' : '沒有符合的來源預算單位') : '請先選擇來源學年度',
    list.map(option => ({
      value: option.value,
      label: option.status === 'duplicate'
        ? `${option.budgetName}（重複 ${option.recordCount} 筆，請先修正）`
        : option.budgetName,
      disabled: option.status === 'duplicate',
      status: option.status
    })),
    selected
  );
  return list;
}

export function populateBatchTargetBudgetSelect(selected = '', autoSameName = false) {
  const year = containerEl?.querySelector('#hour-batch-target-year')?.value || '';
  const sourceYear = containerEl?.querySelector('#hour-batch-source-year')?.value || '';
  const sourceValue = containerEl?.querySelector('#hour-batch-source-budget')?.value || '';
  const sourceBudget = findBudgetByOptionValue(getBudgets(), sourceValue, sourceYear);
  const list = analyzeBudgetOptionsForYear(getBudgets(), year).options;
  let value = selected;
  if (autoSameName && sourceBudget) {
    const match = findSameNameTargetBudget(getBudgets(), sourceBudget, year);
    value = match ? budgetOptionValue(match) : '';
  }
  fillBatchSelect(
    containerEl?.querySelector('#hour-batch-target-budget'),
    year ? (list.length ? '請選擇目標預算單位' : '此年度沒有有效預算單位') : '請先選擇目標學年度',
    list.map(option => ({
      value: option.value,
      label: option.status === 'duplicate'
        ? `${option.budgetName}（重複 ${option.recordCount} 筆，請先修正）`
        : option.budgetName,
      disabled: option.status === 'duplicate',
      status: option.status
    })),
    value
  );
  return list;
}

export function renderBatchHourPreview(sourceItems = [], sourceBudget = null) {
  const tbody = containerEl ? containerEl.querySelector('#hour-batch-preview-tbody') : null;
  const countEl = containerEl ? containerEl.querySelector('#hour-batch-selected-count') : null;
  if (countEl) countEl.textContent = `${sourceItems.length} 筆時數設定`;
  if (!tbody) return;

  tbody.innerHTML = '';
  if (!sourceItems.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="8" style="text-align:center;color:#888;">此來源學年度與預算單位沒有可複製的時數設定</td>`;
    tbody.appendChild(tr);
    return;
  }

  sourceItems.forEach(item => {
    const wd = item.weekdays ? String(item.weekdays).replace(/\|/g, '、') : '';
    const time = `${item.startTime || ''}~${item.endTime || ''}`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(item.academicYear)}</td>
      <td>${escapeHtml(sourceBudget?.budgetName || deriveHourBudgetUnit(getBudgets(), item.academicYear, item.unitCode).label)}</td>
      <td>${escapeHtml(item.scheduleType)}</td>
      <td>${escapeHtml(item.unitName)}</td>
      <td>${escapeHtml(wd)}</td>
      <td>${escapeHtml(time)}</td>
      <td style="text-align:right">${escapeHtml(item.hours)}</td>
      <td>${escapeHtml(item.note || '')}</td>
    `;
    tbody.appendChild(tr);
  });
}

function analyzeSelectedBatchScope(ids) {
  const byId = new Map(getHourSettings().map(h => [h.id, h]));
  const rows = ids.map(id => byId.get(id)).filter(Boolean);
  if (rows.length !== ids.length || !rows.length) return { ok: false };
  const scopes = rows.map(row => ({ row, derived: deriveHourBudgetUnit(getBudgets(), row.academicYear, row.unitCode) }));
  if (scopes.some(x => x.derived.status !== 'unique')) return { ok: false };
  const keys = new Set(scopes.map(x => `${x.row.academicYear}\u0001${budgetOptionValue(x.derived.budget)}`));
  if (keys.size !== 1) return { ok: false };
  return { ok: true, rows, academicYear: rows[0].academicYear, budget: scopes[0].derived.budget };
}

function rebuildBatchHourPreview({ autoTarget = false } = {}) {
  const sourceYear = containerEl?.querySelector('#hour-batch-source-year')?.value || '';
  const sourceValue = containerEl?.querySelector('#hour-batch-source-budget')?.value || '';
  const sourceBudget = findBudgetByOptionValue(getBudgets(), sourceValue, sourceYear);
  let rows = [];
  if (sourceBudget) {
    if (batchModalMode === 'selected') {
      const byId = new Map(getHourSettings().map(h => [h.id, h]));
      rows = batchModalSelectedIds.map(id => byId.get(id)).filter(Boolean);
    } else {
      rows = filterHourSettingsByBudget({ hourSettings: getHourSettings(), budgets: getBudgets(), academicYear: sourceYear, budgetId: sourceValue }).rows;
      batchModalSelectedIds = rows.map(row => row.id);
    }
  } else if (batchModalMode === 'scope') {
    batchModalSelectedIds = [];
  }
  renderBatchHourPreview(rows, sourceBudget);
  if (autoTarget && containerEl?.querySelector('#hour-batch-target-year')?.value) {
    populateBatchTargetBudgetSelect('', true);
  }
  rebuildBatchPlanSummary();
}

function rebuildBatchPlanSummary() {
  const el = containerEl?.querySelector('#hour-batch-plan-summary');
  const confirm = containerEl?.querySelector('#hour-batch-confirm-btn');
  if (!el || !confirm) return null;
  const sourceAcademicYear = containerEl.querySelector('#hour-batch-source-year')?.value || '';
  const sourceBudgetId = containerEl.querySelector('#hour-batch-source-budget')?.value || '';
  const targetAcademicYear = containerEl.querySelector('#hour-batch-target-year')?.value || '';
  const targetBudgetId = containerEl.querySelector('#hour-batch-target-budget')?.value || '';
  if (!sourceAcademicYear || !sourceBudgetId || !targetAcademicYear || !targetBudgetId || !batchModalSelectedIds.length) {
    el.textContent = '';
    confirm.disabled = true;
    return null;
  }
  const plan = planBatchHourCopy({ sourceIds: batchModalSelectedIds, sourceAcademicYear, sourceBudgetId, targetAcademicYear, targetBudgetId, hourSettings: getHourSettings(), units: getUnits(), budgets: getBudgets() });
  if (!plan.ok) {
    el.textContent = plan.error || '';
    confirm.disabled = true;
    return plan;
  }
  el.textContent = `來源：${sourceAcademicYear} 學年度／${plan.sourceBudgetName}　目標：${targetAcademicYear} 學年度／${plan.targetBudgetName}　準備新增：${plan.toAdd.length} 筆　預計略過：${plan.skipped.length} 筆`;
  confirm.disabled = false;
  return plan;
}

function clearBatchResultPanel() {
  const el = containerEl ? containerEl.querySelector('#hour-batch-result') : null;
  if (!el) return;
  el.style.display = 'none';
  el.innerHTML = '';
}

function renderBatchResultPanel(plan) {
  const el = containerEl ? containerEl.querySelector('#hour-batch-result') : null;
  if (!el) return;
  const c = plan.counters || {};
  const skipped = plan.skipped || [];
  if (!skipped.length) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }

  const rows = skipped.map(s => `
    <tr>
      <td>${escapeHtml(s.unitName)}</td>
      <td>${escapeHtml(s.scheduleType)}</td>
      <td>${escapeHtml(s.time)}</td>
      <td>${escapeHtml(s.reason)}</td>
    </tr>
  `).join('');

  el.style.display = 'block';
  el.innerHTML = `
    <div class="hour-batch-result-summary">
      來源預算單位：${escapeHtml(plan.sourceBudgetName || '')}；目標預算單位：${escapeHtml(plan.targetBudgetName || '')}；
      選取 ${c.selected || 0} 筆；新增 ${c.added || 0} 筆；
      重複略過 ${c.duplicateSkipped || 0}；
      無效單位 ${c.invalidUnitSkipped || 0}；
      預算範圍外 ${c.outOfBudgetScopeSkipped || 0}；
      來源缺失 ${c.missingSourceSkipped || 0}
    </div>
    <div class="table-wrapper">
      <table class="data-table hour-batch-skip-table">
        <thead>
          <tr>
            <th>單位</th>
            <th>作息類型</th>
            <th>開館時間</th>
            <th>略過原因</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

export function showBatchAddHourModal() {
  if (!containerEl) return;
  const ids = getSelectedHourIds();
  const sourceYear = containerEl.querySelector('#hour-batch-source-year');
  const sourceSearch = containerEl.querySelector('#hour-batch-source-budget-search');
  const sourceBudget = containerEl.querySelector('#hour-batch-source-budget');
  batchModalMode = ids.length ? 'selected' : 'scope';
  clearBatchResultPanel();
  if (sourceSearch) sourceSearch.value = '';
  populateBatchSourceYearSelect('');
  populateBatchTargetYearSelect('');
  populateBatchTargetBudgetSelect('');

  if (ids.length) {
    const scope = analyzeSelectedBatchScope(ids);
    if (!scope.ok) {
      showToast('勾選資料包含不同來源學年度或不同預算單位，請改用單一預算單位範圍。', 'error');
      return;
    }
    batchModalSelectedIds = ids.slice();
    sourceYear.value = scope.academicYear;
    populateBatchSourceBudgetSelect(budgetOptionValue(scope.budget));
    sourceBudget.value = budgetOptionValue(scope.budget);
    sourceYear.disabled = true;
    sourceBudget.disabled = true;
    if (sourceSearch) sourceSearch.disabled = true;
  } else {
    batchModalSelectedIds = [];
    sourceYear.disabled = false;
    if (sourceSearch) sourceSearch.disabled = false;
  }
  rebuildBatchHourPreview();

  const modal = containerEl.querySelector('#hour-batch-add-modal');
  if (modal) modal.style.display = 'flex';
}

export function hideBatchAddHourModal() {
  const modal = containerEl ? containerEl.querySelector('#hour-batch-add-modal') : null;
  if (modal) modal.style.display = 'none';
  batchModalSelectedIds = [];
  batchModalMode = 'scope';
  clearBatchResultPanel();
}

export async function handleBatchAddHourSettings() {
  if (!containerEl) return;

  const sourceAy = String(containerEl.querySelector('#hour-batch-source-year')?.value || '').trim();
  const sourceBudgetId = String(containerEl.querySelector('#hour-batch-source-budget')?.value || '').trim();
  const targetAy = String(containerEl.querySelector('#hour-batch-target-year')?.value || '').trim();
  const targetBudgetId = String(containerEl.querySelector('#hour-batch-target-budget')?.value || '').trim();
  const years = getUniqueBudgetAcademicYears(getBudgets());

  if (!years.length) {
    showToast('請先建立預算設定', 'error');
    return;
  }
  if (!sourceAy || !sourceBudgetId) {
    showToast('請選擇來源學年度與來源預算單位', 'error');
    return;
  }
  if (!targetAy || !targetBudgetId) {
    showToast('請選擇目標學年度與目標預算單位', 'error');
    return;
  }

  // Do not trust select values: re-resolve the name group from current runtime data.
  const sourceSelected = findBudgetByOptionValue(getBudgets(), sourceBudgetId, sourceAy);
  const sourceOption = sourceSelected && analyzeBudgetOptionsForYear(getBudgets(), sourceAy).options
    .find(option => option.budgetName === sourceSelected.budgetName);
  if (sourceOption?.status === 'duplicate') {
    showToast(`來源學年度的預算單位「${sourceSelected.budgetName}」存在重複資料，請先至預算設定修正。`, 'error');
    return;
  }
  const targetSelected = findBudgetByOptionValue(getBudgets(), targetBudgetId, targetAy);
  const targetOption = targetSelected && analyzeBudgetOptionsForYear(getBudgets(), targetAy).options
    .find(option => option.budgetName === targetSelected.budgetName);
  if (targetOption?.status === 'duplicate') {
    showToast(`目標學年度的預算單位「${targetSelected.budgetName}」存在重複資料，請先至預算設定修正。`, 'error');
    return;
  }

  // 按下確認時以目前勾選（或 modal 開啟時 ids）為準，並重新取完整資料
  const ids = batchModalSelectedIds.slice();
  if (!ids.length) {
    showToast('此來源學年度與預算單位沒有可複製的時數設定', 'error');
    return;
  }

  const plan = planBatchHourCopy({
    sourceIds: ids,
    sourceAcademicYear: sourceAy,
    sourceBudgetId,
    targetAcademicYear: targetAy,
    targetBudgetId,
    hourSettings: getHourSettings(),
    units: getUnits(),
    budgets: getBudgets()
  });
  if (!plan.ok) {
    showToast(plan.error || '批次新增範圍無效', 'error');
    return plan;
  }

  const sourceSnapshot = new Map(getHourSettings().map(h => [h.id, { ...h }]));
  let result;
  if (!plan.toAdd.length) {
    renderBatchResultPanel(plan);
    showToast('批次新增失敗：0 筆新增，請查看略過原因', 'error');
    return plan;
  }
  try { result = await runWithMutationUiLock([containerEl.querySelector('#hour-batch-confirm-btn'),containerEl.querySelector('#hour-batch-cancel-btn')],()=>saveHourSettingsBatch(plan.toAdd.map(entry=>({...entry.payload,sourceId:entry.sourceId}))),{blocking:true}); } catch { return; }
  const counters = { ...plan.counters, ...result, added: result.added || 0 };
  const finalPlan = { ...plan, counters, saved: result.addedRecords || [], skipped: [...plan.skipped,...(result.skipped||[])] };

  // 驗證來源未被改動
  let sourceUnchanged = true;
  ids.forEach(id => {
    const before = sourceSnapshot.get(id);
    const after = getHourSettings().find(h => h.id === id);
    if (before && after) {
      if (JSON.stringify(before) !== JSON.stringify(after)) sourceUnchanged = false;
    } else if (before && !after) {
      sourceUnchanged = false;
    }
  });
  finalPlan.sourceRowsUnchanged = sourceUnchanged;

  renderBatchResultPanel(finalPlan);

  const skippedTotal = finalPlan.skipped.length;

  if (counters.added > 0) {
    if (skippedTotal > 0) {
      showToast(`批次新增完成：新增 ${counters.added} 筆，略過 ${skippedTotal} 筆`, 'info');
    } else {
      showToast(`批次新增完成：新增 ${counters.added} 筆`, 'success');
    }
    hideBatchAddHourModal();
    // 清除勾選並重渲染
    const allCheck = containerEl.querySelector('#hour-all-check');
    if (allCheck) allCheck.checked = false;
    renderHourTable();
    updateBatchAddButtonState();
  } else {
    showToast(`批次新增失敗：0 筆新增，請查看略過原因`, 'error');
    // modal 保持開啟、保留勾選
    renderBatchResultPanel(finalPlan);
  }

  return finalPlan;
}

function populateAcademicYearSelect(selected = '') {
  const sel = containerEl.querySelector('#hour-academicYear');
  sel.innerHTML = '<option value="">請選擇</option>';

  const years = getUniqueBudgetAcademicYears(getBudgets());
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === selected) opt.selected = true;
    sel.appendChild(opt);
  });
}

function setupWeekdayButtons(selectedWeekdays = []) {
  const container = containerEl.querySelector('#hour-weekdays');
  container.innerHTML = '';

  WEEKDAYS.forEach(day => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'weekday-btn';
    btn.textContent = day;
    btn.dataset.day = day;

    if (selectedWeekdays.includes(day)) btn.classList.add('active');

    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
    });

    container.appendChild(btn);
  });
}

function getSelectedWeekdays() {
  const container = containerEl.querySelector('#hour-weekdays');
  const actives = container.querySelectorAll('.weekday-btn.active');
  return Array.from(actives).map(b => b.dataset.day);
}

function showHourModal(item = null) {
  currentEditingId = item ? item.id : null;
  hourEditBudgetStatus = 'ok';
  hourEditBlockSave = false;
  setHourBudgetHint('');

  const modal = containerEl.querySelector('#hour-modal');
  const titleEl = containerEl.querySelector('#hour-modal-title');

  titleEl.textContent = item ? '編輯時數設定' : '新增時數設定';

  selectedScheduleTypes = new Set(item ? [item.scheduleType] : []);
  selectedUnitCodes = new Set(item ? [item.unitCode] : []);
  populateAcademicYearSelect(item ? item.academicYear : '');

  const start = containerEl.querySelector('#hour-startTime');
  const end = containerEl.querySelector('#hour-endTime');
  const hours = containerEl.querySelector('#hour-hours');
  const note = containerEl.querySelector('#hour-note');

  start.value = item ? item.startTime : '08:00';
  end.value = item ? item.endTime : '21:30';
  hours.value = item ? item.hours : '';
  note.value = item ? (item.note || '') : '';

  if (item) {
    // 編輯：以 academicYear + unitCode 反查預算群組
    populateBudgetGroupSelect('');
    const derived = findBudgetsByYearAndUnit(getBudgets(), item.academicYear, item.unitCode);
    if (derived.status === 'unique') {
      hourEditBudgetStatus = 'ok';
      populateBudgetGroupSelect(budgetOptionValue(derived.budgets[0]));
      setHourBudgetHint('');
    } else if (derived.status === 'none') {
      hourEditBudgetStatus = 'none';
      hourEditBlockSave = true;
      populateBudgetGroupSelect('');
      selectedUnitCodes.clear();
      setHourBudgetHint('原設定未對應有效預算單位，請重新選擇');
    } else {
      hourEditBudgetStatus = 'multiple';
      hourEditBlockSave = true;
      populateBudgetGroupSelect('');
      selectedUnitCodes.clear();
      setHourBudgetHint('此實際單位同時存在於多個預算單位，請先修正預算設定');
      console.warn('[時數設定] unitCode 同時對應多筆預算：', item.unitCode, derived.budgets.map(b => b.id || b.budgetName));
    }
  } else {
    // 新增：三層皆未選
    populateBudgetGroupSelect('');
  }

  renderScheduleTypeButtons();
  renderActualUnitButtons();

  // weekday buttons
  const selDays = item ? getWeekdaysArray(item.weekdays) : [];
  setupWeekdayButtons(selDays);

  modal.style.display = 'flex';
}

function hideHourModal() {
  const modal = containerEl.querySelector('#hour-modal');
  modal.style.display = 'none';
  currentEditingId = null;
  hourEditBudgetStatus = 'ok';
  hourEditBlockSave = false;
  setHourBudgetHint('');
}

async function handleSaveHourSetting() {
  const ay = containerEl.querySelector('#hour-academicYear').value;
  const scheduleTypes = [...selectedScheduleTypes];
  const unitCodes = [...selectedUnitCodes];
  const budgetVal = containerEl.querySelector('#hour-budget-group')?.value || '';
  const start = containerEl.querySelector('#hour-startTime').value;
  const end = containerEl.querySelector('#hour-endTime').value;
  const hours = containerEl.querySelector('#hour-hours').value;
  const note = containerEl.querySelector('#hour-note').value.trim();

  const selectedDays = getSelectedWeekdays();
  const weekdaysStr = arrayToWeekdays(selectedDays);

  if (hourEditBlockSave && hourEditBudgetStatus === 'multiple') {
    showToast('此實際單位同時存在於多個預算單位，請先修正預算設定', 'error');
    return;
  }

  if (!ay) {
    showToast('請選擇學年度', 'error');
    return;
  }
  if (!budgetVal) {
    showToast('請選擇單位', 'error');
    return;
  }
  if (!unitCodes.length) {
    showToast('請選擇實際單位', 'error');
    return;
  }
  if (!scheduleTypes.length) {
    showToast('請選擇作息類型', 'error');
    return;
  }

  const selectedBudget = findBudgetByOptionValue(getBudgets(), budgetVal, ay);
  if (!selectedBudget) {
    showToast('選擇的單位不屬於目前學年度', 'error');
    return;
  }
  if (String(selectedBudget.academicYear) !== String(ay)) {
    showToast('選擇的單位不屬於目前學年度', 'error');
    return;
  }
  if (unitCodes.some(unitCode => !selectedBudget.unitCodes.includes(unitCode))) {
    showToast('實際單位不屬於所選預算單位', 'error');
    return;
  }

  // 從 getUnits() 取得 unitName，不允許不存在的單位
  const unitMap = new Map(getUnits().map(unit => [unit.unitCode, unit]));
  if (unitCodes.some(unitCode => !unitMap.has(unitCode))) {
    showToast('實際單位已不存在於單位設定', 'error');
    return;
  }
  if (selectedDays.length === 0) {
    showToast('至少選擇一個週期類型（星期）', 'error');
    return;
  }
  if (!start || !end || start >= end) {
    showToast('開始時間必須小於結束時間', 'error');
    return;
  }
  if (!hours || isNaN(Number(hours))) {
    showToast('時數必須為數字', 'error');
    return;
  }
  const wasEditing = Boolean(currentEditingId);
  try {
    const result = await runWithMutationUiLock(
      [containerEl.querySelector('#hour-save-btn'), containerEl.querySelector('#hour-cancel-btn')],
      () => saveHourSettingCombinations({
        editingId: currentEditingId,
        academicYear: ay,
        scheduleTypes,
        unitCodes,
        weekdays: weekdaysStr,
        startTime: start,
        endTime: end,
        hours: Number(hours),
        note
      }),
      { processingLabel: '同步中…' }
    );
    renderHourTable();
    hideHourModal();
    const total = scheduleTypes.length * unitCodes.length;
    showToast(wasEditing ? `已同步（儲存 ${total} 筆組合，新增 ${result.createdCount} 筆）` : `已同步（新增 ${result.createdCount} 筆時數設定）`);
  } catch (error) {
    renderHourTable();
    showToast(error?.message || '時數設定儲存失敗', 'error');
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ===== 新增作息 (schedule type) modal =====
function showScheduleTypeModal() {
  const modal = containerEl.querySelector('#schedule-type-modal');
  if (!modal) return;
  const input = containerEl.querySelector('#stype-name');
  if (input) input.value = '';
  modal.style.display = 'flex';
  renderScheduleTypeListInModal();
}

function hideScheduleTypeModal() {
  const modal = containerEl.querySelector('#schedule-type-modal');
  if (modal) modal.style.display = 'none';
}

function renderScheduleTypeListInModal() {
  const listEl = containerEl.querySelector('#stype-list');
  const pagEl = containerEl.querySelector('#stype-pagination');
  if (!listEl || !pagEl) return;

  listEl.innerHTML = '';
  pagEl.innerHTML = '';

  let types = getScheduleTypes();
  // z-a 排序（名稱降冪）
  types.sort((a, b) => (b.name || '').localeCompare(a.name || ''));

  const total = types.length;
  if (total === 0) {
    const li = document.createElement('li');
    li.style.color = '#888';
    li.textContent = '目前無作息設定';
    listEl.appendChild(li);
    return;
  }

  const pageSize = STYPE_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // clamp page
  if (stypeCurrentPage > totalPages) stypeCurrentPage = totalPages;
  if (stypeCurrentPage < 1) stypeCurrentPage = 1;

  const page = stypeCurrentPage;
  const start = (page - 1) * pageSize;
  const pageItems = types.slice(start, start + pageSize);

  // render current page items
  pageItems.forEach(t => {
    const li = document.createElement('li');
    li.style.marginBottom = '2px';
    li.innerHTML = `<span style="color:#151922;">${escapeHtml(t.name)}</span> <span style="color:#c00; cursor:pointer; font-weight:bold;" data-id="${t.id}">×</span>`;
    const delSpan = li.querySelector('span[data-id]');
    delSpan.addEventListener('click', async () => {
      if (isScheduleTypeUsed(t.name)) {
        showToast('此作息類型已被時數設定或行事曆使用，請先移除相關資料再刪除', 'error');
        return;
      }
      if (confirm(`確定刪除作息類型「${t.name}」？`)) {
        try { await runWithMutationUiLock(delSpan,()=>deleteScheduleType(t.id)); } catch { return; }
        renderScheduleTypeListInModal();
        // 若 hour modal 開啟，也刷新按鈕；刪除尚未儲存的選取值。
        const hourM = containerEl.querySelector('#hour-modal');
        if (hourM && hourM.style.display === 'flex') {
          selectedScheduleTypes.delete(t.name);
          renderScheduleTypeButtons();
        }
      }
    });
    listEl.appendChild(li);
  });

  // render pagination
  renderPagination(pagEl, page, totalPages, (newPage) => {
    stypeCurrentPage = newPage;
    renderScheduleTypeListInModal();
  });
}

async function handleScheduleTypeSave() {
  const input = containerEl.querySelector('#stype-name');
  if (!input) return;
  const name = input.value.trim();
  if (!name) {
    showToast('作息類型為必填', 'error');
    return;
  }

  try {
    await runWithMutationUiLock(containerEl.querySelector('#stype-save-btn'),()=>saveScheduleType({ name }));
  } catch (e) {
    const msg = e && e.message ? e.message : '儲存失敗';
    if (msg.includes('已存在') || msg.includes('重複')) {
      showToast('作息類型名稱已存在', 'error');
    } else {
      showToast(msg, 'error');
    }
    return;
  }

  showToast('作息類型已儲存');
  input.value = '';
  input.focus();
  stypeCurrentPage = 1; // 新增後跳第一頁
  renderScheduleTypeListInModal();

  // 若「新增時數 / 編輯時數」modal 已開啟，刷新作息類型按鈕
  const hourModal = containerEl.querySelector('#hour-modal');
  if (hourModal && hourModal.style.display === 'flex') {
    renderScheduleTypeButtons();
  }

  // 不要關閉子視窗
}
