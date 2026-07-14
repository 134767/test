// js/hourSettingPage.js
import {
  getBudgets,
  getUnits,
  getHourSettings,
  saveHourSetting,
  deleteHourSettings,
  isHourSettingUsed,
  getScheduleTypes,
  saveScheduleType,
  deleteScheduleType,
  isScheduleTypeUsed
} from './dataStore.js?v=1.6.0';
import { formatNumber, showToast, formatTimeRange, getWeekdaysArray, arrayToWeekdays, renderPagination } from './utils.js?v=1.6.0';

let containerEl = null;
let currentEditingId = null;
let currentSearch = '';

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
            <div class="form-group">
              <label>作息類型 <span class="required">*</span></label>
              <select id="hour-scheduleType"></select>
            </div>
            <div class="form-group">
              <label>單位 <span class="required">*</span></label>
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
  `;

  bindHourEvents();
  renderHourTable();
}

function bindHourEvents() {
  const searchInput = containerEl.querySelector('#hour-search');
  const addBtn = containerEl.querySelector('#btn-add-hour');
  const delBtn = containerEl.querySelector('#btn-delete-hour');
  const allCheck = containerEl.querySelector('#hour-all-check');

  searchInput.addEventListener('input', () => {
    currentSearch = searchInput.value.trim().toLowerCase();
    renderHourTable();
  });

  addBtn.addEventListener('click', () => showHourModal());
  delBtn.addEventListener('click', handleDeleteSelected);

  const addStypeBtn = containerEl.querySelector('#btn-add-schedule-type');
  if (addStypeBtn) addStypeBtn.addEventListener('click', () => showScheduleTypeModal());

  allCheck.addEventListener('change', (e) => {
    const checked = e.target.checked;
    containerEl.querySelectorAll('#hour-tbody .row-check').forEach(b => b.checked = checked);
  });

  const saveBtn = containerEl.querySelector('#hour-save-btn');
  const cancelBtn = containerEl.querySelector('#hour-cancel-btn');
  const modal = containerEl.querySelector('#hour-modal');

  saveBtn.addEventListener('click', handleSaveHourSetting);
  cancelBtn.addEventListener('click', () => hideHourModal());

  modal.addEventListener('click', (e) => { if (e.target === modal) hideHourModal(); });

  // 學年度變更時刷新單位選項（確保完整列表，不篩選）
  const aySelect = containerEl.querySelector('#hour-academicYear');

  aySelect.addEventListener('change', () => {
    const unitSel = containerEl.querySelector('#hour-unit');
    populateUnitSelect(unitSel ? unitSel.value : '');
  });

  // Schedule type modal bindings (背景點擊不關閉)
  const stModal = containerEl.querySelector('#schedule-type-modal');
  const stSave = containerEl.querySelector('#stype-save-btn');
  const stCancel = containerEl.querySelector('#stype-cancel-btn');
  if (stSave) stSave.addEventListener('click', handleScheduleTypeSave);
  if (stCancel) stCancel.addEventListener('click', () => hideScheduleTypeModal());
  // 故意不綁定背景點擊關閉
}

function populateUnitSelect(selectedCode = '') {
  const sel = containerEl.querySelector('#hour-unit');
  if (!sel) return;

  sel.innerHTML = '<option value="">請選擇單位</option>';

  const units = getUnits();
  units.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.unitCode;
    opt.textContent = `${u.unitCode} - ${u.unitName}`;
    sel.appendChild(opt);
  });

  // 處理編輯時舊單位已不存在於 getUnits() 的情況：臨時加入顯示舊值
  if (selectedCode && !units.some(u => u.unitCode === selectedCode)) {
    const opt = document.createElement('option');
    opt.value = selectedCode;
    opt.textContent = selectedCode + ' (已移除)';
    opt.disabled = true;
    sel.appendChild(opt);
  }

  sel.value = selectedCode || '';
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
      <td><button class="btn-edit" data-id="${item.id}">編輯</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.row-check').forEach(chk => chk.addEventListener('change', updateHourAllCheck));
  tbody.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = getHourSettings().find(h => h.id === btn.dataset.id);
      if (item) showHourModal(item);
    });
  });

  if (allCheck) allCheck.checked = false;
}

function updateHourAllCheck() {
  const allCheck = containerEl.querySelector('#hour-all-check');
  const checks = containerEl.querySelectorAll('#hour-tbody .row-check');
  const all = checks.length > 0 && Array.from(checks).every(c => c.checked);
  if (allCheck) allCheck.checked = all;
}

function getSelectedHourIds() {
  return Array.from(containerEl.querySelectorAll('#hour-tbody .row-check:checked'))
    .map(c => c.dataset.id);
}

function handleDeleteSelected() {
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

  deleteHourSettings(deletable);
  showToast('刪除成功');
  renderHourTable();
}

function populateAcademicYearSelect(selected = '') {
  const sel = containerEl.querySelector('#hour-academicYear');
  sel.innerHTML = '<option value="">請選擇</option>';

  const years = getBudgets().map(b => b.academicYear).sort((a, b) => b.localeCompare(a));
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

  // 設定單位 select（使用 unitCode）
  populateUnitSelect(item ? item.unitCode : '');

  // weekday buttons
  const selDays = item ? getWeekdaysArray(item.weekdays) : [];
  setupWeekdayButtons(selDays);

  modal.style.display = 'flex';
}

function hideHourModal() {
  const modal = containerEl.querySelector('#hour-modal');
  modal.style.display = 'none';
  currentEditingId = null;
}

function handleSaveHourSetting() {
  const ay = containerEl.querySelector('#hour-academicYear').value;
  const scheduleType = containerEl.querySelector('#hour-scheduleType').value.trim();
  const unitCode = containerEl.querySelector('#hour-unit').value;
  const start = containerEl.querySelector('#hour-startTime').value;
  const end = containerEl.querySelector('#hour-endTime').value;
  const hours = containerEl.querySelector('#hour-hours').value;
  const wage = containerEl.querySelector('#hour-wage').value;
  const note = containerEl.querySelector('#hour-note').value.trim();

  const selectedDays = getSelectedWeekdays();
  const weekdaysStr = arrayToWeekdays(selectedDays);

  if (!ay || !scheduleType || !unitCode) {
    showToast('學年度、作息類型、單位均為必填', 'error');
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
  if (!wage || isNaN(Number(wage))) {
    showToast('時薪必須為數字', 'error');
    return;
  }

  // 從 getUnits() 取得 unitName，不允許不存在的單位
  const unit = getUnits().find(u => u.unitCode === unitCode);
  if (!unit) {
    showToast('單位必須來自單位設定', 'error');
    return;
  }
  const unitName = unit.unitName;

  // 唯一性檢查：同一學年度 + 作息 + 單位 + 週期 + 開館時間
  const allSettings = getHourSettings();
  const dup = allSettings.some(h => {
    if (currentEditingId && h.id === currentEditingId) return false;
    return h.academicYear === ay &&
      h.scheduleType === scheduleType &&
      h.unitCode === unitCode &&
      h.weekdays === weekdaysStr &&
      h.startTime === start &&
      h.endTime === end;
  });

  if (dup) {
    showToast('同一學年度、作息類型、單位、週期、開館時間不可重複', 'error');
    return;
  }

  saveHourSetting({
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
  });

  hideHourModal();
  showToast(currentEditingId ? '更新成功' : '新增成功');
  renderHourTable();
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
    delSpan.addEventListener('click', () => {
      if (isScheduleTypeUsed(t.name)) {
        showToast('此作息類型已被時數設定或行事曆使用，請先移除相關資料再刪除', 'error');
        return;
      }
      if (confirm(`確定刪除作息類型「${t.name}」？`)) {
        deleteScheduleType(t.id);
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

function handleScheduleTypeSave() {
  const input = containerEl.querySelector('#stype-name');
  if (!input) return;
  const name = input.value.trim();
  if (!name) {
    showToast('作息類型為必填', 'error');
    return;
  }

  try {
    saveScheduleType({ name });
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
