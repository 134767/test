// 工讀金 1.5.6：新增時數設定版面與作息類型複選補丁。
// 維持既有資料 schema：新增時將「作息類型 × 單位」展開成各自獨立資料列；編輯時各限單選。

import {
  getScheduleTypes,
  getUnits,
  getHourSettings,
  saveHourSetting,
  getBudgets
} from './dataStore.js?v=1.6.0';
import { renderHourTable } from './hourSettingPage.js?v=1.6.0';
import { showToast, arrayToWeekdays } from './utils.js?v=1.6.0';
import { findBudgetByOptionValue } from './hourBudgetScopeUtils.js?v=1.6.0';

let currentEditingId = null;
let selectedScheduleTypes = new Set();

export function installPtb156HourFormPatch() {
  injectHourFormPatchStyles();

  const main = document.getElementById('main-content');
  if (!main) return;

  const scan = () => enhanceHourForm(main.querySelector('#page-hour'));
  new MutationObserver(scan).observe(main, { childList: true, subtree: true });
  scan();
}

function injectHourFormPatchStyles() {
  if (document.getElementById('ptb-156-hour-form-patch-styles')) return;

  const style = document.createElement('style');
  style.id = 'ptb-156-hour-form-patch-styles';
  style.textContent = `
    .ptb-hour-form-row {
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:12px;
      margin-bottom:14px;
    }
    .ptb-hour-form-row.ptb-hour-form-row-single {
      grid-template-columns:minmax(0,1fr);
    }
    .ptb-hour-form-row .form-group {
      margin:0;
      min-width:0;
    }
    #hour-schedule-type-buttons-v2,
    #hour-unit-buttons-v2,
    #hour-weekdays {
      display:flex;
      flex-wrap:wrap;
      gap:8px;
      align-items:flex-start;
    }
    #hour-schedule-type-buttons-v2 .weekday-btn,
    #hour-unit-buttons-v2 .weekday-btn,
    #hour-weekdays .weekday-btn {
      white-space:normal;
      text-align:center;
    }
    @media (max-width:640px) {
      .ptb-hour-form-row {
        grid-template-columns:minmax(0,1fr);
      }
    }
  `;
  document.head.appendChild(style);
}

function enhanceHourForm(root) {
  if (!root || root.dataset.ptb156HourFormPatched === 'true') return;

  const modal = root.querySelector('#hour-modal');
  const modalBody = modal && modal.querySelector('.modal-body');
  const scheduleSelect = root.querySelector('#hour-scheduleType');
  const unitButtons = root.querySelector('#hour-unit-buttons-v2');
  const saveButton = root.querySelector('#hour-save-btn');

  // 等待既有 1.5.6 增強模組先完成單位按鈕化與儲存按鈕替換。
  if (!modal || !modalBody || !scheduleSelect || !unitButtons || !saveButton) return;

  root.dataset.ptb156HourFormPatched = 'true';
  scheduleSelect.classList.add('ptb-hidden-source');
  scheduleSelect.setAttribute('aria-hidden', 'true');

  const scheduleButtons = document.createElement('div');
  scheduleButtons.id = 'hour-schedule-type-buttons-v2';
  scheduleButtons.className = 'weekday-buttons';
  scheduleSelect.insertAdjacentElement('afterend', scheduleButtons);

  const unitHelp = root.querySelector('#hour-unit-help-v2');
  if (unitHelp) unitHelp.remove();

  arrangeHourFormRows(root, modalBody);
  replaceHourSaveHandler(root, saveButton);
  bindHourFormPatchEvents(root, modal);
  renderScheduleTypeButtons(root);
}

function arrangeHourFormRows(root, modalBody) {
  const academicGroup = closestGroup(root, '#hour-academicYear');
  const budgetGroup = closestGroup(root, '#hour-budget-group');
  const scheduleGroup = closestGroup(root, '#hour-scheduleType');
  const unitGroup = closestGroup(root, '#hour-unit');
  const weekdayGroup = closestGroup(root, '#hour-weekdays');
  const startGroup = closestGroup(root, '#hour-startTime');
  const endGroup = closestGroup(root, '#hour-endTime');
  const hoursGroup = closestGroup(root, '#hour-hours');
  const wageGroup = closestGroup(root, '#hour-wage');
  const noteGroup = closestGroup(root, '#hour-note');

  // 預算單位（budgetName）必須保留在 modal 中，否則 1.6.0 群組範圍會失效
  const orderedGroups = [
    academicGroup,
    budgetGroup,
    scheduleGroup,
    unitGroup,
    weekdayGroup,
    startGroup,
    endGroup,
    hoursGroup,
    wageGroup,
    noteGroup
  ];
  if (orderedGroups.some(group => !group)) return;

  modalBody.replaceChildren(
    makeHourFormRow([academicGroup], true),
    makeHourFormRow([budgetGroup], true),
    makeHourFormRow([scheduleGroup], true),
    makeHourFormRow([unitGroup], true),
    makeHourFormRow([weekdayGroup], true),
    makeHourFormRow([startGroup, endGroup]),
    makeHourFormRow([hoursGroup, wageGroup]),
    makeHourFormRow([noteGroup], true)
  );
}

function closestGroup(root, selector) {
  const element = root.querySelector(selector);
  return element ? element.closest('.form-group') : null;
}

function makeHourFormRow(groups, single = false) {
  const row = document.createElement('div');
  row.className = `ptb-hour-form-row${single ? ' ptb-hour-form-row-single' : ''}`;
  groups.forEach(group => row.appendChild(group));
  return row;
}

function replaceHourSaveHandler(root, saveButton) {
  const replacement = saveButton.cloneNode(true);
  saveButton.replaceWith(replacement);
  replacement.addEventListener('click', () => handlePatchedHourSave(root));
}

function bindHourFormPatchEvents(root, modal) {
  const addButton = root.querySelector('#btn-add-hour');
  if (addButton) {
    addButton.addEventListener('click', () => {
      currentEditingId = null;
      selectedScheduleTypes.clear();
      setTimeout(() => renderScheduleTypeButtons(root), 0);
    });
  }

  root.addEventListener('click', event => {
    const editButton = event.target.closest('.btn-edit[data-id]');
    if (!editButton || !root.contains(editButton)) return;

    currentEditingId = editButton.dataset.id || null;
    const item = getHourSettings().find(row => row.id === currentEditingId);
    selectedScheduleTypes = new Set(item && item.scheduleType ? [item.scheduleType] : []);
    setTimeout(() => renderScheduleTypeButtons(root), 0);
  });

  const cancelButton = root.querySelector('#hour-cancel-btn');
  if (cancelButton) {
    cancelButton.addEventListener('click', () => {
      currentEditingId = null;
      selectedScheduleTypes.clear();
    });
  }

  new MutationObserver(() => {
    if (modal.style.display === 'flex') {
      syncScheduleSelectionFromHiddenSelect(root);
      renderScheduleTypeButtons(root);
    }
  }).observe(modal, { attributes: true, attributeFilter: ['style'] });
}

function syncScheduleSelectionFromHiddenSelect(root) {
  const hiddenSelect = root.querySelector('#hour-scheduleType');
  if (!hiddenSelect) return;

  if (currentEditingId && selectedScheduleTypes.size === 0 && hiddenSelect.value) {
    selectedScheduleTypes.add(hiddenSelect.value);
  }
}

function renderScheduleTypeButtons(root) {
  const wrap = root.querySelector('#hour-schedule-type-buttons-v2');
  const hiddenSelect = root.querySelector('#hour-scheduleType');
  if (!wrap) return;

  syncScheduleSelectionFromHiddenSelect(root);

  const types = getScheduleTypes()
    .map(type => String(type && type.name || '').trim())
    .filter(Boolean);
  const validTypes = new Set(types);
  selectedScheduleTypes = new Set(
    Array.from(selectedScheduleTypes).filter(name => validTypes.has(name))
  );

  wrap.innerHTML = '';
  if (types.length === 0) {
    wrap.innerHTML = '<span style="color:#666;font-size:14px;">請先按「新增作息」建立作息類型</span>';
    if (hiddenSelect) hiddenSelect.value = '';
    return;
  }

  types.forEach(name => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'weekday-btn';
    button.dataset.value = name;
    button.textContent = name;
    button.classList.toggle('active', selectedScheduleTypes.has(name));

    button.addEventListener('click', () => {
      if (currentEditingId) {
        selectedScheduleTypes.clear();
        selectedScheduleTypes.add(name);
      } else if (selectedScheduleTypes.has(name)) {
        selectedScheduleTypes.delete(name);
      } else {
        selectedScheduleTypes.add(name);
      }

      if (hiddenSelect) hiddenSelect.value = Array.from(selectedScheduleTypes)[0] || '';
      renderScheduleTypeButtons(root);
    });

    wrap.appendChild(button);
  });

  if (hiddenSelect) hiddenSelect.value = Array.from(selectedScheduleTypes)[0] || '';
}

function handlePatchedHourSave(root) {
  const academicYear = valueOf(root, '#hour-academicYear');
  const startTime = valueOf(root, '#hour-startTime');
  const endTime = valueOf(root, '#hour-endTime');
  const hoursRaw = valueOf(root, '#hour-hours');
  const wageRaw = valueOf(root, '#hour-wage');
  const note = valueOf(root, '#hour-note').trim();

  const scheduleTypes = Array.from(
    root.querySelectorAll('#hour-schedule-type-buttons-v2 .weekday-btn.active')
  ).map(button => String(button.dataset.value || '').trim()).filter(Boolean);

  const unitCodes = Array.from(
    root.querySelectorAll('#hour-unit-buttons-v2 .weekday-btn.active')
  ).map(button => String(button.dataset.value || '').trim()).filter(Boolean);

  const selectedDays = Array.from(root.querySelectorAll('#hour-weekdays .weekday-btn.active'))
    .map(button => button.dataset.day);

  const budgetVal = valueOf(root, '#hour-budget-group');
  if (!academicYear) {
    showToast('請選擇學年度', 'error');
    return;
  }
  if (!budgetVal) {
    showToast('請選擇單位', 'error');
    return;
  }
  if (scheduleTypes.length === 0 || unitCodes.length === 0) {
    showToast('學年度、作息類型、實際單位均為必填', 'error');
    return;
  }
  if (currentEditingId && (scheduleTypes.length !== 1 || unitCodes.length !== 1)) {
    showToast('編輯既有時數設定時，作息類型與實際單位都只能選擇一個', 'error');
    return;
  }
  if (selectedDays.length === 0) {
    showToast('至少選擇一個週期類型（星期）', 'error');
    return;
  }
  if (!startTime || !endTime || startTime >= endTime) {
    showToast('開始時間必須小於結束時間', 'error');
    return;
  }
  if (!hoursRaw || Number.isNaN(Number(hoursRaw))) {
    showToast('時數必須為數字', 'error');
    return;
  }
  if (!wageRaw || Number.isNaN(Number(wageRaw))) {
    showToast('時薪必須為數字', 'error');
    return;
  }

  const selectedBudget = findBudgetByOptionValue(getBudgets(), budgetVal, academicYear);
  if (!selectedBudget || String(selectedBudget.academicYear) !== String(academicYear)) {
    showToast('選擇的單位不屬於目前學年度', 'error');
    return;
  }
  const allowed = new Set(selectedBudget.unitCodes || []);
  const outOfScope = unitCodes.find(code => !allowed.has(code));
  if (outOfScope) {
    showToast('實際單位不屬於所選預算單位', 'error');
    return;
  }

  const weekdays = arrayToWeekdays(selectedDays);
  const unitMap = new Map(getUnits().map(unit => [unit.unitCode, unit]));
  const invalidUnitCode = unitCodes.find(code => !unitMap.has(code));
  if (invalidUnitCode) {
    showToast('實際單位已不存在於單位設定', 'error');
    return;
  }

  const combinations = [];
  scheduleTypes.forEach(scheduleType => {
    unitCodes.forEach(unitCode => combinations.push({ scheduleType, unitCode }));
  });

  const existing = getHourSettings();
  const duplicates = combinations.filter(combination => existing.some(item => {
    if (currentEditingId && item.id === currentEditingId) return false;
    return item.academicYear === academicYear &&
      item.scheduleType === combination.scheduleType &&
      item.unitCode === combination.unitCode &&
      item.weekdays === weekdays &&
      item.startTime === startTime &&
      item.endTime === endTime;
  }));

  if (duplicates.length > 0) {
    const labels = duplicates.map(({ scheduleType, unitCode }) => {
      const unit = unitMap.get(unitCode);
      return `${scheduleType}／${unit ? unit.unitName : unitCode}`;
    });
    showToast(`以下組合已有相同時數設定：${labels.join('、')}`, 'error');
    return;
  }

  combinations.forEach((combination, index) => {
    const unit = unitMap.get(combination.unitCode);
    saveHourSetting({
      id: currentEditingId && index === 0 ? currentEditingId : null,
      academicYear,
      scheduleType: combination.scheduleType,
      unitCode: combination.unitCode,
      unitName: unit.unitName,
      weekdays,
      startTime,
      endTime,
      hours: Number(hoursRaw),
      hourlyWage: Number(wageRaw),
      note
    });
  });

  const wasEditing = Boolean(currentEditingId);
  const cancelButton = root.querySelector('#hour-cancel-btn');
  if (cancelButton) cancelButton.click();
  renderHourTable();
  showToast(wasEditing ? '更新成功' : `新增成功（${combinations.length} 筆時數設定）`);
}

function valueOf(root, selector) {
  const element = root.querySelector(selector);
  return element ? String(element.value || '') : '';
}
