// Pure helpers for PTB 1.6.0 budget groups. No DOM dependencies.

export function normalizeBudgetUnitCodes(value) {
  let arr = [];
  if (Array.isArray(value)) arr = value;
  else if (value === null || typeof value === 'undefined' || value === '') arr = [];
  else {
    try {
      const parsed = JSON.parse(String(value).trim());
      arr = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      arr = [];
    }
  }
  return [...new Set(arr.map(v => String(v ?? '').trim()).filter(Boolean))];
}

export function normalizeBudgetRecord(record = {}) {
  return {
    id: String(record.id ?? '').trim(),
    academicYear: String(record.academicYear ?? '').trim(),
    budgetName: String(record.budgetName ?? '').trim(),
    unitCodes: normalizeBudgetUnitCodes(record.unitCodes),
    budgetAmount: Number(record.budgetAmount) || 0,
    note: String(record.note ?? '').trim(),
    createdAt: String(record.createdAt ?? '').trim(),
    updatedAt: String(record.updatedAt ?? '').trim()
  };
}

export function validateRocAcademicYear(value) {
  return /^[1-9]\d*$/.test(String(value ?? '').trim());
}

export function validateYm(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return false;
  const month = Number(m[2]);
  return month >= 1 && month <= 12;
}

export function getValidBudgetGroups(budgets = []) {
  return budgets.map(normalizeBudgetRecord).filter(b => b.academicYear && b.budgetName && b.unitCodes.length > 0);
}

export function getDistinctBudgetNames(budgets = []) {
  return [...new Set(getValidBudgetGroups(budgets).map(b => b.budgetName))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}

export function getBudgetsByName(budgets = [], budgetName) {
  const name = String(budgetName ?? '').trim();
  return getValidBudgetGroups(budgets).filter(b => b.budgetName === name);
}

export function getBudgetForNameAndYear(budgets = [], budgetName, academicYear) {
  const ay = String(academicYear ?? '').trim();
  return getBudgetsByName(budgets, budgetName).find(b => String(b.academicYear) === ay) || null;
}

export function getBudgetYearsForName(budgets = [], budgetName) {
  return [...new Set(getBudgetsByName(budgets, budgetName).map(b => String(b.academicYear)))].sort((a,b)=>b.localeCompare(a,'zh-Hant'));
}

export function getBudgetGroupConflicts(budgets = []) {
  const byNameYear = new Map();
  const byUnitYear = new Map();
  const conflicts = [];
  getValidBudgetGroups(budgets).forEach(b => {
    const ny = `${b.academicYear}|${b.budgetName}`;
    if (byNameYear.has(ny)) conflicts.push({ type: 'duplicateName', academicYear: b.academicYear, budgetName: b.budgetName, budgets: [byNameYear.get(ny), b] });
    else byNameYear.set(ny, b);
    b.unitCodes.forEach(unitCode => {
      const uy = `${b.academicYear}|${unitCode}`;
      if (byUnitYear.has(uy)) conflicts.push({ type: 'unitOverlap', academicYear: b.academicYear, unitCode, budgets: [byUnitYear.get(uy), b] });
      else byUnitYear.set(uy, b);
    });
  });
  return conflicts;
}

export function getAcademicYearFromYm(ym) {
  const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!year || month < 1 || month > 12) return '';
  return String(month >= 8 ? year - 1911 : year - 1912);
}

function nextYm(ym) {
  if (!validateYm(ym)) return '';
  const [y, m] = ym.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}
export function getAcademicYearsInYmRange(startYm, endYm) {
  if (!validateYm(startYm) || !validateYm(endYm) || startYm > endYm) return [];
  const set = new Set();
  let cur = startYm;
  let guard = 0;
  while (cur && cur <= endYm && guard < 240) {
    const ay = getAcademicYearFromYm(cur);
    if (ay) set.add(ay);
    cur = nextYm(cur);
    guard += 1;
  }
  return [...set].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
}
export function isUnitInBudgetGroup(budget, unitCode) { return normalizeBudgetUnitCodes(budget && budget.unitCodes).includes(String(unitCode ?? '').trim()); }
export function sumBudgetAmounts(budgets = []) { return (budgets || []).reduce((s,b)=>s+(Number(b && b.budgetAmount)||0),0); }
export function sumEntriesForUnitCodes(entries = [], unitCodes = [], predicate = () => true) { const set = new Set(unitCodes); return (entries||[]).filter(e=>set.has(e.unitCode)&&predicate(e)).reduce((s,e)=>s+(Number(e.actualAmount)||0),0); }
export function sumRowsEstimateForUnitCodes(rows = [], unitCodes = [], predicate = () => true) { const set = new Set(unitCodes); return (rows||[]).filter(r=>set.has(r.unitCode)&&predicate(r)).reduce((s,r)=>s+(Number(r.hours)||0)*(Number(r.hourlyWage)||0),0); }

export function buildBudgetScope(filter = {}, budgets = []) {
  const safeFilter = {
    budgetName: String(filter.budgetName || '').trim(),
    mode: filter.mode === 'dateRange' ? 'dateRange' : 'academicYear',
    academicYear: String(filter.academicYear || '').trim(),
    startYm: String(filter.startYm || '').trim(),
    endYm: String(filter.endYm || '').trim()
  };

  if (!safeFilter.budgetName) return { ok: false, error: '請先選擇群組' };

  let years = [];
  if (safeFilter.mode === 'academicYear') {
    if (!validateRocAcademicYear(safeFilter.academicYear)) {
      return { ok: false, error: '請選擇合法學年度（ROC）' };
    }
    years = [safeFilter.academicYear];
  } else {
    if (!validateYm(safeFilter.startYm) || !validateYm(safeFilter.endYm) || safeFilter.startYm > safeFilter.endYm) {
      return { ok: false, error: '請輸入合法的年月區間（YYYY-MM，起始 ≤ 結束）' };
    }
    years = getAcademicYearsInYmRange(safeFilter.startYm, safeFilter.endYm);
    if (!years.length) return { ok: false, error: '查無涉及的學年度，請確認年月區間。' };
  }

  const normalizedBudgets = budgets.map(normalizeBudgetRecord);
  const yearSet = new Set(years.map(String));
  const conflicts = getBudgetGroupConflicts(normalizedBudgets).filter(c => yearSet.has(String(c.academicYear)));
  const duplicate = conflicts.find(c => c.type === 'duplicateName');
  if (duplicate) return { ok: false, error: `${duplicate.academicYear} 學年度存在重複群組名稱「${duplicate.budgetName}」，請先修正預算設定。` };
  const overlap = conflicts.find(c => c.type === 'unitOverlap');
  if (overlap) return { ok: false, error: `${overlap.academicYear} 學年度單位「${overlap.unitCode}」同時出現在多個預算群組，請先修正預算設定。` };

  const scoped = [];
  for (const ay of years) {
    const budget = getBudgetForNameAndYear(normalizedBudgets, safeFilter.budgetName, ay);
    if (!budget) return { ok: false, error: `${ay} 學年度尚未設定「${safeFilter.budgetName}」預算。` };
    scoped.push(budget);
  }

  return {
    ok: true,
    scope: {
      budgets: scoped,
      years,
      startYm: safeFilter.mode === 'dateRange' ? safeFilter.startYm : '',
      endYm: safeFilter.mode === 'dateRange' ? safeFilter.endYm : ''
    }
  };
}

export function resolveMonthlyWage(calendarRows = []) {
  const sorted = [...(calendarRows || [])]
    .filter(row => Number(row.hourlyWage) > 0)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  if (!sorted.length) return { display: '', latestHourlyWage: 0, wages: [] };

  const wages = [...new Set(sorted.map(row => Number(row.hourlyWage)))].sort((a, b) => a - b);
  const latestHourlyWage = Number(sorted[sorted.length - 1].hourlyWage) || 0;
  return {
    display: wages.map(v => String(v)).join('/'),
    latestHourlyWage,
    wages
  };
}

export function validateSalaryModalUnit({
  unitName,
  salaryAmount,
  existingEntry,
  calendarRows
} = {}) {
  const amount = Number(salaryAmount) || 0;
  const resolved = resolveMonthlyWage(calendarRows || []);
  const existingWage = Number(existingEntry && existingEntry.hourlyWage) || 0;
  const finalHourlyWage = resolved.latestHourlyWage || existingWage;
  const hasCalendarRows = Array.isArray(calendarRows) && calendarRows.length > 0;
  const isExisting = Boolean(existingEntry);

  if (!hasCalendarRows) {
    if (isExisting || amount > 0) {
      return { canSave: false, skip: false, error: `單位「${unitName || ''}」該月份無行事曆資料，無法登記薪資。` };
    }
    return { canSave: false, skip: true, error: '' };
  }

  if (amount > 0 && finalHourlyWage <= 0) {
    return { canSave: false, skip: false, error: `單位「${unitName || ''}」找不到有效時薪，請先建立該月行事曆。` };
  }

  if (!isExisting && amount <= 0) {
    return { canSave: false, skip: true, error: '' };
  }

  return { canSave: true, skip: false, error: '', hourlyWage: finalHourlyWage };
}

export function evaluateMonthRegistrationForGroup({
  academicYear,
  ym,
  groupUnitCodes = [],
  calendarRows = [],
  existingEntries = []
} = {}) {
  const year = String(academicYear || '').trim();
  const monthKey = String(ym || '').trim();
  const normalizedUnitCodes = normalizeBudgetUnitCodes(groupUnitCodes);
  const activeUnitCodes = [...new Set((calendarRows || [])
    .filter(row => String(row.academicYear) === year && row.unitCode && row.date && String(row.date).startsWith(`${monthKey}-`) && normalizedUnitCodes.includes(row.unitCode))
    .map(row => row.unitCode))];

  if (!activeUnitCodes.length) {
    return { activeUnitCodes: [], completed: true, skipped: true };
  }

  const [y, m] = monthKey.split('-').map(Number);
  const completed = activeUnitCodes.every(unitCode => (existingEntries || []).some(entry =>
    String(entry.academicYear) === year &&
    Number(entry.year) === y &&
    Number(entry.month) === m &&
    entry.unitCode === unitCode
  ));

  return { activeUnitCodes, completed, skipped: false };
}

export function buildUnitSalarySummary({ scopeBudgets = [], rows = [], entries = [] } = {}) {
  const unitCodes = [...new Set(scopeBudgets.flatMap(b => normalizeBudgetUnitCodes(b.unitCodes)))];
  const list = unitCodes.map(unitCode => {
    const estimate = (rows || [])
      .filter(row => row.unitCode === unitCode)
      .reduce((sum, row) => sum + (Number(row.hours) || 0) * (Number(row.hourlyWage) || 0), 0);
    const actual = (entries || [])
      .filter(entry => entry.unitCode === unitCode)
      .reduce((sum, entry) => sum + (Number(entry.actualAmount) || 0), 0);
    return {
      unitCode,
      estimate,
      actual,
      diff: estimate - actual
    };
  });
  const totals = list.reduce((acc, row) => {
    acc.estimate += row.estimate;
    acc.actual += row.actual;
    acc.diff += row.diff;
    return acc;
  }, { estimate: 0, actual: 0, diff: 0 });
  return { rows: list, totals };
}
