// Pure helpers for hour/calendar budget-group scoping. No DOM / dataStore deps.
import { normalizeBudgetUnitCodes, normalizeBudgetRecord } from './budgetGroupUtils.js';

export function isValidBudgetRecord(budget) {
  const b = normalizeBudgetRecord(budget || {});
  return Boolean(b.academicYear && b.budgetName && b.unitCodes.length > 0);
}

export function getValidBudgets(budgets = []) {
  return (budgets || []).map(normalizeBudgetRecord).filter(isValidBudgetRecord);
}

/** Stable runtime identity: persisted id first, otherwise immutable business fields. */
export function budgetStableIdentity(budget = {}) {
  const b = normalizeBudgetRecord(budget);
  if (b.id) return `id:${b.id}`;
  return `fallback:${JSON.stringify([
    b.academicYear,
    b.budgetName,
    b.unitCodes.slice().sort((a, z) => a.localeCompare(z)),
    b.budgetAmount,
    b.note
  ])}`;
}

export function deduplicateBudgetsByStableIdentity(budgets = []) {
  const seen = new Set();
  const unique = [];
  getValidBudgets(budgets).forEach(budget => {
    const identity = budgetStableIdentity(budget);
    if (seen.has(identity)) return;
    seen.add(identity);
    unique.push(budget);
  });
  return unique;
}

/** One option per academicYear + budgetName, with distinct persisted conflicts disabled by callers. */
export function analyzeBudgetOptionsForYear(budgets = [], academicYear = '') {
  const ay = String(academicYear ?? '').trim();
  if (!ay) return { options: [], duplicateGroups: [] };
  const raw = getValidBudgets(budgets).filter(b => b.academicYear === ay);
  const unique = deduplicateBudgetsByStableIdentity(raw);
  const groups = new Map();
  unique.forEach(budget => {
    if (!groups.has(budget.budgetName)) groups.set(budget.budgetName, []);
    groups.get(budget.budgetName).push(budget);
  });
  const rawCounts = new Map();
  raw.forEach(budget => rawCounts.set(budget.budgetName, (rawCounts.get(budget.budgetName) || 0) + 1));
  const options = [...groups.entries()].map(([budgetName, records]) => {
    if (records.length === 1) {
      const budget = records[0];
      return {
        academicYear: ay,
        budgetName,
        value: budgetOptionValue(budget),
        budget,
        status: 'unique',
        recordCount: 1,
        rawRecordCount: rawCounts.get(budgetName) || 1,
        records: records.slice()
      };
    }
    return {
      academicYear: ay,
      budgetName,
      value: '',
      budget: null,
      status: 'duplicate',
      recordCount: records.length,
      rawRecordCount: rawCounts.get(budgetName) || records.length,
      records: records.slice()
    };
  }).sort((a, b) => a.budgetName.localeCompare(b.budgetName, 'zh-Hant'));
  return { options, duplicateGroups: options.filter(option => option.status === 'duplicate') };
}

/** Read-only diagnostic groups; never exposes spreadsheet configuration. */
export function diagnoseBudgetDuplicateGroups(budgets = []) {
  const rawGroups = new Map();
  getValidBudgets(budgets).forEach(budget => {
    const key = `${budget.academicYear}\u0001${budget.budgetName}`;
    if (!rawGroups.has(key)) rawGroups.set(key, []);
    rawGroups.get(key).push(budget);
  });
  return [...rawGroups.values()].filter(records => records.length > 1).map(records => {
    const identities = new Set(records.map(budgetStableIdentity));
    return {
      academicYear: records[0].academicYear,
      budgetName: records[0].budgetName,
      rawRecordCount: records.length,
      uniqueIdentityCount: identities.size,
      recordIds: [...new Set(records.map(r => r.id).filter(Boolean))],
      unitCodeSets: records.map(r => r.unitCodes.slice().sort()),
      category: identities.size === 1 ? 'RUNTIME_DUPLICATE_SAME_ID' : 'PERSISTED_DUPLICATE_DIFFERENT_IDS'
    };
  });
}

/** Valid budgets for a single academic year, sorted by budgetName zh-Hant asc. */
export function getValidBudgetsForYear(budgets = [], academicYear = '') {
  const ay = String(academicYear ?? '').trim();
  if (!ay) return [];
  return getValidBudgets(budgets)
    .filter(b => b.academicYear === ay)
    .sort((a, b) => a.budgetName.localeCompare(b.budgetName, 'zh-Hant'));
}

/** Distinct valid budgetName options across years (for calendar first layer). */
export function getDistinctValidBudgetNames(budgets = []) {
  return [...new Set(getValidBudgets(budgets).map(b => b.budgetName))]
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}

/** Academic years that have a valid record for budgetName, newest first. */
export function getYearsForBudgetName(budgets = [], budgetName = '') {
  const name = String(budgetName ?? '').trim();
  if (!name) return [];
  const years = [...new Set(
    getValidBudgets(budgets)
      .filter(b => b.budgetName === name)
      .map(b => b.academicYear)
  )];
  years.sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && String(na) === a && Number.isFinite(nb) && String(nb) === b) return nb - na;
    return b.localeCompare(a, 'zh-Hant');
  });
  return years;
}

/**
 * Resolve unique valid budget for academicYear + budgetName.
 * @returns {{ ok: boolean, budget?: object, error?: string, matches?: object[] }}
 */
export function resolveBudgetForNameAndYear(budgets = [], budgetName = '', academicYear = '') {
  const name = String(budgetName ?? '').trim();
  const ay = String(academicYear ?? '').trim();
  if (!name || !ay) return { ok: false, error: 'missing', matches: [] };
  const matches = deduplicateBudgetsByStableIdentity(budgets).filter(b => b.budgetName === name && b.academicYear === ay);
  if (matches.length === 0) return { ok: false, error: 'missing_year_group', matches };
  if (matches.length > 1) return { ok: false, error: 'duplicate_year_group', matches };
  return { ok: true, budget: matches[0], matches };
}

/**
 * Derive budget group from academicYear + unitCode for hour edit.
 * @returns {{ status: 'unique'|'none'|'multiple', budgets: object[] }}
 */
export function findBudgetsByYearAndUnit(budgets = [], academicYear = '', unitCode = '') {
  const ay = String(academicYear ?? '').trim();
  const code = String(unitCode ?? '').trim();
  const matches = deduplicateBudgetsByStableIdentity(budgets).filter(b =>
    b.academicYear === ay && b.unitCodes.includes(code)
  );
  if (matches.length === 1) return { status: 'unique', budgets: matches };
  if (matches.length === 0) return { status: 'none', budgets: [] };
  return { status: 'multiple', budgets: matches };
}

/** Safe display model for the derived hour-setting budget unit column. */
export function deriveHourBudgetUnit(budgets = [], academicYear = '', unitCode = '') {
  const resolved = findBudgetsByYearAndUnit(budgets, academicYear, unitCode);
  if (resolved.status === 'unique') {
    return {
      ...resolved,
      budget: resolved.budgets[0],
      budgetName: resolved.budgets[0].budgetName,
      label: resolved.budgets[0].budgetName,
      warning: false
    };
  }
  if (resolved.status === 'multiple') {
    return { ...resolved, budget: null, budgetName: '', label: '預算單位異常', warning: true };
  }
  return { ...resolved, budget: null, budgetName: '', label: '未對應預算單位', warning: true };
}

export function budgetOptionValue(budget) {
  const b = normalizeBudgetRecord(budget || {});
  if (b.id) return b.id;
  return `${b.academicYear}::${b.budgetName}`;
}

export function findBudgetByOptionValue(budgets = [], value = '', academicYear = '') {
  const v = String(value ?? '').trim();
  const ay = String(academicYear ?? '').trim();
  const list = getValidBudgetsForYear(budgets, ay);
  if (!v) return null;
  const byId = list.find(b => b.id === v);
  if (byId) return byId;
  if (v.includes('::')) {
    const [y, ...rest] = v.split('::');
    const name = rest.join('::');
    return list.find(b => b.academicYear === y && b.budgetName === name) || null;
  }
  // fallback: treat as budgetName within year
  const byName = list.filter(b => b.budgetName === v);
  if (byName.length === 1) return byName[0];
  return null;
}

/** Detect same-year duplicate budgetName (anomaly). */
export function getDuplicateBudgetNameYears(budgets = [], budgetName = '') {
  const name = String(budgetName ?? '').trim();
  const map = new Map();
  getValidBudgets(budgets)
    .filter(b => b.budgetName === name)
    .forEach(b => {
      map.set(b.academicYear, (map.get(b.academicYear) || 0) + 1);
    });
  return [...map.entries()].filter(([, n]) => n > 1).map(([ay]) => ay);
}

/**
 * Filter calendar rows by selected budgetName using per-year unitCodes.
 * @returns {{ rows: object[], warnings: string[], excludedYears: string[] }}
 */
export function filterCalendarRowsByBudgetScope(rows = [], budgets = [], budgetName = '', opts = {}) {
  const name = String(budgetName ?? '').trim();
  const warnings = [];
  const excludedYears = [];
  if (!name) return { rows: [], warnings: ['請先選擇預算單位'], excludedYears };

  const yearCache = new Map();
  const out = [];

  (rows || []).forEach(row => {
    const ay = String(row.academicYear ?? '').trim();
    if (!ay) return;
    if (opts.academicYear && ay !== String(opts.academicYear)) return;
    if (opts.startDate && opts.endDate) {
      if (row.date < opts.startDate || row.date > opts.endDate) return;
    }

    if (!yearCache.has(ay)) {
      yearCache.set(ay, resolveBudgetForNameAndYear(budgets, name, ay));
    }
    const resolved = yearCache.get(ay);
    if (!resolved.ok) {
      if (!excludedYears.includes(ay)) {
        excludedYears.push(ay);
        if (resolved.error === 'duplicate_year_group') {
          warnings.push(`${ay} 學年度「${name}」存在重複預算單位資料，該年度作息已排除`);
        } else if (resolved.error === 'missing_year_group') {
          warnings.push(`${ay} 學年度沒有預算單位「${name}」，該年度作息已排除`);
        }
      }
      return;
    }
    const codes = new Set(resolved.budget.unitCodes);
    if (codes.has(String(row.unitCode || '').trim())) {
      out.push(row);
    }
  });

  return { rows: out, warnings, excludedYears };
}

export function getAllowedUnitCodesForBudgetNameYear(budgets = [], budgetName = '', academicYear = '') {
  const resolved = resolveBudgetForNameAndYear(budgets, budgetName, academicYear);
  if (!resolved.ok) return { ok: false, unitCodes: [], error: resolved.error, matches: resolved.matches };
  return { ok: true, unitCodes: resolved.budget.unitCodes.slice(), budget: resolved.budget };
}
