// js/app.js
// 應用程式主控：初始化、tab 切換、各頁面載入

import { installGasRuntimeCompatibility, formatGasRuntimeError } from './gasRuntimeCompat.js?v=1.6.0-budget-option-dedup-hotfix-8';
import { initDataStore, getDataMode, exportLocalCsvDbSnapshot, resetLocalDataFromCsvDb, subscribeCollection } from './dataStore.js?v=1.6.0-budget-option-dedup-hotfix-8';
import { installDbFeedback, beginDbOperation, endDbOperation } from './dbFeedback.js?v=1.6.0-budget-option-dedup-hotfix-8';
import { AppState, setCurrentTab } from './state.js?v=1.6.0-budget-option-dedup-hotfix-8';
import { initBudgetPage, renderBudgetTable } from './budgetPage.js?v=1.6.0-budget-option-dedup-hotfix-8';
import { initUnitPage, renderUnitTable } from './unitPage.js?v=1.6.0-budget-option-dedup-hotfix-8';
import { initHourSettingPage, renderHourTable } from './hourSettingPage.js?v=1.6.0-budget-option-dedup-hotfix-8';
import { initCalendarPage, renderCalendarTable } from './calendarPage.js?v=1.6.0-budget-option-dedup-hotfix-8';
import { initSalaryEntryPage, renderSalaryEntryPage } from './salaryEntryPage.js?v=1.6.0-budget-option-dedup-hotfix-8';
import { initDifferenceForecastPage, renderDifferenceForecastPage } from './differenceForecastPage.js?v=1.6.0-budget-option-dedup-hotfix-8';
import { installPtb156Enhancements } from './ptb156Enhancements.js?v=1.6.0-budget-option-dedup-hotfix-8';
import { installPtb156cUiSyncPatch } from './ptb156cUiSyncPatch.js?v=1.6.0-budget-option-dedup-hotfix-8';
import { installPtb160UiLayoutHotfix5 } from './ptb160UiLayoutHotfix5.js?v=1.6.0-budget-option-dedup-hotfix-8';

let mainContainer = null;
let tabButtons = {};
let pageContainers = {};
let currentPageInit = {};
let unsubscribeCollectionChanges = null;

function initTabs() {
  const tabBar = document.getElementById('tab-bar');
  mainContainer = document.getElementById('main-content');
  if (!tabBar || !mainContainer) return;
  tabBar.replaceChildren();
  mainContainer.replaceChildren();
  tabButtons = {};
  pageContainers = {};
  currentPageInit = {};

  const tabs = [
    { id: 'salaryEntry', label: '時薪登記' },
    { id: 'differenceForecast', label: '差額與預估' },
    { id: 'calendar', label: '行事曆' },
    { id: 'hour', label: '時數設定' },
    { id: 'unit', label: '單位設定' },
    { id: 'budget', label: '預算設定' }
  ];

  tabs.forEach(tab => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.textContent = tab.label;
    btn.dataset.tab = tab.id;
    btn.addEventListener('click', () => switchTab(tab.id));
    tabBar.appendChild(btn);
    tabButtons[tab.id] = btn;
  });

  ['salaryEntry', 'differenceForecast', 'calendar', 'hour', 'unit', 'budget'].forEach(id => {
    const div = document.createElement('div');
    div.id = `page-${id}`;
    div.className = 'page-container';
    div.style.display = 'none';
    mainContainer.appendChild(div);
    pageContainers[id] = div;
  });
}

function switchTab(tabId) {
  Object.values(tabButtons).forEach(b => b.classList.remove('active'));
  if (tabButtons[tabId]) tabButtons[tabId].classList.add('active');
  Object.values(pageContainers).forEach(p => p.style.display = 'none');

  const target = pageContainers[tabId];
  if (target) target.style.display = 'block';
  setCurrentTab(tabId);

  if (!currentPageInit[tabId]) {
    initPage(tabId, target);
    currentPageInit[tabId] = true;
  } else {
    refreshPage(tabId);
  }
}

function createHourFormRow(index, ...groups) {
  const row = document.createElement('div');
  row.className = 'form-row hour-form-row';
  row.dataset.hourFormRow = String(index);
  groups.forEach(group => row.appendChild(group));
  return row;
}

function applyHourFormSevenRowLayout(root) {
  const modalBody = root?.querySelector('#hour-modal .modal-body');
  if (!modalBody || modalBody.dataset.hourSevenRowLayout === 'true') return;

  const groupFor = selector => modalBody.querySelector(selector)?.closest('.form-group') || null;
  const academicYearGroup = groupFor('#hour-academicYear');
  const budgetGroup = groupFor('#hour-budget-group');
  const scheduleTypeGroup = groupFor('#hour-scheduleType');
  const actualUnitGroup = groupFor('#hour-unit');
  const weekdaysGroup = groupFor('#hour-weekdays');
  const startTimeGroup = groupFor('#hour-startTime');
  const endTimeGroup = groupFor('#hour-endTime');
  const hoursGroup = groupFor('#hour-hours');
  const noteGroup = groupFor('#hour-note');

  const requiredGroups = [
    academicYearGroup,
    budgetGroup,
    scheduleTypeGroup,
    actualUnitGroup,
    weekdaysGroup,
    startTimeGroup,
    endTimeGroup,
    hoursGroup,
    noteGroup
  ];
  if (requiredGroups.some(group => !group)) {
    console.warn('[時數設定] 七列式表單排版套用失敗：缺少必要欄位');
    return;
  }

  modalBody.replaceChildren(
    createHourFormRow(1, academicYearGroup),
    createHourFormRow(2, budgetGroup),
    createHourFormRow(3, scheduleTypeGroup),
    createHourFormRow(4, actualUnitGroup),
    createHourFormRow(5, weekdaysGroup),
    createHourFormRow(6, startTimeGroup, endTimeGroup, hoursGroup),
    createHourFormRow(7, noteGroup)
  );
  modalBody.dataset.hourSevenRowLayout = 'true';
}

function initPage(tabId, container) {
  switch (tabId) {
    case 'budget':
      initBudgetPage(container);
      break;
    case 'unit':
      initUnitPage(container);
      break;
    case 'hour':
      initHourSettingPage(container);
      applyHourFormSevenRowLayout(container);
      break;
    case 'calendar':
      initCalendarPage(container);
      break;
    case 'salaryEntry':
      initSalaryEntryPage(container);
      break;
    case 'differenceForecast':
      initDifferenceForecastPage(container);
      break;
  }
}

function refreshPage(tabId) {
  switch (tabId) {
    case 'budget':
      renderBudgetTable();
      break;
    case 'unit':
      renderUnitTable();
      break;
    case 'hour':
      renderHourTable();
      break;
    case 'calendar':
      renderCalendarTable();
      break;
    case 'salaryEntry':
      renderSalaryEntryPage();
      break;
    case 'differenceForecast':
      renderDifferenceForecastPage();
      break;
  }
}

function setupGlobalClearButton() {
  window.clearWorkStudyData = () => {
    if (confirm('確定清除全部 localStorage 資料並重置？')) {
      localStorage.clear();
      location.reload();
    }
  };

  window.exportWorkStudyCsvDb = () => {
    exportLocalCsvDbSnapshot();
  };

  window.reloadWorkStudyCsvDb = async () => {
    if (!confirm('確定用 db/*.csv 重新載入本地測試 DB？目前 localStorage 暫存資料會被覆蓋。')) return;
    await resetLocalDataFromCsvDb();
    location.reload();
  };

  console.log(`%c[工讀系統] Data mode: ${getDataMode()}`, 'color:#2563eb');
  console.log('%c[工讀系統] console 工具：clearWorkStudyData() 清除本機快取；exportWorkStudyCsvDb() 匯出 CSV 快照；reloadWorkStudyCsvDb() 從 db/*.csv 重新載入本地測試 DB。', 'color:#888');
}

function renderBootstrapFailure(error) {
  const detail = formatGasRuntimeError(error);
  const container = document.getElementById('main-content');
  if (container) {
    const panel = document.createElement('div');
    panel.setAttribute('role', 'alert');
    const title = document.createElement('h2');
    title.textContent = '資料庫載入失敗';
    const message = document.createElement('p');
    message.textContent = detail;
    const hint = document.createElement('p');
    hint.textContent = '請確認 Apps Script 部署版本、Script Properties 與 Sheet schema。';
    panel.append(title, message, hint);
    container.replaceChildren(panel);
  }
}

export async function bootstrap() {
  installGasRuntimeCompatibility();
  installDbFeedback();
  installPtb156cUiSyncPatch();

  const initToken = beginDbOperation('資料載入中', { blocking: true });
  try {
    await initDataStore();
    endDbOperation(initToken, { message: '資料載入完成' });
  } catch (err) {
    const detail = formatGasRuntimeError(err);
    console.error('[DataStore] initialization failed', err);
    endDbOperation(initToken, { error: true, message: `資料載入失敗：${detail}` });
    renderBootstrapFailure(err);
    return;
  }

  initTabs();
  installPtb160UiLayoutHotfix5();
  unsubscribeCollectionChanges?.();
  unsubscribeCollectionChanges = subscribeCollection(() => {
    const tabId = AppState.currentTab;
    if (tabId && currentPageInit[tabId]) refreshPage(tabId);
  });
  installPtb156Enhancements();
  switchTab('salaryEntry');
  if (getDataMode() === 'localStorage') setupGlobalClearButton();
}
