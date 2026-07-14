// js/differenceForecastPage.js
// 差額與預估頁：獨立三欄分析頁面（目前 / 過去 / 未來），僅分析不回寫

import {
  getAcademicYears,
  getBudgets,
  getCalendarRows,
  getSalaryEntries,
  getSalaryEntriesByAcademicYear,
  getSalaryEntriesByDateRange,
  getForecastEvaluations,
  saveForecastEvaluation,
  deleteForecastEvaluation,
  generateForecastEvaluationId
} from './dataStore.js?v=1.6.0';
import { formatNumber, showToast, escapeHtml } from './utils.js?v=1.6.0';
import { validateRocAcademicYear } from './budgetGroupUtils.js?v=1.6.0';

// ===== 模組狀態 =====
let containerEl = null;

let currentFilter = {
  mode: 'academicYear', // 'academicYear' | 'dateRange'
  academicYear: '',
  startYm: '',
  endYm: ''
};

let pastFilter = {
  mode: 'academicYear',
  academicYear: '',
  startYm: '',
  endYm: ''
};

let currentResult = null;
let pastResult = null;

let futureResult = null;

// 目前載入的未來評估方案（來自 workStudy_forecastEvaluations）
let currentEvaluation = null; // { id, name, budget, intervals: [...] } or null  （已移除重複的 baseHourlyWage，由區間預估時薪完全取代）
let activeForecastEvaluationId = '';

// ===== 輔助計算函式（全部定義在本檔） =====

export function getYmFromDate(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  if (parts.length < 2) return '';
  const y = parts[0];
  const m = parts[1].padStart(2, '0');
  return `${y}-${m}`;
}

export function compareYm(a, b) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function getMonthsBetweenRows(rows) {
  const set = new Set();
  (rows || []).forEach(r => {
    const ym = getYmFromDate(r.date);
    if (ym) set.add(ym);
  });
  return Array.from(set).sort(compareYm);
}

export function filterCalendarRowsByAcademicYear(rows, academicYear) {
  if (!academicYear) return [];
  const ay = String(academicYear);
  return (rows || []).filter(r => String(r.academicYear) === ay);
}

export function filterCalendarRowsByDateRange(rows, startYm, endYm) {
  return (rows || []).filter(r => {
    const ym = getYmFromDate(r.date);
    if (!ym) return false;
    if (startYm && ym < startYm) return false;
    if (endYm && ym > endYm) return false;
    return true;
  });
}

export function filterSalaryEntriesByAcademicYear(entries, academicYear) {
  // 優先使用 dataStore 提供的，保持一致
  if (!academicYear) return [];
  return getSalaryEntriesByAcademicYear(academicYear);
}

export function filterSalaryEntriesByDateRange(entries, startYm, endYm) {
  if (!startYm && !endYm) return [...(entries || [])];
  return getSalaryEntriesByDateRange(startYm, endYm);
}

export function getBudgetTotalByAcademicYears(academicYears) {
  if (!academicYears || academicYears.length === 0) return 0;
  const budgets = getBudgets();
  return academicYears.reduce((sum, ay) => {
    return sum + budgets
      .filter(budget => String(budget.academicYear) === String(ay))
      .reduce((yearSum, budget) => yearSum + (Number(budget.budgetAmount) || 0), 0);
  }, 0);
}

export function getRiskStatus(usedAmount, totalBudget) {
  const used = Number(usedAmount) || 0;
  const total = Number(totalBudget) || 0;
  if (total <= 0) return 'unknown';
  if (used > total) return 'over';
  const remaining = total - used;
  const ratio = remaining / total;
  if (ratio <= 0.1) return 'danger';
  if (ratio <= 0.25) return 'watch';
  return 'safe';
}

export function renderRiskBadge(status) {
  const map = {
    safe: { text: '安全', cls: 'risk-safe' },
    watch: { text: '注意', cls: 'risk-watch' },
    danger: { text: '高風險', cls: 'risk-danger' },
    over: { text: '超支', cls: 'risk-over' },
    unknown: { text: '無預算資料', cls: 'risk-unknown' }
  };
  const info = map[status] || { text: status, cls: '' };
  return `<span class="risk-badge ${info.cls}">${info.text}</span>`;
}

function getCalendarMonthlyHours() {
  // 重用 getCalendarRows 取得行事曆資料，彙總每個月份的預估時數（有效作息時數加總）
  const rows = getCalendarRows();
  const map = new Map();
  (rows || []).forEach(r => {
    const ym = getYmFromDate(r.date);
    if (ym) {
      const h = Number(r.hours) || 0;
      map.set(ym, (map.get(ym) || 0) + h);
    }
  });
  return map;
}

// ===== 新增輔助函式（全部在本檔內） =====
function pad2(n) {
  return String(n).padStart(2, '0');
}

function isValidYm(ym) {
  const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return false;
  const mm = Number(m[2]);
  return mm >= 1 && mm <= 12;
}

function addMonthsToYm(ym, offset) {
  if (!isValidYm(ym)) return '';
  const [yStr, mStr] = ym.split('-');
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) return '';
  m = m + offset;
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1) { m += 12; y -= 1; }
  return `${y}-${pad2(m)}`;
}

function enumerateMonthRange(startYm, endYm) {
  const list = [];
  if (!isValidYm(startYm) || !isValidYm(endYm) || startYm > endYm) return list;
  let cur = startYm;
  let guard = 0;
  while (cur <= endYm && guard < 240) {
    list.push(cur);
    cur = addMonthsToYm(cur, 1);
    if (!cur) break;
    guard += 1;
  }
  return list;
}

function getAcademicYearMonthRange(academicYear) {
  if (!academicYear) return [];
  const ay = String(academicYear).trim();
  const numAy = parseInt(ay, 10);
  if (isNaN(numAy)) return [];
  const startYear = numAy + 1911;
  const startYm = `${startYear}-08`;
  const endYm = `${startYear + 1}-07`;
  return enumerateMonthRange(startYm, endYm);
}

function getNextYm(ym) {
  return addMonthsToYm(ym, 1);
}

function getDefaultFutureStartYm(currResult) {
  const cr = currResult || {};
  // 優先使用目前欄的 endYm 的下一個月
  if (cr.endYm) {
    const next = getNextYm(cr.endYm);
    if (next) return next;
  }
  // 若目前是 AY，則用該 AY 結束後的下一個月
  if (cr.mode === 'academicYear' && cr.academicYear) {
    const months = getAcademicYearMonthRange(cr.academicYear);
    if (months.length > 0) {
      const next = getNextYm(months[months.length - 1]);
      if (next) return next;
    }
  }
  // fallback: 目前年月
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return `${y}-${pad2(m)}`;
}

function buildActualMonthlyDetails(filteredRows, filteredEntries, monthList) {
  const details = [];
  const rowEstHours = new Map();
  const rowEstAmount = new Map();
  const salActualHours = new Map();
  const salActualAmount = new Map();

  (filteredRows || []).forEach(r => {
    const ym = getYmFromDate(r.date);
    if (!ym) return;
    const h = Number(r.hours) || 0;
    const amt = h * (Number(r.hourlyWage) || 0);
    rowEstHours.set(ym, (rowEstHours.get(ym) || 0) + h);
    rowEstAmount.set(ym, (rowEstAmount.get(ym) || 0) + amt);
  });

  (filteredEntries || []).forEach(e => {
    const ym = `${e.year}-${pad2(e.month)}`;
    const h = Number(e.actualHours) || 0;
    const amt = Number(e.actualAmount) || 0;
    salActualHours.set(ym, (salActualHours.get(ym) || 0) + h);
    salActualAmount.set(ym, (salActualAmount.get(ym) || 0) + amt);
  });

  (monthList || []).forEach(ym => {
    const estH = rowEstHours.get(ym) || 0;
    const estA = rowEstAmount.get(ym) || 0;
    const actH = salActualHours.get(ym) || 0;
    const actA = salActualAmount.get(ym) || 0;
    details.push({
      ym,
      estimatedHours: estH,
      estimatedAmount: estA,
      actualHours: actH,
      actualAmount: actA,
      diffAmount: estA - actA
    });
  });

  return details;
}

function buildFutureMonthlyDetails(fcfg, fResult) {
  const details = [];
  const startYm = fcfg.startYm || '';
  const months = Math.max(0, Number(fcfg.months) || 0);
  const hourly = Number(fcfg.hourlyWage) || 0;
  const monthlyH = Math.max(0, Number(fcfg.monthlyHours) || 0);
  const totalBudget = Number(fcfg.budget) || 0;

  if (!startYm || months <= 0) return details;

  let accumulated = 0;
  let curYm = startYm;

  for (let i = 0; i < months; i++) {
    const monthlyEst = hourly * monthlyH;
    accumulated += monthlyEst;
    const remaining = totalBudget - accumulated;
    const risk = getRiskStatus(accumulated, totalBudget);
    details.push({
      ym: curYm,
      hourlyWage: hourly,
      monthlyHours: monthlyH,
      monthlyEstimatedAmount: monthlyEst,
      accumulatedEstimatedAmount: accumulated,
      remainingBudget: remaining,
      riskStatus: risk
    });
    curYm = getNextYm(curYm);
    if (!curYm) break;
  }
  return details;
}

// 依 intervals 展開未來月份明細（後面 interval 覆蓋前面重疊月份）
// 預估時數來自行事曆（getCalendarRows 彙總），預估支出 = 時數 × 區間預估時薪
// 已移除重複的「全域預估時薪」，全部由區間預估時薪決定（未涵蓋月份視為 0）
function buildFutureMonthlyFromIntervals(budget, intervals) {
  const ymMap = new Map(); // ym -> {hourlyWage, note}

  (intervals || []).forEach((interval) => {
    const s = interval.startYm;
    const e = interval.endYm;
    if (!s || !e || s > e) return;
    const hw = Number(interval.hourlyWage) || 0;
    const note = interval.note || '';
    let cur = s;
    while (cur <= e) {
      // 後面的 interval 覆蓋前面的（依儲存順序）
      ymMap.set(cur, { hourlyWage: hw, note });
      cur = getNextYm(cur);
      if (!cur) break;
    }
  });

  const hoursMap = getCalendarMonthlyHours();
  const yms = Array.from(ymMap.keys()).sort(compareYm);
  const details = [];
  let accumulated = 0;
  const totalBudget = Number(budget) || 0;

  yms.forEach(ym => {
    const info = ymMap.get(ym) || { hourlyWage: 0, note: '' };
    const hw = Number(info.hourlyWage) || 0;
    const monthlyH = hoursMap.get(ym) || 0;  // 行事曆該月有效作息時數加總，無資料則 0
    const monthlyEst = hw * monthlyH;
    accumulated += monthlyEst;
    const remaining = totalBudget - accumulated;
    const risk = getRiskStatus(accumulated, totalBudget);
    details.push({
      ym,
      hourlyWage: hw,
      monthlyHours: monthlyH,
      monthlyEstimatedAmount: monthlyEst,
      accumulatedEstimatedAmount: accumulated,
      remainingBudget: remaining,
      riskStatus: risk,
      note: info.note || ''
    });
  });

  return details;
}

// ===== 核心計算 =====

function calculateActualPanelResult(config) {
  const allRows = getCalendarRows();
  const allEntries = getSalaryEntries();

  let filteredRows = [];
  let filteredEntries = [];
  let involvedAYs = [];

  if (config.mode === 'academicYear' && config.academicYear) {
    filteredRows = filterCalendarRowsByAcademicYear(allRows, config.academicYear);
    filteredEntries = filterSalaryEntriesByAcademicYear(allEntries, config.academicYear);
    involvedAYs = [config.academicYear];
  } else if (config.mode === 'dateRange' && config.startYm && config.endYm) {
    filteredRows = filterCalendarRowsByDateRange(allRows, config.startYm, config.endYm);
    filteredEntries = filterSalaryEntriesByDateRange(allEntries, config.startYm, config.endYm);
    involvedAYs = [...new Set(filteredRows.map(r => r.academicYear).filter(Boolean))];
  } else {
    return createZeroResult();
  }

  const totalBudget = getBudgetTotalByAcademicYears(involvedAYs);
  const estimatedAmount = filteredRows.reduce((s, r) => s + (Number(r.hours) || 0) * (Number(r.hourlyWage) || 0), 0);
  const actualAmount = filteredEntries.reduce((s, e) => s + (Number(e.actualAmount) || 0), 0);

  const diffAmount = estimatedAmount - actualAmount;
  const remainingBudget = totalBudget - actualAmount;
  const riskStatus = getRiskStatus(actualAmount, totalBudget);

  const totalHours = filteredRows.reduce((s, r) => s + (Number(r.hours) || 0), 0);
  const monthsList = getMonthsBetweenRows(filteredRows);
  const monthCount = monthsList.length || 1;
  const avgHourly = totalHours > 0 ? (estimatedAmount / totalHours) : 0;

  // 產生完整月份清單（依模式）
  let monthListForDetail = [];
  if (config.mode === 'academicYear' && config.academicYear) {
    monthListForDetail = getAcademicYearMonthRange(config.academicYear);
  } else if (config.mode === 'dateRange' && config.startYm && config.endYm) {
    monthListForDetail = enumerateMonthRange(config.startYm, config.endYm);
  } else {
    monthListForDetail = monthsList;
  }

  const monthlyDetails = buildActualMonthlyDetails(filteredRows, filteredEntries, monthListForDetail);

  return {
    totalBudget,
    estimatedAmount,
    actualAmount,
    diffAmount,
    remainingBudget,
    riskStatus,
    totalHours,
    monthCount,
    avgHourly,
    involvedAYs,
    mode: config.mode,
    academicYear: config.academicYear || '',
    startYm: config.startYm || '',
    endYm: config.endYm || '',
    monthlyDetails
  };
}

function createZeroResult() {
  return {
    totalBudget: 0,
    estimatedAmount: 0,
    actualAmount: 0,
    diffAmount: 0,
    remainingBudget: 0,
    riskStatus: 'unknown',
    totalHours: 0,
    monthCount: 1,
    avgHourly: 0,
    involvedAYs: [],
    mode: '',
    academicYear: '',
    startYm: '',
    endYm: '',
    monthlyDetails: []
  };
}

function calculateFuturePanelResult(currResult, fcfgOrEval) {
  // 支援舊 fcfg 或直接用 currentEvaluation
  let budget = 0;
  let intervals = [];

  if (currentEvaluation && currentEvaluation.id) {
    budget = Number(currentEvaluation.budget) || 0;
    intervals = Array.isArray(currentEvaluation.intervals) ? currentEvaluation.intervals : [];
  } else if (fcfgOrEval && Array.isArray(fcfgOrEval.intervals)) {
    budget = Number(fcfgOrEval.budget) || 0;
    intervals = fcfgOrEval.intervals;
  } else if (fcfgOrEval && fcfgOrEval.budget !== undefined) {
    // 舊結構 fallback（開發過渡用）
    budget = Number(fcfgOrEval.budget) || 0;
  }

  const monthlyDetails = buildFutureMonthlyFromIntervals(budget, intervals);

  // 總預估支出由明細累加而得（使用行事曆時數 × 區間預估時薪）
  const futureEstimatedAmount = (monthlyDetails || []).reduce((sum, d) => {
    return sum + (Number(d.monthlyEstimatedAmount) || 0);
  }, 0);

  const futureRemainingBudget = budget - futureEstimatedAmount;
  const riskStatus = getRiskStatus(futureEstimatedAmount, budget);

  return {
    futureBudget: budget,
    futureEstimatedAmount,
    futureRemainingBudget,
    riskStatus,
    monthlyDetails
  };
}

// ===== 預設與初始化 =====

function getLatestAcademicYear() {
  const years = getAcademicYears();
  if (years.length > 0) return years[0];
  return '';
}

function populateAcademicYearSelect(selectEl, selected = '') {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  const years = getAcademicYears();
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === selected) opt.selected = true;
    selectEl.appendChild(opt);
  });
  if (!selected && years.length > 0) {
    selectEl.value = years[0];
  }
}

function updatePanelFilterUI(panel) {
  // panel: 'current' | 'past'
  const prefix = panel === 'current' ? '' : '-past';
  const modeSel = containerEl.querySelector(`#forecast-filter-mode${prefix}`);
  const yearGroup = containerEl.querySelector(`#forecast-year-group${prefix}`);
  const range1 = containerEl.querySelector(`#forecast-date-range-group${prefix}`);
  const range2 = containerEl.querySelector(`#forecast-date-range-group2${prefix}`);

  if (!modeSel || !yearGroup || !range1 || !range2) return;

  if (modeSel.value === 'academicYear') {
    yearGroup.style.display = '';
    range1.style.display = 'none';
    range2.style.display = 'none';
  } else {
    yearGroup.style.display = 'none';
    range1.style.display = '';
    range2.style.display = '';
  }
}

function setInitialFilters() {
  const latest = getLatestAcademicYear();

  // 目前預設最新學年度
  currentFilter = {
    mode: 'academicYear',
    academicYear: latest,
    startYm: '',
    endYm: ''
  };

  // 過去預設也為最新（使用者可手動切換過去學年度比對）
  pastFilter = {
    mode: 'academicYear',
    academicYear: latest,
    startYm: '',
    endYm: ''
  };
}

function initDefaultFutureConfigFromCurrent() {
  // 舊版未來 config 已停用，未來評估改由 currentEvaluation + intervals 驅動
  if (!currentResult) {
    currentResult = calculateActualPanelResult(currentFilter);
  }
}

// ===== 事件綁定 =====

function bindEvents() {
  if (!containerEl) return;

  // ===== 目前欄 =====
  const currMode = containerEl.querySelector('#forecast-filter-mode');
  const currYear = containerEl.querySelector('#forecast-filter-year');
  const currStart = containerEl.querySelector('#forecast-filter-start');
  const currEnd = containerEl.querySelector('#forecast-filter-end');
  const currQuery = containerEl.querySelector('#btn-query-current');

  if (currMode) {
    currMode.addEventListener('change', () => {
      updatePanelFilterUI('current');
    });
  }
  if (currQuery) {
    currQuery.addEventListener('click', () => handleQueryCurrent());
  }

  // ===== 過去欄 =====
  const pastMode = containerEl.querySelector('#forecast-filter-mode-past');
  const pastYear = containerEl.querySelector('#forecast-filter-year-past');
  const pastStart = containerEl.querySelector('#forecast-filter-start-past');
  const pastEnd = containerEl.querySelector('#forecast-filter-end-past');
  const pastQuery = containerEl.querySelector('#btn-query-past');

  if (pastMode) {
    pastMode.addEventListener('change', () => {
      updatePanelFilterUI('past');
    });
  }
  if (pastQuery) {
    pastQuery.addEventListener('click', () => handleQueryPast());
  }

  // ===== 未來評估 modal 開啟 =====
  const openModalBtn = containerEl.querySelector('#btn-open-forecast-modal');
  if (openModalBtn) {
    openModalBtn.addEventListener('click', () => openForecastEvalModal());
  }
}

function syncFilterUI() {
  // 同步目前欄 UI
  const currMode = containerEl.querySelector('#forecast-filter-mode');
  const currYear = containerEl.querySelector('#forecast-filter-year');
  const currStart = containerEl.querySelector('#forecast-filter-start');
  const currEnd = containerEl.querySelector('#forecast-filter-end');

  if (currMode) currMode.value = currentFilter.mode;
  if (currYear) populateAcademicYearSelect(currYear, currentFilter.academicYear);
  if (currStart) currStart.value = currentFilter.startYm || '';
  if (currEnd) currEnd.value = currentFilter.endYm || '';

  updatePanelFilterUI('current');

  // 同步過去欄 UI
  const pastMode = containerEl.querySelector('#forecast-filter-mode-past');
  const pastYear = containerEl.querySelector('#forecast-filter-year-past');
  const pastStart = containerEl.querySelector('#forecast-filter-start-past');
  const pastEnd = containerEl.querySelector('#forecast-filter-end-past');

  if (pastMode) pastMode.value = pastFilter.mode;
  if (pastYear) populateAcademicYearSelect(pastYear, pastFilter.academicYear);
  if (pastStart) pastStart.value = pastFilter.startYm || '';
  if (pastEnd) pastEnd.value = pastFilter.endYm || '';

  updatePanelFilterUI('past');
}

function applyFilterFromUI(panel) {
  const isCurrent = panel === 'current';
  const prefix = isCurrent ? '' : '-past';
  const filterRef = isCurrent ? currentFilter : pastFilter;

  const modeSel = containerEl.querySelector(`#forecast-filter-mode${prefix}`);
  const yearSel = containerEl.querySelector(`#forecast-filter-year${prefix}`);
  const startInp = containerEl.querySelector(`#forecast-filter-start${prefix}`);
  const endInp = containerEl.querySelector(`#forecast-filter-end${prefix}`);

  if (!modeSel) return;

  filterRef.mode = modeSel.value;

  if (filterRef.mode === 'academicYear') {
    filterRef.academicYear = yearSel ? yearSel.value : '';
    filterRef.startYm = '';
    filterRef.endYm = '';
    if (!validateRocAcademicYear(filterRef.academicYear)) {
      showToast('請選擇合法學年度（ROC）', 'error');
      return false;
    }
  } else {
    const s = startInp ? startInp.value : '';
    const e = endInp ? endInp.value : '';
    if (!isValidYm(s) || !isValidYm(e) || s > e) {
      showToast('請輸入合法的年月區間（YYYY-MM，起始 ≤ 結束）', 'error');
      return false;
    }
    filterRef.startYm = s;
    filterRef.endYm = e;
    filterRef.academicYear = '';
  }
  return true;
}

function handleQueryCurrent() {
  if (!applyFilterFromUI('current')) return;
  currentResult = calculateActualPanelResult(currentFilter);

  // 未來評估獨立，僅更新目前結果與比對表（modal 開啟時會用最新 currentResult 帶預設）
  renderCurrentPanel();
  renderFuturePanel();
  renderComparisonTable();
}

function handleQueryPast() {
  if (!applyFilterFromUI('past')) return;
  pastResult = calculateActualPanelResult(pastFilter);
  renderPastPanel();
  renderFuturePanel();
  renderComparisonTable();
}

function syncFutureInputs() {
  // 舊未來輸入已移除，現在使用 modal + currentEvaluation
}

function handleInitialCompute() {
  // 自動計算目前與過去的初始結果
  currentResult = calculateActualPanelResult(currentFilter);
  pastResult = calculateActualPanelResult(pastFilter);

  // 未來改由 currentEvaluation 驅動（初始尚未有評估）
  futureResult = calculateFuturePanelResult(currentResult);
}

// ===== RENDER =====

function renderCurrentPanel() {
  if (!containerEl || !currentResult) return;
  const el = containerEl.querySelector('#current-summary');
  if (!el) return;

  const r = currentResult;
  const title = r.mode === 'academicYear' && r.academicYear
    ? `學年度：${r.academicYear}`
    : (r.startYm && r.endYm ? `區間：${r.startYm} ~ ${r.endYm}` : '未設定範圍');

  el.innerHTML = `
    <div style="margin-top:6px;font-size:13px;color:#666;">${title}</div>
    <div class="forecast-detail-title">區間月份明細</div>
    ${renderActualMonthlyDetails(r.monthlyDetails || [])}
  `;
}

function renderPastPanel() {
  if (!containerEl || !pastResult) return;
  const el = containerEl.querySelector('#past-summary');
  if (!el) return;

  const r = pastResult;
  const title = r.mode === 'academicYear' && r.academicYear
    ? `學年度：${r.academicYear}`
    : (r.startYm && r.endYm ? `區間：${r.startYm} ~ ${r.endYm}` : '未設定範圍');

  el.innerHTML = `
    <div style="margin-top:6px;font-size:13px;color:#666;">${title}</div>
    <div class="forecast-detail-title">區間月份明細</div>
    ${renderActualMonthlyDetails(r.monthlyDetails || [])}
  `;
}

function renderFuturePanel() {
  if (!containerEl) return;
  futureResult = calculateFuturePanelResult(currentResult || createZeroResult());

  const evalNameEl = containerEl.querySelector('#future-current-eval');
  if (evalNameEl) {
    if (currentEvaluation && currentEvaluation.name) {
      evalNameEl.textContent = `目前評估：${currentEvaluation.name}`;
    } else {
      evalNameEl.textContent = '目前評估：尚未建立評估';
    }
  }

  const el = containerEl.querySelector('#future-summary');
  if (!el) return;

  const r = futureResult;

  el.innerHTML = `
    <div class="forecast-detail-title">區間月份明細</div>
    ${renderFutureMonthlyDetails(r.monthlyDetails || [])}
  `;
}

function renderComparisonTable() {
  const tbody = containerEl ? containerEl.querySelector('#forecast-compare-tbody') : null;
  if (!tbody) return;

  const c = currentResult || createZeroResult();
  const p = pastResult || createZeroResult();
  futureResult = calculateFuturePanelResult(c);
  const f = futureResult;

  const makeNeg = (v) => (v < 0 ? 'negative' : '');

  tbody.innerHTML = `
    <tr>
      <td>總預算</td>
      <td class="numeric">${formatNumber(c.totalBudget)}</td>
      <td class="numeric">${formatNumber(p.totalBudget)}</td>
      <td class="numeric">${formatNumber(f.futureBudget)}</td>
    </tr>
    <tr>
      <td>預估支出</td>
      <td class="numeric">${formatNumber(c.estimatedAmount)}</td>
      <td class="numeric">${formatNumber(p.estimatedAmount)}</td>
      <td class="numeric">${formatNumber(f.futureEstimatedAmount)}</td>
    </tr>
    <tr>
      <td>實際核銷</td>
      <td class="numeric">${formatNumber(c.actualAmount)}</td>
      <td class="numeric">${formatNumber(p.actualAmount)}</td>
      <td class="numeric">-</td>
    </tr>
    <tr>
      <td>差額</td>
      <td class="numeric ${makeNeg(c.diffAmount)}">${formatNumber(c.diffAmount)}</td>
      <td class="numeric ${makeNeg(p.diffAmount)}">${formatNumber(p.diffAmount)}</td>
      <td class="numeric ${makeNeg(f.futureEstimatedAmount)}">${formatNumber(f.futureEstimatedAmount)}</td>
    </tr>
    <tr>
      <td>剩餘預算</td>
      <td class="numeric ${makeNeg(c.remainingBudget)}">${formatNumber(c.remainingBudget)}</td>
      <td class="numeric ${makeNeg(p.remainingBudget)}">${formatNumber(p.remainingBudget)}</td>
      <td class="numeric ${makeNeg(f.futureRemainingBudget)}">${formatNumber(f.futureRemainingBudget)}</td>
    </tr>
    <tr>
      <td>風險狀態</td>
      <td>${renderRiskBadge(c.riskStatus)}</td>
      <td>${renderRiskBadge(p.riskStatus)}</td>
      <td>${renderRiskBadge(f.riskStatus)}</td>
    </tr>
  `;
}

function renderActualMonthlyDetails(details) {
  if (!details || details.length === 0) {
    return `<div style="font-size:14px;color:#888;margin-top:4px;">尚無月份資料</div>`;
  }
  let rows = '';
  details.forEach(d => {
    const neg = d.diffAmount < 0 ? 'negative' : '';
    rows += `
      <tr>
        <td>${d.ym}</td>
        <td class="numeric">${formatNumber(d.estimatedHours)}</td>
        <td class="numeric">${formatNumber(d.estimatedAmount)}</td>
        <td class="numeric">${formatNumber(d.actualAmount)}</td>
        <td class="numeric ${neg}">${formatNumber(d.diffAmount)}</td>
      </tr>
    `;
  });
  return `
    <div class="forecast-month-table-wrapper">
      <table class="forecast-month-table">
        <thead>
          <tr>
            <th>月份</th>
            <th class="numeric" title="行事曆預估時數">行事曆<br>預估時數</th>
            <th class="numeric" title="行事曆預估支出">行事曆<br>預估支出</th>
            <th class="numeric" title="實際核銷薪資">實際<br>核銷薪資</th>
            <th class="numeric" title="預估與核銷差額">預估與<br>核銷差額</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderFutureMonthlyDetails(details) {
  if (!details || details.length === 0) {
    return `<div style="font-size:14px;color:#888;margin-top:4px;">尚無月份資料</div>`;
  }
  let rows = '';
  details.forEach(d => {
    const neg = d.remainingBudget < 0 ? 'negative' : '';
    rows += `
      <tr>
        <td>${d.ym}</td>
        <td class="numeric">${formatNumber(d.hourlyWage)}</td>
        <td class="numeric">${formatNumber(d.monthlyEstimatedAmount)}</td>
        <td class="numeric">${formatNumber(d.accumulatedEstimatedAmount)}</td>
        <td class="numeric ${neg}">${formatNumber(d.remainingBudget)}</td>
        <td>${renderRiskBadge(d.riskStatus)}</td>
        <td>${escapeHtml(d.note || '')}</td>
      </tr>
    `;
  });
  return `
    <div class="forecast-month-table-wrapper">
      <table class="forecast-month-table">
        <thead>
          <tr>
            <th>月份</th>
            <th class="numeric" title="預估時薪">預估<br>時薪</th>
            <th class="numeric" title="預估支出">預估<br>支出</th>
            <th class="numeric" title="累計預估支出">累計<br>預估支出</th>
            <th class="numeric" title="預估剩餘預算">預估剩餘<br>預算</th>
            <th>風險狀態</th>
            <th>備註</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderAllPanels() {
  renderCurrentPanel();
  renderPastPanel();
  renderFuturePanel();
  renderComparisonTable();
}

export function renderDifferenceForecastPage() {
  if (!containerEl) return;

  // 同步可能外部改變的 AY 選單
  const currYear = containerEl.querySelector('#forecast-filter-year');
  if (currYear && currentFilter.mode === 'academicYear') {
    populateAcademicYearSelect(currYear, currentFilter.academicYear);
  }
  const pastYear = containerEl.querySelector('#forecast-filter-year-past');
  if (pastYear && pastFilter.mode === 'academicYear') {
    populateAcademicYearSelect(pastYear, pastFilter.academicYear);
  }

  renderAllPanels();
}

// ===== 未來評估 Modal 相關邏輯 =====
let modalIntervals = [];

function getEvaluations() {
  try {
    return getForecastEvaluations();
  } catch (e) {
    return [];
  }
}

function populateLoadSelect(selectedId = '') {
  const sel = containerEl.querySelector('#fe-load-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">新增評估</option>';
  const evals = getEvaluations();
  evals.forEach(ev => {
    const opt = document.createElement('option');
    opt.value = ev.id;
    opt.textContent = ev.name || ev.id;
    if (ev.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function setModalFieldValues(evalData) {
  const nameEl = containerEl.querySelector('#fe-name');
  const budEl = containerEl.querySelector('#fe-budget');

  if (nameEl) nameEl.value = evalData.name || '';
  if (budEl) budEl.value = evalData.budget || 0;
  // 已移除 baseHourlyWage（重複功能，由區間預估時薪取代）
}

function clearModalForNew() {
  const nameEl = containerEl.querySelector('#fe-name');
  const budEl = containerEl.querySelector('#fe-budget');
  const loadSel = containerEl.querySelector('#fe-load-select');

  if (nameEl) nameEl.value = '';
  if (loadSel) loadSel.value = '';

  activeForecastEvaluationId = '';
  currentEvaluation = null;

  // 預設值從 currentResult
  const cr = currentResult || createZeroResult();
  if (budEl) budEl.value = cr.totalBudget || 0;

  // 初始一筆區間（區間預估時薪預設使用目前平均時薪）
  modalIntervals = [];
  addDefaultFirstInterval();
  renderModalIntervals();
  updateForecastDeleteButtonState();
}

function addDefaultFirstInterval() {
  const cr = currentResult || createZeroResult();
  let start = '';
  if (cr.endYm) {
    start = getNextYm(cr.endYm);
  } else if (cr.mode === 'academicYear' && cr.academicYear) {
    const months = getAcademicYearMonthRange(cr.academicYear);
    if (months.length) start = getNextYm(months[months.length - 1]);
  }
  if (!start) {
    const now = new Date();
    start = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  }
  const end = addMonthsToYm(start, 11) || start;

  // 區間預估時薪預設使用目前平均（從 currentResult 計算）
  let avgHw = 0;
  if (cr.estimatedAmount && cr.totalHours > 0) {
    avgHw = cr.estimatedAmount / cr.totalHours;
  } else if (cr.totalHours && cr.monthCount) {
    // fallback
    avgHw = 0;
  }

  // 平均每月時數 from current monthlyDetails
  let avgH = 0;
  if (cr.monthlyDetails && cr.monthlyDetails.length > 0) {
    const sumH = cr.monthlyDetails.reduce((s, m) => s + (Number(m.estimatedHours) || 0), 0);
    avgH = sumH / cr.monthlyDetails.length;
  } else if (cr.totalHours && cr.monthCount) {
    avgH = cr.totalHours / cr.monthCount;
  }

  modalIntervals.push({
    startYm: start,
    endYm: end,
    hourlyWage: Math.round(avgHw * 100) / 100 || 0,
    monthlyHours: Math.round(avgH * 100) / 100 || 0,
    note: ''
  });
}

function renderModalIntervals() {
  const tbody = containerEl ? containerEl.querySelector('#fe-interval-tbody') : null;
  if (!tbody) return;
  tbody.innerHTML = '';

  modalIntervals.forEach((iv, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="month" value="${iv.startYm || ''}" data-idx="${idx}" data-field="startYm"></td>
      <td><input type="month" value="${iv.endYm || ''}" data-idx="${idx}" data-field="endYm"></td>
      <td class="numeric"><input type="number" step="0.01" min="0" value="${iv.hourlyWage || 0}" data-idx="${idx}" data-field="hourlyWage"></td>
      <td><input type="text" value="${escapeHtml(iv.note || '')}" data-idx="${idx}" data-field="note"></td>
      <td class="action-cell"><button type="button" data-idx="${idx}" class="btn-danger">刪除</button></td>
    `;
    // bind inputs
    const inputs = tr.querySelectorAll('input');
    inputs.forEach(inp => {
      inp.addEventListener('input', (e) => {
        const i = parseInt(inp.dataset.idx, 10);
        const field = inp.dataset.field;
        if (modalIntervals[i]) {
          if (field === 'hourlyWage') {
            modalIntervals[i][field] = Number(inp.value) || 0;
          } else {
            modalIntervals[i][field] = inp.value;
          }
        }
      });
    });
    const delBtn = tr.querySelector('button');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        modalIntervals.splice(idx, 1);
        renderModalIntervals();
      });
    }
    tbody.appendChild(tr);
  });
}

function addIntervalRow() {
  const last = modalIntervals[modalIntervals.length - 1];
  let start = '';
  if (last && last.endYm) {
    start = getNextYm(last.endYm);
  } else {
    const now = new Date();
    start = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  }
  const end = addMonthsToYm(start, 11) || start;
  // 繼承上一個區間的預估時薪與每月預估時數（base 已移除，全部由區間決定）
  const prevHw = last ? (Number(last.hourlyWage) || 0) : 0;
  const prevMonthlyHours = last ? (last.monthlyHours || 0) : 0;
  modalIntervals.push({
    startYm: start,
    endYm: end,
    hourlyWage: prevHw,
    monthlyHours: prevMonthlyHours,
    note: ''
  });
  renderModalIntervals();
}

function getModalFormData() {
  const name = (containerEl.querySelector('#fe-name')?.value || '').trim();
  const budget = Number(containerEl.querySelector('#fe-budget')?.value) || 0;
  // 已刪除重複的預估時薪，全部由區間預估時薪決定
  return { name, budget, intervals: modalIntervals };
}

function openForecastEvalModal() {
  const modal = containerEl.querySelector('#forecast-eval-modal');
  if (!modal) return;

  modalIntervals = [];
  populateLoadSelect('');

  // 預設新增
  clearModalForNew();

  modal.style.display = 'flex';

  // bind dynamic
  const loadSel = containerEl.querySelector('#fe-load-select');
  if (loadSel) {
    loadSel.onchange = () => {
      const id = loadSel.value;
      if (!id) {
        clearModalForNew();
        return;
      }
      const evals = getEvaluations();
      const found = evals.find(ev => ev.id === id);
      if (found) {
        modalIntervals = JSON.parse(JSON.stringify(found.intervals || []));
        currentEvaluation = found;
        activeForecastEvaluationId = found.id;
        setModalFieldValues(found);
        renderModalIntervals();
        updateForecastDeleteButtonState();
      }
    };
  }

  const addBtn = containerEl.querySelector('#btn-add-interval');
  if (addBtn) addBtn.onclick = () => addIntervalRow();

  const delBtn = containerEl.querySelector('#forecast-delete-evaluation-btn');
  if (delBtn) delBtn.onclick = handleDeleteForecastEvaluation;

  const saveBtn = containerEl.querySelector('#fe-modal-save');
  if (saveBtn) saveBtn.onclick = handleSaveEvaluation;

  const cancelBtn = containerEl.querySelector('#fe-modal-cancel');
  if (cancelBtn) cancelBtn.onclick = () => closeForecastEvalModal();

  // click outside
  modal.onclick = (e) => { if (e.target === modal) closeForecastEvalModal(); };

  updateForecastDeleteButtonState();
}

function closeForecastEvalModal() {
  const modal = containerEl.querySelector('#forecast-eval-modal');
  if (modal) modal.style.display = 'none';
}

function handleSaveEvaluation() {
  const data = getModalFormData();
  const loadSel = containerEl.querySelector('#fe-load-select');
  const selectedId = loadSel ? loadSel.value : '';

  if (!data.name) {
    showToast('評估名稱不可空白', 'error');
    return;
  }
  if (data.budget < 0) {
    showToast('預算不可小於 0', 'error');
    return;
  }
  if (!data.intervals || data.intervals.length === 0) {
    showToast('至少需要 1 筆帶入區間', 'error');
    return;
  }
  for (const iv of data.intervals) {
    if (!iv.startYm || !iv.endYm) {
      showToast('區間必須有起始與結束年月', 'error');
      return;
    }
    if (iv.endYm < iv.startYm) {
      showToast('結束年月不可早於起始年月', 'error');
      return;
    }
    if (iv.hourlyWage < 0) {
      showToast('區間時薪不可小於 0', 'error');
      return;
    }
    // monthlyHours 已不再提供輸入功能，保留相容性檢查
    if (iv.monthlyHours !== undefined && iv.monthlyHours < 0) {
      showToast('區間時數不可小於 0', 'error');
      return;
    }
  }

  let toSave = {
    name: data.name,
    budget: data.budget,
    // baseHourlyWage 已移除（與區間預估時薪重複），直接由 intervals 內的 hourlyWage 決定
    intervals: data.intervals
  };

  if (selectedId) {
    toSave.id = selectedId;
  }

  const saved = saveForecastEvaluation(toSave);
  currentEvaluation = saved;
  activeForecastEvaluationId = saved ? saved.id : '';

  closeForecastEvalModal();

  // 更新顯示與計算
  futureResult = calculateFuturePanelResult(currentResult);
  renderFuturePanel();
  renderComparisonTable();

  showToast(`評估「${saved.name}」已儲存`, 'success');
}

function updateForecastDeleteButtonState() {
  const btn = containerEl ? containerEl.querySelector('#forecast-delete-evaluation-btn') : null;
  if (!btn) return;
  btn.disabled = !activeForecastEvaluationId;
}

function handleDeleteForecastEvaluation() {
  if (!activeForecastEvaluationId) {
    showToast('請先載入要刪除的評估紀錄', 'error');
    return;
  }

  const evals = getEvaluations();
  const found = evals.find(ev => ev.id === activeForecastEvaluationId);
  if (!found) {
    showToast('找不到目前載入的評估紀錄', 'error');
    activeForecastEvaluationId = '';
    currentEvaluation = null;
    updateForecastDeleteButtonState();
    return;
  }

  if (!confirm(`確定刪除評估紀錄「${found.name || found.id}」？此動作無法復原。`)) {
    return;
  }

  try {
    deleteForecastEvaluation(activeForecastEvaluationId);
    showToast('評估紀錄已刪除');

    // 清空表單與狀態
    currentEvaluation = null;
    activeForecastEvaluationId = '';
    modalIntervals = [];

    // 刷新 load select
    populateLoadSelect('');

    // 清空 modal 內容（不關閉 modal）
    const nameEl = containerEl.querySelector('#fe-name');
    const budEl = containerEl.querySelector('#fe-budget');
    const loadSel = containerEl.querySelector('#fe-load-select');
    if (nameEl) nameEl.value = '';
    if (budEl) budEl.value = '';
    if (loadSel) loadSel.value = '';
    // 已移除 fe-base-hourly

    const tbody = containerEl.querySelector('#fe-interval-tbody');
    if (tbody) tbody.innerHTML = '';

    updateForecastDeleteButtonState();

    // 刷新外部頁面顯示
    futureResult = calculateFuturePanelResult(currentResult);
    renderFuturePanel();
    renderComparisonTable();
  } catch (e) {
    console.error(e);
    showToast('刪除失敗', 'error');
  }
}

function resetForecastEvaluationFormAfterDelete() {
  // 保留此函式以相容，實際清空已在 handleDelete 內處理
  activeForecastEvaluationId = '';
  currentEvaluation = null;
  updateForecastDeleteButtonState();
}

// ===== INIT =====

export function initDifferenceForecastPage(container) {
  containerEl = container;

  container.innerHTML = `
    <div class="page-header">
      <h2>差額與預估</h2>
      <div class="toolbar">
        <button id="btn-refresh-forecast" class="btn-secondary">全部重新整理</button>
      </div>
    </div>

    <p style="margin:4px 0 12px;font-size:15px;color:#555;">
      響應式版面。查詢結果僅供分析，不會寫回任何資料。
    </p>

    <!-- 總比對表（統一卡片容器） -->
    <div class="comparison-card" style="margin-bottom:16px;">
      <h3>總比對表</h3>
      <div class="table-wrapper">
        <table class="data-table" id="forecast-compare-table">
          <thead>
            <tr>
              <th>項目</th>
              <th>目前預算與核銷</th>
              <th>過去預算與核銷</th>
              <th>未來預算與核銷</th>
            </tr>
          </thead>
          <tbody id="forecast-compare-tbody"></tbody>
        </table>
      </div>
    </div>

    <div class="forecast-grid">
      <!-- 目前預算與核銷 -->
      <div class="forecast-card">
        <h3>目前預算與核銷</h3>
        <div class="query-panel">
          <div class="query-row">
            <div class="query-field">
              <label>查詢模式</label>
              <select id="forecast-filter-mode">
                <option value="academicYear">依學年度</option>
                <option value="dateRange">依日期區間</option>
              </select>
            </div>
            <div class="query-field" id="forecast-year-group">
              <label>學年度</label>
              <select id="forecast-filter-year"></select>
            </div>
            <div class="query-field" id="forecast-date-range-group" style="display:none;">
              <label>起始年月</label>
              <input type="month" id="forecast-filter-start">
            </div>
            <div class="query-field" id="forecast-date-range-group2" style="display:none;">
              <label>結束年月</label>
              <input type="month" id="forecast-filter-end">
            </div>
            <div class="query-actions">
              <button id="btn-query-current" class="btn-primary">查詢</button>
            </div>
          </div>
        </div>
        <div id="current-summary"></div>
      </div>

      <!-- 過去預算與核銷 -->
      <div class="forecast-card">
        <h3>過去預算與核銷</h3>
        <div class="query-panel">
          <div class="query-row">
            <div class="query-field">
              <label>查詢模式</label>
              <select id="forecast-filter-mode-past">
                <option value="academicYear">依學年度</option>
                <option value="dateRange">依日期區間</option>
              </select>
            </div>
            <div class="query-field" id="forecast-year-group-past">
              <label>學年度</label>
              <select id="forecast-filter-year-past"></select>
            </div>
            <div class="query-field" id="forecast-date-range-group-past" style="display:none;">
              <label>起始年月</label>
              <input type="month" id="forecast-filter-start-past">
            </div>
            <div class="query-field" id="forecast-date-range-group2-past" style="display:none;">
              <label>結束年月</label>
              <input type="month" id="forecast-filter-end-past">
            </div>
            <div class="query-actions">
              <button id="btn-query-past" class="btn-primary">查詢</button>
            </div>
          </div>
        </div>
        <div id="past-summary"></div>
      </div>

      <!-- 未來預算與核銷 (評估方案模式) -->
      <div class="forecast-card future-card">
        <div class="forecast-card-header">
          <h3 style="margin:0;">未來預算與核銷</h3>
          <button id="btn-open-forecast-modal" class="btn-primary" style="padding:4px 10px; font-size:14px;">新增評估</button>
        </div>
        <div id="future-current-eval" class="forecast-current-eval">目前評估：尚未建立評估</div>
        <div id="future-summary"></div>
      </div>
    </div>

    <!-- 未來評估 Modal -->
    <div id="forecast-eval-modal" class="modal">
      <div class="modal-content forecast-modal-wide">
        <div class="modal-header">
          <h3>未來預算與核銷評估</h3>
        </div>
        <div class="modal-body" style="font-size:15px;">
          <div class="form-row">
            <div class="form-group">
              <label>載入評估</label>
              <select id="fe-load-select">
                <option value="">新增評估</option>
              </select>
            </div>
            <div class="form-group">
              <label>新評估名稱 <span class="required">*</span></label>
              <input type="text" id="fe-name" placeholder="例如：115學年度調薪預估">
            </div>
            <div class="form-group">
              <label>預算 <span class="required">*</span></label>
              <input type="number" id="fe-budget" step="1" min="0">
            </div>
          </div>

          <div style="margin:10px 0 6px; font-weight:600;">帶入區間</div>
          <div style="margin-bottom:6px;">
            <button id="btn-add-interval" class="btn-secondary" style="padding:4px 10px;font-size:14px;">新增帶入區間</button>
            <button id="forecast-delete-evaluation-btn" class="btn-danger" type="button" style="padding:4px 10px;font-size:14px;" disabled>刪除紀錄</button>
          </div>
          <div class="table-wrapper">
            <table class="data-table forecast-interval-table" id="fe-interval-table">
              <thead>
                <tr>
                  <th>起始年月</th>
                  <th>結束年月</th>
                  <th class="numeric">區間預估時薪</th>
                  <th>備註</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="fe-interval-tbody"></tbody>
            </table>
          </div>
          <div style="font-size:13px;color:#666;margin-top:4px;">後面的區間會覆蓋前面重疊月份的時薪（預估支出仍依行事曆時數與區間預估時薪計算，畫面不再顯示預估時數欄）。</div>
        </div>
        <div class="modal-footer">
          <button id="fe-modal-save" class="btn-primary">儲存</button>
          <button id="fe-modal-cancel" class="btn-secondary">取消</button>
        </div>
      </div>
    </div>
  `;

  // 初始狀態
  setInitialFilters();
  syncFilterUI();

  // 初始計算
  handleInitialCompute();

  // 事件
  bindEvents();

  // 額外：全部重整按鈕
  const refreshBtn = containerEl.querySelector('#btn-refresh-forecast');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      // 重新抓最新資料並重算
      currentResult = calculateActualPanelResult(currentFilter);
      pastResult = calculateActualPanelResult(pastFilter);
      renderAllPanels();
      showToast('已重新整理三欄資料', 'info');
    });
  }

  // 首次渲染
  renderAllPanels();
}
