// js/app.js
// 應用程式主控：初始化、tab 切換、各頁面載入

import { installGasRuntimeCompatibility, formatGasRuntimeError } from './gasRuntimeCompat.js?v=1.6.0-calendar-wage-hotfix-2';
import { initDataStore, getDataMode, exportLocalCsvDbSnapshot, resetLocalDataFromCsvDb, subscribeCollection } from './dataStore.js?v=1.6.0-calendar-wage-hotfix-2';
import { installDbFeedback, beginDbOperation, endDbOperation } from './dbFeedback.js?v=1.6.0-calendar-wage-hotfix-2';
import { AppState, setCurrentTab } from './state.js?v=1.6.0-calendar-wage-hotfix-2';
import { initBudgetPage, renderBudgetTable } from './budgetPage.js?v=1.6.0-calendar-wage-hotfix-2';
import { initUnitPage, renderUnitTable } from './unitPage.js?v=1.6.0-calendar-wage-hotfix-2';
import { initHourSettingPage, renderHourTable } from './hourSettingPage.js?v=1.6.0-calendar-wage-hotfix-2';
import { initCalendarPage, renderCalendarTable } from './calendarPage.js?v=1.6.0-calendar-wage-hotfix-2';
import { initSalaryEntryPage, renderSalaryEntryPage } from './salaryEntryPage.js?v=1.6.0-calendar-wage-hotfix-2';
import { initDifferenceForecastPage, renderDifferenceForecastPage } from './differenceForecastPage.js?v=1.6.0-calendar-wage-hotfix-2';
import { installPtb156Enhancements } from './ptb156Enhancements.js?v=1.6.0-calendar-wage-hotfix-2';
import { installPtb156cUiSyncPatch } from './ptb156cUiSyncPatch.js?v=1.6.0-calendar-wage-hotfix-2';

let mainContainer = null;
let tabButtons = {};
let pageContainers = {};
let currentPageInit = {};

function initTabs() {
  const tabBar = document.getElementById('tab-bar');
  if (!tabBar) return;

  const tabs = [
    { id: 'salaryEntry', label: '時薪登記' },
    { id: 'differenceForecast', label: '差額與預估' },
    { id: 'calendar', label: '行事曆' },
    { id: 'unit', label: '單位設定' },
    { id: 'hour', label: '時數設定' },
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

  mainContainer = document.getElementById('main-content');
  ['salaryEntry', 'differenceForecast', 'calendar', 'unit', 'hour', 'budget'].forEach(id => {
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
  subscribeCollection(() => {
    const tabId = AppState.currentTab;
    if (tabId && currentPageInit[tabId]) refreshPage(tabId);
  });
  installPtb156Enhancements();
  switchTab('salaryEntry');
  if (getDataMode() === 'localStorage') setupGlobalClearButton();
}
