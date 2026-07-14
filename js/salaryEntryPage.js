import { getBudgets, getCalendarRows, saveSalaryEntry, getSalaryEntriesByAcademicYear, getSalaryEntriesByDateRange, getUnits } from './dataStore.js?v=1.6.0';
import { runWithMutationUiLock } from './mutationUi.js?v=1.6.0';
import { showToast, formatNumber } from './utils.js?v=1.6.0';
import {
  getDistinctBudgetNames,
  getBudgetYearsForName,
  normalizeBudgetUnitCodes,
  sumBudgetAmounts,
  buildBudgetScope,
  resolveMonthlyWage,
  validateSalaryModalUnit,
  buildUnitSalarySummary,
  validateRocAcademicYear,
  validateYm,
  getAcademicYearFromYm,
  evaluateMonthRegistrationForGroup
} from './budgetGroupUtils.js?v=1.6.0';

let containerEl = null;
let salaryFilter = { budgetName: '', mode: 'academicYear', academicYear: '', startYm: '', endYm: '', queried: false };
let salaryModalState = { academicYear: '', year: null, month: null, unitsData: [] };

function escapeHtml(str) { return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function getYmFromDate(dateStr) { const p = String(dateStr || '').split('-'); return p.length >= 2 ? `${p[0]}-${String(p[1]).padStart(2, '0')}` : ''; }
function formatYm(y, m) { return `${y}-${String(m).padStart(2, '0')}`; }
function compareYm(a, b) { return String(a || '').localeCompare(String(b || '')); }
function unitMap() { return new Map(getUnits().map(u => [u.unitCode, u.unitName || u.unitCode])); }
function unitName(code) { return unitMap().get(code) || code; }
function entryYm(e) { return formatYm(e.year, e.month); }
function getMonthsInRows(rows) { return [...new Set((rows || []).map(r => getYmFromDate(r.date)).filter(validateYm))].sort(compareYm); }

function getColorHex(key) {
  const map = { default: '#212529', blue: '#0d6efd', green: '#198754', orange: '#fd7e14', purple: '#6f42c1', red: '#dc3545', gray: '#6c757d' };
  return map[key] || map.default;
}

function renderColoredUnitName(unitCode, displayName) {
  const unit = getUnits().find(u => u.unitCode === unitCode);
  const color = getColorHex((unit && unit.colorKey) || 'default');
  return `<span style="color:${color};font-weight:600;">${escapeHtml(displayName)}</span>`;
}

function rowsInScope(scope) {
  let rows = getCalendarRows();
  if (scope.startYm) {
    rows = rows.filter(r => {
      const ym = getYmFromDate(r.date);
      return ym >= scope.startYm && ym <= scope.endYm;
    });
  }
  const byAyUnits = new Map(scope.budgets.map(b => [String(b.academicYear), new Set(normalizeBudgetUnitCodes(b.unitCodes))]));
  return rows.filter(r => {
    const set = byAyUnits.get(String(r.academicYear));
    return Boolean(set && set.has(r.unitCode));
  });
}

function entriesInScope(scope) {
  const entries = scope.startYm ? getSalaryEntriesByDateRange(scope.startYm, scope.endYm) : getSalaryEntriesByAcademicYear(scope.years[0]);
  const byAyUnits = new Map(scope.budgets.map(b => [String(b.academicYear), new Set(normalizeBudgetUnitCodes(b.unitCodes))]));
  return entries.filter(e => {
    const set = byAyUnits.get(String(e.academicYear));
    return Boolean(set && set.has(e.unitCode));
  });
}

function clearQueryResult() {
  salaryFilter = { ...salaryFilter, queried: false };
  hideResults();
}

function clearQueryResultWithError(message) {
  salaryFilter = { ...salaryFilter, queried: false };
  hideResults();
  if (message) showToast(message, 'error');
}

function buildScopeFromFilter(filter) {
  const scopeResult = buildBudgetScope(filter, getBudgets());
  if (!scopeResult.ok) return scopeResult;

  const namedUnits = new Map(getUnits().map(u => [u.unitCode, u.unitName || u.unitCode]));
  const unitOverlap = scopeResult.error && scopeResult.error.includes('同時出現在多個預算群組');
  if (unitOverlap) {
    const m = scopeResult.error.match(/單位「(.+?)」/);
    const unitCode = m ? m[1] : '';
    const unitDisplay = namedUnits.get(unitCode) || unitCode;
    return { ok: false, error: scopeResult.error.replace(unitCode, unitDisplay) };
  }
  return scopeResult;
}

function applyStickyWidths() {
  const table = containerEl.querySelector('#salary-month-table');
  if (!table) return;
  let col1 = 0;
  let col2 = 0;
  table.querySelectorAll('tr').forEach(tr => {
    if (!tr.cells || tr.cells.length < 2) return;
    col1 = Math.max(col1, tr.cells[0].scrollWidth || 0);
    col2 = Math.max(col2, tr.cells[1].scrollWidth || 0);
  });
  if (col1 > 0) table.style.setProperty('--month-detail-col1-width', `${Math.ceil(col1 + 16)}px`);
  if (col2 > 0) table.style.setProperty('--month-detail-col2-width', `${Math.ceil(col2 + 16)}px`);
}

export function initSalaryEntryPage(container) {
  containerEl = container;
  container.innerHTML = `<div class="page-header"><h2>時薪登記</h2><div class="toolbar"><button id="btn-open-salary-modal" class="btn-primary" disabled>登記薪資</button></div></div>
  <div class="query-panel salary-query-panel"><div class="query-row"><div class="query-field"><label>預算群組</label><select id="salary-budget-name"><option value="">請選擇群組</option></select></div><div class="query-field salary-secondary"><label>查詢模式</label><select id="salary-filter-mode"><option value="academicYear">依學年度</option><option value="dateRange">依日期區間</option></select></div><div class="query-field salary-secondary" id="salary-year-group"><label>學年度</label><select id="salary-filter-year"></select></div><div class="query-field salary-secondary" id="salary-date-range-group" style="display:none"><label>起始年月</label><input type="month" id="salary-filter-start"></div><div class="query-field salary-secondary" id="salary-date-range-group2" style="display:none"><label>結束年月</label><input type="month" id="salary-filter-end"></div><div class="query-actions salary-secondary"><button id="salary-filter-query" class="btn-primary">查詢</button></div></div></div>
  <div id="salary-results" class="salary-results hidden"><div id="salary-summary" style="margin:12px 0;"></div><h3>單位摘要</h3><div class="table-wrapper"><table class="data-table summary-table" id="salary-unit-summary"><thead><tr><th>單位</th><th style="text-align:right">預估薪資</th><th style="text-align:right">實際核銷</th><th style="text-align:right">差額</th></tr></thead><tbody id="salary-unit-summary-tbody"></tbody></table></div><h3>月份明細</h3><div class="table-wrapper"><table class="data-table salary-entry-table salary-month-detail-table salary-month-transpose-table" id="salary-month-table"><thead id="salary-month-thead"></thead><tbody id="salary-month-tbody"></tbody></table></div></div>
  <div id="salary-modal" class="modal"><div class="modal-content modal-wide"><div class="modal-header"><h3>登記薪資</h3></div><div class="modal-body"><div class="form-row"><div class="form-group"><label>學年度 <span class="required">*</span></label><select id="sal-modal-ay"></select></div><div class="form-group"><label>年份 <span class="required">*</span></label><select id="sal-modal-year"></select></div><div class="form-group"><label>月份 <span class="required">*</span></label><select id="sal-modal-month"></select></div></div><div class="table-wrapper"><table class="data-table" id="sal-unit-table"><thead><tr><th>單位</th><th class="numeric">實際薪資</th><th>備註</th></tr></thead><tbody id="sal-unit-tbody"></tbody></table></div></div><div class="modal-footer"><button id="sal-modal-save" class="btn-primary">提交</button><button id="sal-modal-cancel" class="btn-secondary">取消</button></div></div></div>`;
  bind();
  populateBudgetNames();
  resetAfterBudgetChange();
}

function bind() {
  containerEl.querySelector('#salary-budget-name').addEventListener('change', e => {
    salaryFilter.budgetName = e.target.value;
    resetAfterBudgetChange();
  });
  containerEl.querySelector('#salary-filter-mode').addEventListener('change', () => { updateFilterUI(); clearQueryResult(); });
  containerEl.querySelector('#salary-filter-year').addEventListener('change', clearQueryResult);
  containerEl.querySelector('#salary-filter-start').addEventListener('change', clearQueryResult);
  containerEl.querySelector('#salary-filter-end').addEventListener('change', clearQueryResult);
  containerEl.querySelector('#salary-filter-query').addEventListener('click', handleQuery);
  containerEl.querySelector('#btn-open-salary-modal').addEventListener('click', openSalaryModal);
  containerEl.querySelector('#sal-modal-cancel').addEventListener('click', hideSalaryModal);
  containerEl.querySelector('#sal-modal-save').addEventListener('click', handleSalaryModalSubmit);
  containerEl.querySelector('#salary-modal').addEventListener('click', e => { if (e.target.id === 'salary-modal') hideSalaryModal(); });
  containerEl.querySelector('#sal-modal-ay').addEventListener('change', () => { populateModalYearMonth(); renderModalUnitTable(); });
  containerEl.querySelector('#sal-modal-year').addEventListener('change', renderModalUnitTable);
  containerEl.querySelector('#sal-modal-month').addEventListener('change', renderModalUnitTable);
}

function populateBudgetNames() {
  const sel = containerEl.querySelector('#salary-budget-name');
  const cur = sel.value;
  sel.innerHTML = '<option value="">請選擇群組</option>';
  getDistinctBudgetNames(getBudgets()).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
  if (cur) sel.value = cur;
}

function resetAfterBudgetChange() {
  salaryFilter = { ...salaryFilter, mode: 'academicYear', academicYear: '', startYm: '', endYm: '', queried: false };
  containerEl.querySelector('#salary-filter-mode').value = 'academicYear';
  containerEl.querySelector('#salary-filter-start').value = '';
  containerEl.querySelector('#salary-filter-end').value = '';
  populateYearSelect();
  updateFilterUI();
  hideResults();
  containerEl.querySelector('#btn-open-salary-modal').disabled = !salaryFilter.budgetName;
}

function populateYearSelect() {
  const sel = containerEl.querySelector('#salary-filter-year');
  sel.innerHTML = '';
  getBudgetYearsForName(getBudgets(), salaryFilter.budgetName).forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    sel.appendChild(opt);
  });
}

function updateFilterUI() {
  const hasGroup = Boolean(salaryFilter.budgetName);
  containerEl.querySelectorAll('.salary-secondary').forEach(el => { el.style.display = hasGroup ? '' : 'none'; });
  const mode = containerEl.querySelector('#salary-filter-mode').value;
  if (hasGroup) {
    containerEl.querySelector('#salary-year-group').style.display = mode === 'academicYear' ? '' : 'none';
    containerEl.querySelector('#salary-date-range-group').style.display = mode === 'dateRange' ? '' : 'none';
    containerEl.querySelector('#salary-date-range-group2').style.display = mode === 'dateRange' ? '' : 'none';
  }
}

function hideResults() {
  containerEl.querySelector('#salary-results').classList.add('hidden');
  containerEl.querySelector('#salary-summary').innerHTML = '';
  containerEl.querySelector('#salary-unit-summary-tbody').innerHTML = '';
  containerEl.querySelector('#salary-month-thead').innerHTML = '';
  containerEl.querySelector('#salary-month-tbody').innerHTML = '';
}

function handleQuery() {
  const candidate = {
    budgetName: containerEl.querySelector('#salary-budget-name').value,
    mode: containerEl.querySelector('#salary-filter-mode').value,
    academicYear: containerEl.querySelector('#salary-filter-year').value,
    startYm: containerEl.querySelector('#salary-filter-start').value,
    endYm: containerEl.querySelector('#salary-filter-end').value
  };

  if (!candidate.budgetName) return clearQueryResultWithError('請先選擇群組');
  if (candidate.mode === 'academicYear' && !validateRocAcademicYear(candidate.academicYear)) {
    return clearQueryResultWithError('請選擇合法學年度（ROC）');
  }
  if (candidate.mode === 'dateRange' && (!validateYm(candidate.startYm) || !validateYm(candidate.endYm) || candidate.startYm > candidate.endYm)) {
    return clearQueryResultWithError('請輸入合法的年月區間（YYYY-MM，起始 ≤ 結束）');
  }

  const scopeResult = buildScopeFromFilter(candidate);
  if (!scopeResult.ok) return clearQueryResultWithError(scopeResult.error);

  salaryFilter = {
    ...salaryFilter,
    budgetName: candidate.budgetName,
    mode: candidate.mode,
    academicYear: candidate.mode === 'academicYear' ? candidate.academicYear : '',
    startYm: candidate.mode === 'dateRange' ? candidate.startYm : '',
    endYm: candidate.mode === 'dateRange' ? candidate.endYm : '',
    queried: true
  };

  renderSalaryEntryPage();
}

export function renderSalaryEntryPage() {
  if (!containerEl) return;
  populateBudgetNames();

  if (!salaryFilter.budgetName || !salaryFilter.queried) {
    hideResults();
    return;
  }

  const scopeResult = buildScopeFromFilter(salaryFilter);
  if (!scopeResult.ok) return clearQueryResultWithError(scopeResult.error);

  const scope = scopeResult.scope;
  const rows = rowsInScope(scope);
  const entries = entriesInScope(scope);

  renderSummary(scope, rows, entries);
  renderUnitSummary(scope, rows, entries);
  renderMonthDetail(scope, rows, entries);
  const results = containerEl.querySelector('#salary-results');
  results.classList.remove('hidden');

  const schedule = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : callback => setTimeout(callback, 0);
  schedule(applyStickyWidths);
}

function renderSummary(scope, rows, entries) {
  const totalBudget = sumBudgetAmounts(scope.budgets);
  const estimate = (rows || []).reduce((sum, row) => sum + (Number(row.hours) || 0) * (Number(row.hourlyWage) || 0), 0);
  const actual = (entries || []).reduce((sum, entry) => sum + (Number(entry.actualAmount) || 0), 0);
  const remain = totalBudget - actual;
  const bits = [`群組：${escapeHtml(salaryFilter.budgetName)}`];

  if (salaryFilter.mode === 'academicYear') bits.push(`目前學年度：${salaryFilter.academicYear}`);
  else bits.push(`日期區間：${salaryFilter.startYm} ~ ${salaryFilter.endYm}`);

  bits.push(
    `總預算：${formatNumber(totalBudget)}`,
    `預估薪資合計：${formatNumber(estimate)}`,
    `實際核銷合計：${formatNumber(actual)}`,
    `差額（預估-核銷）：${formatNumber(estimate - actual)}`,
    `剩餘預算（總預算-實際核銷）：${formatNumber(remain)}`
  );

  containerEl.querySelector('#salary-summary').innerHTML = `<div class="summary-box">${bits.map(x => `<div class="${(x.includes('差額') && (estimate - actual) < 0) || (x.includes('剩餘預算') && remain < 0) ? 'negative' : ''}">${x}</div>`).join('')}</div>`;
}

function renderUnitSummary(scope, rows, entries) {
  const tbody = containerEl.querySelector('#salary-unit-summary-tbody');
  tbody.innerHTML = '';
  const summary = buildUnitSalarySummary({ scopeBudgets: scope.budgets, rows, entries });

  summary.rows.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${renderColoredUnitName(item.unitCode, unitName(item.unitCode))}</td><td style="text-align:right">${formatNumber(item.estimate)}</td><td style="text-align:right">${formatNumber(item.actual)}</td><td style="text-align:right" class="${item.diff < 0 ? 'negative' : ''}">${formatNumber(item.diff)}</td>`;
    tbody.appendChild(tr);
  });

  const total = document.createElement('tr');
  total.className = 'summary-total-row';
  total.innerHTML = `<td>合計</td><td style="text-align:right">${formatNumber(summary.totals.estimate)}</td><td style="text-align:right">${formatNumber(summary.totals.actual)}</td><td style="text-align:right" class="${summary.totals.diff < 0 ? 'negative' : ''}">${formatNumber(summary.totals.diff)}</td>`;
  tbody.appendChild(total);
}

function getMonthSequence(scope, rows) {
  if (scope.startYm && scope.endYm) return enumerateMonths(scope.startYm, scope.endYm);
  return getMonthsInRows(rows);
}

function renderMonthDetail(scope, rows, entries) {
  const thead = containerEl.querySelector('#salary-month-thead');
  const tbody = containerEl.querySelector('#salary-month-tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  const months = getMonthSequence(scope, rows);
  if (!months.length) {
    thead.innerHTML = '<tr><th>單位</th><th>項目</th></tr>';
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="2" style="text-align:center;color:#666;">目前無月份明細</td>';
    tbody.appendChild(tr);
    return;
  }

  const units = [...new Set(scope.budgets.flatMap(b => normalizeBudgetUnitCodes(b.unitCodes)))];
  thead.innerHTML = `<tr><th>單位</th><th>項目</th>${months.map(m => `<th>${m}</th>`).join('')}</tr>`;

  const budgetByAy = new Map(scope.budgets.map(b => [String(b.academicYear), b]));
  const remainingByAy = new Map(scope.budgets.map(b => [String(b.academicYear), Number(b.budgetAmount) || 0]));
  const monthMeta = new Map();

  months.forEach(ym => {
    const ay = getAcademicYearFromYm(ym);
    const budget = budgetByAy.get(String(ay));
    const unitSet = new Set(budget ? normalizeBudgetUnitCodes(budget.unitCodes) : []);
    const monthRows = rows.filter(r => getYmFromDate(r.date) === ym && String(r.academicYear) === String(ay) && unitSet.has(r.unitCode));
    const monthActual = entries
      .filter(e => entryYm(e) === ym && String(e.academicYear) === String(ay) && unitSet.has(e.unitCode))
      .reduce((sum, e) => sum + (Number(e.actualAmount) || 0), 0);
    const resolvedWage = resolveMonthlyWage(monthRows);
    const remaining = (remainingByAy.get(String(ay)) || 0) - monthActual;
    remainingByAy.set(String(ay), remaining);
    monthMeta.set(ym, {
      academicYear: ay || '',
      monthLabel: ym,
      wageDisplay: resolvedWage.display,
      remaining
    });
  });

  const fixedRows = [
    ['學年度', ym => (monthMeta.get(ym) || {}).academicYear || ''],
    ['月份', ym => (monthMeta.get(ym) || {}).monthLabel || ''],
    ['時薪', ym => (monthMeta.get(ym) || {}).wageDisplay || ''],
    ['剩餘預算', ym => formatNumber((monthMeta.get(ym) || {}).remaining || 0)]
  ];

  fixedRows.forEach(([label, resolver]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td></td><td>${label}</td>${months.map(ym => `<td>${resolver(ym)}</td>`).join('')}`;
    tbody.appendChild(tr);
  });

  units.forEach((unitCode, idx) => {
    const oddEvenClass = idx % 2 === 0 ? 'month-detail-unit-odd' : 'month-detail-unit-even';
    const groupClass = `month-detail-unit-group ${oddEvenClass}`;

    const estimateFn = ym => rows.filter(r => getYmFromDate(r.date) === ym && r.unitCode === unitCode)
      .reduce((sum, r) => sum + (Number(r.hours) || 0) * (Number(r.hourlyWage) || 0), 0);
    const actualFn = ym => entries.filter(e => entryYm(e) === ym && e.unitCode === unitCode)
      .reduce((sum, e) => sum + (Number(e.actualAmount) || 0), 0);
    const diffFn = ym => estimateFn(ym) - actualFn(ym);
    const noteFn = ym => entries
      .filter(e => entryYm(e) === ym && e.unitCode === unitCode && String(e.note || '').trim())
      .map(e => String(e.note).trim())
      .join('；');

    const detailRows = [
      ['預估薪資', estimateFn, 'number'],
      ['核銷薪資', actualFn, 'number'],
      ['差額', diffFn, 'diff'],
      ['備註', noteFn, 'note']
    ];

    detailRows.forEach(([label, resolver, type], rowIdx) => {
      const tr = document.createElement('tr');
      const startClass = rowIdx === 0 ? ' month-detail-unit-start' : '';
      const noteClass = type === 'note' ? ' month-detail-note-row' : '';
      tr.className = `${groupClass}${startClass}${noteClass}`.trim();

      const unitCell = rowIdx === 0 ? renderColoredUnitName(unitCode, unitName(unitCode)) : '';
      const firstCellClass = rowIdx === 0 ? 'month-detail-unit-name' : '';

      const cells = months.map(ym => {
        if (type === 'note') return `<td class="note-cell">${escapeHtml(resolver(ym))}</td>`;
        const value = Number(resolver(ym)) || 0;
        return `<td class="${type === 'diff' && value < 0 ? 'negative' : ''}">${formatNumber(value)}</td>`;
      }).join('');

      tr.innerHTML = `<td class="${firstCellClass}">${unitCell}</td><td>${label}</td>${cells}`;
      tbody.appendChild(tr);
    });
  });

}

function enumerateMonths(start, end) {
  if (!validateYm(start) || !validateYm(end) || start > end) return [];
  const out = [];
  let [y, m] = start.split('-').map(Number);
  let guard = 0;
  while (formatYm(y, m) <= end && guard < 240) {
    out.push(formatYm(y, m));
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    guard += 1;
  }
  return out;
}

function findRecentUnregisteredMonth(ay, unitCodes, existingEntries, calendarRows) {
  const candidates = [...new Set((calendarRows || [])
    .filter(r => String(r.academicYear) === String(ay) && unitCodes.includes(r.unitCode))
    .map(r => getYmFromDate(r.date))
    .filter(validateYm))].sort((a, b) => b.localeCompare(a));

  for (const ym of candidates) {
    const monthState = evaluateMonthRegistrationForGroup({
      academicYear: ay,
      ym,
      groupUnitCodes: unitCodes,
      calendarRows,
      existingEntries
    });
    if (monthState.skipped) continue;
    if (!monthState.completed) return ym;
  }
  return candidates[0] || '';
}

function openSalaryModal() {
  if (!salaryFilter.budgetName) return showToast('請先選擇群組', 'error');
  const aySel = containerEl.querySelector('#sal-modal-ay');
  aySel.innerHTML = '';

  const years = getBudgetYearsForName(getBudgets(), salaryFilter.budgetName);
  years.forEach(ay => {
    const opt = document.createElement('option');
    opt.value = ay;
    opt.textContent = ay;
    aySel.appendChild(opt);
  });

  if (!aySel.options.length) return showToast('此群組尚未設定學年度', 'error');
  aySel.value = validateRocAcademicYear(salaryFilter.academicYear) ? salaryFilter.academicYear : aySel.options[0].value;

  populateModalYearMonth();
  renderModalUnitTable();
  containerEl.querySelector('#salary-modal').style.display = 'flex';
}

function hideSalaryModal() {
  containerEl.querySelector('#salary-modal').style.display = 'none';
}

function populateModalYearMonth() {
  const ay = containerEl.querySelector('#sal-modal-ay').value;
  const ySel = containerEl.querySelector('#sal-modal-year');
  const mSel = containerEl.querySelector('#sal-modal-month');
  const startYear = Number(ay) + 1911;

  ySel.innerHTML = '';
  [startYear, startYear + 1].forEach(year => {
    const opt = document.createElement('option');
    opt.value = year;
    opt.textContent = year;
    ySel.appendChild(opt);
  });

  mSel.innerHTML = '';
  for (let i = 1; i <= 12; i += 1) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i;
    mSel.appendChild(opt);
  }

  const budget = getBudgets().find(b => String(b.academicYear) === String(ay) && b.budgetName === salaryFilter.budgetName);
  const unitCodes = normalizeBudgetUnitCodes(budget && budget.unitCodes);
  const existing = getSalaryEntriesByAcademicYear(ay);
  const defaultYm = findRecentUnregisteredMonth(ay, unitCodes, existing, getCalendarRows());
  if (validateYm(defaultYm)) {
    const [dy, dm] = defaultYm.split('-').map(Number);
    ySel.value = dy;
    mSel.value = dm;
  } else {
    ySel.value = startYear;
    mSel.value = 8;
  }
}

function renderModalUnitTable() {
  const ay = containerEl.querySelector('#sal-modal-ay').value;
  const y = Number(containerEl.querySelector('#sal-modal-year').value);
  const m = Number(containerEl.querySelector('#sal-modal-month').value);
  const ym = formatYm(y, m);
  const tbody = containerEl.querySelector('#sal-unit-tbody');

  const budget = getBudgets().find(b => String(b.academicYear) === String(ay) && b.budgetName === salaryFilter.budgetName);
  const unitCodes = normalizeBudgetUnitCodes(budget && budget.unitCodes);
  const existing = getSalaryEntriesByAcademicYear(ay).filter(e => Number(e.year) === y && Number(e.month) === m);
  const monthRows = getCalendarRows().filter(r => String(r.academicYear) === String(ay) && getYmFromDate(r.date) === ym);

  salaryModalState = {
    academicYear: ay,
    year: y,
    month: m,
    unitsData: unitCodes.map(unitCode => {
      const found = existing.find(e => e.unitCode === unitCode) || null;
      const unitRows = monthRows.filter(r => r.unitCode === unitCode).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
      const wageInfo = resolveMonthlyWage(unitRows);
      return {
        unitCode,
        unitName: unitName(unitCode),
        salaryAmount: found ? (Number(found.actualAmount) || 0) : 0,
        note: found ? (found.note || '') : '',
        existingEntry: found,
        calendarRows: unitRows,
        hourlyWage: found ? (Number(found.hourlyWage) || 0) : wageInfo.latestHourlyWage,
        wageDisplay: wageInfo.display
      };
    })
  };

  tbody.innerHTML = '';
  salaryModalState.unitsData.forEach((item, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${renderColoredUnitName(item.unitCode, item.unitName)}${item.wageDisplay ? `<div class="help-text">時薪：${escapeHtml(item.wageDisplay)}</div>` : '<div class="help-text">時薪：無</div>'}</td><td class="numeric"><input type="number" min="0" step="1" value="${item.salaryAmount}" data-idx="${idx}"></td><td><input type="text" value="${escapeHtml(item.note)}" data-note-idx="${idx}"></td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('input[type="number"]').forEach(inp => inp.addEventListener('input', e => {
    salaryModalState.unitsData[e.target.dataset.idx].salaryAmount = Number(e.target.value) || 0;
  }));
  tbody.querySelectorAll('input[type="text"]').forEach(inp => inp.addEventListener('input', e => {
    salaryModalState.unitsData[e.target.dataset.noteIdx].note = e.target.value;
  }));
}

async function handleSalaryModalSubmit() {
  let savedCount = 0;
  const errors = [];

  const payloads = [];
  salaryModalState.unitsData.forEach(item => {
    const check = validateSalaryModalUnit({
      unitName: item.unitName,
      salaryAmount: item.salaryAmount,
      existingEntry: item.existingEntry,
      calendarRows: item.calendarRows
    });

    if (!check.canSave) {
      if (!check.skip && check.error) errors.push(check.error);
      return;
    }

    payloads.push({
      academicYear: salaryModalState.academicYear,
      year: salaryModalState.year,
      month: salaryModalState.month,
      unitCode: item.unitCode,
      unitName: item.unitName,
      hourlyWage: check.hourlyWage,
      actualAmount: Number(item.salaryAmount) || 0,
      note: item.note || ''
    });
  });
  if (payloads.length) {
    try { const saved=await runWithMutationUiLock([containerEl.querySelector('#sal-modal-save'),containerEl.querySelector('#sal-modal-cancel')],()=>Promise.all(payloads.map(saveSalaryEntry)),{blocking:true}); savedCount=saved.length; } catch { return; }
  }

  if (savedCount > 0 && errors.length > 0) {
    hideSalaryModal();
    showToast(`已儲存 ${savedCount} 筆；${errors.join('；')}`, 'error');
  } else if (savedCount > 0) {
    hideSalaryModal();
    showToast(`薪資登記完成（${savedCount} 筆）`);
  } else if (errors.length > 0) {
    showToast(errors.join('；'), 'error');
  } else {
    hideSalaryModal();
  }

  if (salaryFilter.queried) renderSalaryEntryPage();
}
