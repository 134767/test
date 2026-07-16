import { deriveHourBudgetUnit } from './hourBudgetScopeUtils.js';

export function normalizeHourFilters(filters = {}) {
  return {
    academicYear: String(filters.academicYear ?? '').trim(),
    budgetName: String(filters.budgetName ?? '').trim(),
    scheduleType: String(filters.scheduleType ?? '').trim(),
    unitCode: String(filters.unitCode ?? '').trim(),
    keyword: String(filters.keyword ?? '').trim().toLowerCase()
  };
}

/** Pure AND-filter for the hour setting table. */
export function filterHourSettingsAdvanced({
  hourSettings = [],
  budgets = [],
  academicYear = '',
  budgetName = '',
  scheduleType = '',
  unitCode = '',
  keyword = ''
} = {}) {
  const filters = normalizeHourFilters({ academicYear, budgetName, scheduleType, unitCode, keyword });
  return (hourSettings || []).filter(item => {
    const derived = deriveHourBudgetUnit(budgets, item?.academicYear, item?.unitCode);
    if (filters.academicYear && String(item?.academicYear ?? '').trim() !== filters.academicYear) return false;
    if (filters.budgetName && derived.label !== filters.budgetName) return false;
    if (filters.scheduleType && String(item?.scheduleType ?? '').trim() !== filters.scheduleType) return false;
    if (filters.unitCode && String(item?.unitCode ?? '').trim() !== filters.unitCode) return false;
    if (!filters.keyword) return true;
    const haystack = [
      item?.academicYear,
      derived.label,
      item?.scheduleType,
      item?.unitCode,
      item?.unitName,
      item?.weekdays,
      item?.startTime,
      item?.endTime,
      item?.hours,
      item?.note
    ].map(value => String(value ?? '').toLowerCase()).join('\u0001');
    return haystack.includes(filters.keyword);
  });
}
