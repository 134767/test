// js/hourSettingPage.js
import {
  getBudgets,
  getUnits,
  getHourSettings,
  saveHourSetting,
  saveHourSettingsBatch,
  deleteHourSettings,
  isHourSettingUsed,
  getScheduleTypes,
  saveScheduleType,
  deleteScheduleType,
  isScheduleTypeUsed
} from './dataStore.js?v=1.6.0';
import { formatNumber, showToast, formatTimeRange, getWeekdaysArray, arrayToWeekdays, renderPagination } from './utils.js?v=1.6.0';
import {
  buildHourSettingDuplicateKey,
  getUniqueBudgetAcademicYears,
  planBatchHourCopy
} from './hourBatchUtils.js?v=1.6.0';
import {
  getValidBudgetsForYear,
  findBudgetsByYearAndUnit,
  budgetOptionValue,
  findBudgetByOptionValue
} from './hourBudgetScopeUtils.js?v=1.6.0';
import { runWithMutationUiLock } from './mutationUi.js?v=1.6.0';

export {
  buildHourSettingDuplicateKey,
  getUniqueBudgetAcademicYears,
  getValidBudgetUnitCodesForYear,
  isUnitInTargetBudgetScope,
  planBatchHourCopy
} from './hourBatchUtils.js?v=1.6.0';

export {
  getValidBudgetsForYear,
  findBudgetsByYearAndUnit,
  resolveBudgetForNameAndYear,
  getDistinctValidBudgetNames,
  filterCalendarRowsByBudgetScope
} from './hourBudgetScopeUtils.js?v=1.6.0';

let containerEl = null;
let currentEditingId = null;
let currentSearch = '';
/** @type {string[]} ids currently previewed in batch modal */
let batchModalSelectedIds = [];
/** @type {'ok'|'none'|'multiple'|'empty_year'} */
let hourEditBudgetStatus = 'ok';
let hourEditBlockSave = false;

const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

let stypeCurrentPage = 1;
const STYPE_PAGE_SIZE = 20;

export function initHourSettingPage(container) {
  containerEl = container;
  container.innerHTML = `
    <div class="page-header">
      <h2>時數設定</h2>
      <div class="toolbar">
        <input type="text" id="hour-search" placeholder="搜尋 學年度 / 作息類型 / 單位 / 週期 / 備註" class="search-input">
        <button id="btn-add-schedule-type" class="btn-primary">新增作息</button>
        <button id="btn-add-hour" class="btn-primary">新增時數</button>
        <button id="btn-batch-add-hour" class="btn-primary" disabled>批次新增</button>
        <button id="btn-delete-hour" class="btn-danger">刪除</button>
      </div>
    </div>
    <div class="table-wrapper">
      <table class="data-table" id="hour-table">
        <thead>
          <tr>
            <th style="width:42px"><input type="checkbox" id="hour-all-check"></th>
            <th>學年度</th>
            <th>作息類型</th>
            <th>單位</th>
            <th>週期類型</th>
            <th>開館時間</th>
            <th style="text-align:right">時數</th>
            <th style="text-align:right">時薪</th>
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
              <select id="hour-scheduleType"></select>
            </div>
            <div class="form-group">
              <label>實際單位 <span class="required">*</span></label>
              <select id="hour-unit"></select>
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
            <div class="form-group">
              <label>時薪 <span class="required">*</span></label>
              <input type="number" id="hour-wage" placeholder="196">
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
            <div class="form-group">
              <label>已選擇</label>
              <div id="hour-batch-selected-count" class="hour-batch-selected-count">0 筆時數設定</div>
            </div>
            <div class="form-group hour-batch-year-group">
              <label>目標學年度 <span class="required">*</span></label>
              <select id="hour-batch-target-year">
                <option value="">請選擇目標學年度</option>
              </select>
            </div>
          </div>
          <div class="help-text" style="margin-bottom:8px;">
            將完整複製所選資料（作息、單位、週期、時間、時數、時薪、備註）到目標學年度；僅學年度改為目標值。來源資料不會被修改。
          </div>
          <div class="table-wrapper hour-batch-preview-wrap">
            <table class="data-table hour-batch-preview-table" id="hour-batch-preview-table">
              <thead>
                <tr>
                  <th>來源學年度</th>
                  <th>作息類型</th>
                  <th>單位</th>
                  <th>週期類型</th>
                  <th>開館時間</th>
                  <th style="text-align:right">時數</th>
                  <th style="text-align:right">時薪</th>
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
  renderHourTable();
  updateBatchAddButtonState();
}

function bindHourEvents() {
  const searchInput = containerEl.querySelector('#hour-search');
  const addBtn = containerEl.querySelector('#btn-add-hour');
  const batchBtn = containerEl.querySelector('#btn-batch-add-hour');
  const delBtn = containerEl.querySelector('#btn-delete-hour');
  const allCheck = containerEl.querySelector('#hour-all-check');

  searchInput.addEventListener('input', () => {
    currentSearch = searchInput.value.trim().toLowerCase();
    renderHourTable();
  });

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
    populateActualUnitSelect('');
  });

  if (budgetSel) {
    budgetSel.addEventListener('change', () => {
      hourEditBudgetStatus = 'ok';
      hourEditBlockSave = false;
      setHourBudgetHint('');
      populateActualUnitSelect('');
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

/** Actual unit selector filtered by selected budget unitCodes. */
function populateActualUnitSelect(selectedCode = '') {
  const sel = containerEl.querySelector('#hour-unit');
  if (!sel) return;

  const budget = getSelectedHourBudgetRecord();
  sel.innerHTML = '';

  if (!budget) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '請先選擇單位';
    sel.appendChild(opt);
    sel.disabled = true;
    return;
  }

  sel.disabled = false;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '請選擇實際單位';
  sel.appendChild(placeholder);

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
    const opt = document.createElement('option');
    opt.value = u.unitCode;
    opt.textContent = `${u.unitCode} - ${u.unitName}`;
    sel.appendChild(opt);
  });

  if (missing.length) {
    console.warn('[時數設定] 預算群組 unitCodes 在單位設定中不存在：', missing);
  }

  // 規格：不可把不在群組／主檔中的原 unitCode 假裝為可選
  if (selectedCode && [...sel.options].some(o => o.value === selectedCode)) {
    sel.value = selectedCode;
  } else {
    sel.value = '';
  }
}

// backward-compatible alias used nowhere critical
function populateUnitSelect(selectedCode = '') {
  populateActualUnitSelect(selectedCode);
}

function populateScheduleTypeSelect(selected = '') {
  const sel = containerEl.querySelector('#hour-scheduleType');
  if (!sel) return;

  sel.innerHTML = '';

  const types = getScheduleTypes();
  if (types.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '請先按「新增作息」建立作息類型';
    sel.appendChild(opt);
    return;
  }

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '請選擇作息類型';
  sel.appendChild(placeholder);

  types.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.name;
    opt.textContent = t.name;
    sel.appendChild(opt);
  });

  // 編輯時若舊值不在全域清單，臨時加入並標註
  if (selected && !types.some(t => t.name === selected)) {
    const opt = document.createElement('option');
    opt.value = selected;
    opt.textContent = selected + '（原值，未在全域作息清單）';
    opt.disabled = true;  // 仍允許儲存但標註
    sel.appendChild(opt);
  }

  sel.value = selected || '';
}

export function renderHourTable() {
  if (!containerEl) return;
  const tbody = containerEl.querySelector('#hour-tbody');
  const allCheck = containerEl.querySelector('#hour-all-check');
  if (!tbody) return;

  let data = getHourSettings();

  // 套用搜尋
  if (currentSearch) {
    const kw = currentSearch;
    data = data.filter(h => {
      const unitStr = `${h.unitCode} ${h.unitName}`.toLowerCase();
      return (
        (h.academicYear || '').toLowerCase().includes(kw) ||
        (h.scheduleType || '').toLowerCase().includes(kw) ||
        unitStr.includes(kw) ||
        (h.weekdays || '').toLowerCase().includes(kw) ||
        (h.note || '').toLowerCase().includes(kw)
      );
    });
  }

  // 排序：學年度 desc, 作息, 單位
  data.sort((a, b) => {
    if (a.academicYear !== b.academicYear) return b.academicYear.localeCompare(a.academicYear);
    if (a.scheduleType !== b.scheduleType) return a.scheduleType.localeCompare(b.scheduleType);
    return a.unitName.localeCompare(b.unitName);
  });

  tbody.innerHTML = '';

  data.forEach(item => {
    const tr = document.createElement('tr');
    const wd = item.weekdays ? item.weekdays.replace(/\|/g, '、') : '';
    const time = `${item.startTime}~${item.endTime}`;

    tr.innerHTML = `
      <td><input type="checkbox" class="row-check" data-id="${item.id}"></td>
      <td>${item.academicYear}</td>
      <td>${escapeHtml(item.scheduleType)}</td>
      <td>${escapeHtml(item.unitName)}</td>
      <td>${escapeHtml(wd)}</td>
      <td>${time}</td>
      <td style="text-align:right">${item.hours}</td>
      <td style="text-align:right">${item.hourlyWage}</td>
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
  const count = getSelectedHourIds().length;
  btn.disabled = count === 0;
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

export function populateBatchTargetYearSelect(selected = '') {
  const sel = containerEl ? containerEl.querySelector('#hour-batch-target-year') : null;
  if (!sel) return { years: [], hasYears: false };

  const years = getUniqueBudgetAcademicYears(getBudgets());
  sel.innerHTML = '';

  if (years.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '請先建立預算設定';
    sel.appendChild(opt);
    sel.disabled = true;
    return { years, hasYears: false };
  }

  sel.disabled = false;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '請選擇目標學年度';
  sel.appendChild(placeholder);

  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (String(selected) === String(y)) opt.selected = true;
    sel.appendChild(opt);
  });

  return { years, hasYears: true };
}

export function renderBatchHourPreview(sourceItems = []) {
  const tbody = containerEl ? containerEl.querySelector('#hour-batch-preview-tbody') : null;
  const countEl = containerEl ? containerEl.querySelector('#hour-batch-selected-count') : null;
  if (countEl) countEl.textContent = `${sourceItems.length} 筆時數設定`;
  if (!tbody) return;

  tbody.innerHTML = '';
  if (!sourceItems.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="8" style="text-align:center;color:#888;">沒有可預覽的資料</td>`;
    tbody.appendChild(tr);
    return;
  }

  sourceItems.forEach(item => {
    const wd = item.weekdays ? String(item.weekdays).replace(/\|/g, '、') : '';
    const time = `${item.startTime || ''}~${item.endTime || ''}`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(item.academicYear)}</td>
      <td>${escapeHtml(item.scheduleType)}</td>
      <td>${escapeHtml(item.unitName)}</td>
      <td>${escapeHtml(wd)}</td>
      <td>${escapeHtml(time)}</td>
      <td style="text-align:right">${escapeHtml(item.hours)}</td>
      <td style="text-align:right">${escapeHtml(item.hourlyWage)}</td>
      <td>${escapeHtml(item.note || '')}</td>
    `;
    tbody.appendChild(tr);
  });
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
  if (!ids.length) {
    showToast('請先勾選要批次新增的資料', 'error');
    updateBatchAddButtonState();
    return;
  }

  // 依 id 重新從完整資料取回（不受搜尋畫面外資料影響）
  const all = getHourSettings();
  const byId = new Map(all.map(h => [h.id, h]));
  const sources = [];
  const missing = [];
  ids.forEach(id => {
    const item = byId.get(id);
    if (item) sources.push(item);
    else missing.push(id);
  });

  batchModalSelectedIds = ids.slice();
  clearBatchResultPanel();

  const countEl = containerEl.querySelector('#hour-batch-selected-count');
  if (countEl) countEl.textContent = `${ids.length} 筆時數設定`;

  const { hasYears } = populateBatchTargetYearSelect('');
  renderBatchHourPreview(sources);

  const confirmBtn = containerEl.querySelector('#hour-batch-confirm-btn');
  if (confirmBtn) confirmBtn.disabled = !hasYears;

  if (missing.length) {
    showToast(`有 ${missing.length} 筆勾選資料找不到來源，將於執行時略過`, 'info');
  }

  const modal = containerEl.querySelector('#hour-batch-add-modal');
  if (modal) modal.style.display = 'flex';
}

export function hideBatchAddHourModal() {
  const modal = containerEl ? containerEl.querySelector('#hour-batch-add-modal') : null;
  if (modal) modal.style.display = 'none';
  batchModalSelectedIds = [];
  clearBatchResultPanel();
}

export async function handleBatchAddHourSettings() {
  if (!containerEl) return;

  const yearSel = containerEl.querySelector('#hour-batch-target-year');
  const targetAy = yearSel ? String(yearSel.value || '').trim() : '';
  const years = getUniqueBudgetAcademicYears(getBudgets());

  if (!years.length) {
    showToast('請先建立預算設定', 'error');
    return;
  }
  if (!targetAy) {
    showToast('請選擇目標學年度', 'error');
    return;
  }

  // 按下確認時以目前勾選（或 modal 開啟時 ids）為準，並重新取完整資料
  const ids = (getSelectedHourIds().length ? getSelectedHourIds() : batchModalSelectedIds).slice();
  if (!ids.length) {
    showToast('請先勾選要批次新增的資料', 'error');
    return;
  }

  const plan = planBatchHourCopy({
    sourceIds: ids,
    targetAcademicYear: targetAy,
    hourSettings: getHourSettings(),
    units: getUnits(),
    budgets: getBudgets()
  });

  const sourceSnapshot = new Map(getHourSettings().map(h => [h.id, { ...h }]));
  let result;
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

  const skippedTotal =
    (counters.duplicateSkipped || 0) +
    (counters.invalidUnitSkipped || 0) +
    (counters.outOfBudgetScopeSkipped || 0) +
    (counters.missingSourceSkipped || 0);

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

  populateAcademicYearSelect(item ? item.academicYear : '');

  const start = containerEl.querySelector('#hour-startTime');
  const end = containerEl.querySelector('#hour-endTime');
  const hours = containerEl.querySelector('#hour-hours');
  const wage = containerEl.querySelector('#hour-wage');
  const note = containerEl.querySelector('#hour-note');

  populateScheduleTypeSelect(item ? item.scheduleType : '');
  start.value = item ? item.startTime : '08:00';
  end.value = item ? item.endTime : '21:30';
  hours.value = item ? item.hours : '';
  wage.value = item ? item.hourlyWage : '';
  note.value = item ? (item.note || '') : '';

  if (item) {
    // 編輯：以 academicYear + unitCode 反查預算群組
    populateBudgetGroupSelect('');
    const derived = findBudgetsByYearAndUnit(getBudgets(), item.academicYear, item.unitCode);
    if (derived.status === 'unique') {
      hourEditBudgetStatus = 'ok';
      populateBudgetGroupSelect(budgetOptionValue(derived.budgets[0]));
      populateActualUnitSelect(item.unitCode);
      setHourBudgetHint('');
    } else if (derived.status === 'none') {
      hourEditBudgetStatus = 'none';
      hourEditBlockSave = true;
      populateBudgetGroupSelect('');
      populateActualUnitSelect('');
      setHourBudgetHint('原設定未對應有效預算單位，請重新選擇');
    } else {
      hourEditBudgetStatus = 'multiple';
      hourEditBlockSave = true;
      populateBudgetGroupSelect('');
      populateActualUnitSelect('');
      setHourBudgetHint('此實際單位同時存在於多個預算單位，請先修正預算設定');
      console.warn('[時數設定] unitCode 同時對應多筆預算：', item.unitCode, derived.budgets.map(b => b.id || b.budgetName));
    }
  } else {
    // 新增：三層皆未選
    populateBudgetGroupSelect('');
    populateActualUnitSelect('');
  }

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
  const scheduleType = containerEl.querySelector('#hour-scheduleType').value.trim();
  const unitCode = containerEl.querySelector('#hour-unit').value;
  const budgetVal = containerEl.querySelector('#hour-budget-group')?.value || '';
  const start = containerEl.querySelector('#hour-startTime').value;
  const end = containerEl.querySelector('#hour-endTime').value;
  const hours = containerEl.querySelector('#hour-hours').value;
  const wage = containerEl.querySelector('#hour-wage').value;
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
  if (!unitCode) {
    showToast('請選擇實際單位', 'error');
    return;
  }
  if (!scheduleType) {
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
  if (!selectedBudget.unitCodes.includes(unitCode)) {
    showToast('實際單位不屬於所選預算單位', 'error');
    return;
  }

  // 從 getUnits() 取得 unitName，不允許不存在的單位
  const unit = getUnits().find(u => u.unitCode === unitCode);
  if (!unit) {
    showToast('實際單位已不存在於單位設定', 'error');
    return;
  }
  const unitName = unit.unitName;

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
  if (!wage || isNaN(Number(wage))) {
    showToast('時薪必須為數字', 'error');
    return;
  }

  // 唯一性檢查：同一學年度 + 作息 + 單位 + 週期 + 開館時間
  const key = buildHourSettingDuplicateKey({
    academicYear: ay,
    scheduleType,
    unitCode,
    weekdays: weekdaysStr,
    startTime: start,
    endTime: end
  });
  const dup = getHourSettings().some(h => {
    if (currentEditingId && h.id === currentEditingId) return false;
    return buildHourSettingDuplicateKey(h) === key;
  });

  if (dup) {
    showToast('同一學年度、作息類型、單位、週期、開館時間不可重複', 'error');
    return;
  }

  // 不寫入 budgetId / budgetName
  const wasEditing = Boolean(currentEditingId);
  try { await runWithMutationUiLock([containerEl.querySelector('#hour-save-btn'),containerEl.querySelector('#hour-cancel-btn')],()=>saveHourSetting({
    id: currentEditingId,
    academicYear: ay,
    scheduleType,
    unitCode,
    unitName,
    weekdays: weekdaysStr,
    startTime: start,
    endTime: end,
    hours: Number(hours),
    hourlyWage: Number(wage),
    note
  }));
  renderHourTable(); hideHourModal(); showToast(wasEditing ? '更新成功' : '新增成功'); } catch {}
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
        // 若 hour modal 開啟，也刷新其下拉
        const hourM = containerEl.querySelector('#hour-modal');
        if (hourM && hourM.style.display === 'flex') {
          const cur = containerEl.querySelector('#hour-scheduleType').value;
          populateScheduleTypeSelect(cur);
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

  // 若「新增時數 / 編輯時數」modal 已開啟，刷新作息類型下拉選單
  const hourModal = containerEl.querySelector('#hour-modal');
  if (hourModal && hourModal.style.display === 'flex') {
    const cur = containerEl.querySelector('#hour-scheduleType').value;
    populateScheduleTypeSelect(cur);
  }

  // 不要關閉子視窗
}
