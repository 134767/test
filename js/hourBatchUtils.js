// Pure helpers for PTB 1.6.0 hour-setting batch copy. No DOM / dataStore deps.
import { normalizeBudgetUnitCodes } from './budgetGroupUtils.js';
import {
  analyzeBudgetOptionsForYear,
  budgetOptionValue,
  deduplicateBudgetsByStableIdentity,
  findBudgetsByYearAndUnit,
  getValidBudgets
} from './hourBudgetScopeUtils.js';

/** Duplicate key: academicYear + scheduleType + unitCode + weekdays + startTime + endTime */
export function buildHourSettingDuplicateKey(item = {}) {
  return [
    String(item.academicYear ?? '').trim(),
    String(item.scheduleType ?? '').trim(),
    String(item.unitCode ?? '').trim(),
    String(item.weekdays ?? '').trim(),
    String(item.startTime ?? '').trim(),
    String(item.endTime ?? '').trim()
  ].join('\u0001');
}

/** Unique non-empty academic years from budgets, newest first. */
export function getUniqueBudgetAcademicYears(budgets = []) {
  const years = [...new Set(
    (budgets || [])
      .map(b => String(b?.academicYear ?? '').trim())
      .filter(Boolean)
  )];
  years.sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    const aNum = Number.isFinite(na) && String(na) === a;
    const bNum = Number.isFinite(nb) && String(nb) === b;
    if (aNum && bNum) return nb - na;
    return b.localeCompare(a, 'zh-Hant');
  });
  return years;
}

/** Unit codes covered by at least one valid budget group in target academic year. */
export function getValidBudgetUnitCodesForYear(budgets = [], academicYear = '') {
  const ay = String(academicYear ?? '').trim();
  const set = new Set();
  if (!ay) return set;
  (budgets || []).forEach(b => {
    if (String(b?.academicYear ?? '').trim() !== ay) return;
    if (!String(b?.budgetName ?? '').trim()) return;
    const codes = normalizeBudgetUnitCodes(b?.unitCodes);
    if (!codes.length) return;
    codes.forEach(code => set.add(code));
  });
  return set;
}

export function isUnitInTargetBudgetScope(budgets, academicYear, unitCode) {
  return getValidBudgetUnitCodesForYear(budgets, academicYear).has(String(unitCode ?? '').trim());
}

function resolveBudgetById(budgets = [], budgetId = '', academicYear = '') {
  const id = String(budgetId ?? '').trim();
  const ay = String(academicYear ?? '').trim();
  if (!id || !ay) return null;
  return deduplicateBudgetsByStableIdentity(budgets).find(b => budgetOptionValue(b) === id && b.academicYear === ay) || null;
}

function validateBudgetSelection(budgets, academicYear, budgetId, role) {
  const budget = resolveBudgetById(budgets, budgetId, academicYear);
  if (!budget) return { ok: false, budget: null, error: `${role}預算單位不存在或學年度不符` };
  const option = analyzeBudgetOptionsForYear(budgets, academicYear).options
    .find(item => item.budgetName === budget.budgetName);
  if (!option || option.status !== 'unique' || option.value !== budgetOptionValue(budget)) {
    return {
      ok: false,
      budget,
      error: `${role}學年度的預算單位「${budget.budgetName}」存在重複資料，請先至預算設定修正。`
    };
  }
  return { ok: true, budget, option };
}

/** Source years must have both real hour rows and at least one valid budget. */
export function getBatchSourceAcademicYears(hourSettings = [], budgets = []) {
  const hourYears = new Set((hourSettings || []).map(h => String(h?.academicYear ?? '').trim()).filter(Boolean));
  return getUniqueBudgetAcademicYears(
    getValidBudgets(budgets).filter(b => hourYears.has(b.academicYear))
  );
}

/** Exact source preview scope: selected budget's year and unitCodes only. */
export function filterHourSettingsByBudget({
  hourSettings = [],
  budgets = [],
  academicYear = '',
  budgetId = ''
} = {}) {
  const budget = resolveBudgetById(budgets, budgetId, academicYear);
  if (!budget) return { ok: false, budget: null, rows: [], error: '找不到指定的來源預算單位' };
  const codes = new Set(budget.unitCodes);
  const rows = (hourSettings || []).filter(h =>
    String(h?.academicYear ?? '').trim() === budget.academicYear &&
    codes.has(String(h?.unitCode ?? '').trim())
  );
  return { ok: true, budget, rows };
}

/** Auto-select only a unique same-name target budget. */
export function findSameNameTargetBudget(budgets = [], sourceBudget = null, targetAcademicYear = '') {
  if (!sourceBudget) return null;
  const option = analyzeBudgetOptionsForYear(budgets, targetAcademicYear).options
    .find(item => item.budgetName === sourceBudget.budgetName);
  return option?.status === 'unique' ? option.budget : null;
}

/**
 * Plan batch copy without side effects.
 */
export function planBatchHourCopy({
  sourceIds = [],
  sourceAcademicYear = '',
  sourceBudgetId = '',
  targetAcademicYear = '',
  targetBudgetId = '',
  hourSettings = [],
  units = [],
  budgets = []
} = {}) {
  const sourceAy = String(sourceAcademicYear ?? '').trim();
  const targetAy = String(targetAcademicYear ?? '').trim();
  const ids = Array.isArray(sourceIds) ? sourceIds.map(id => String(id || '').trim()).filter(Boolean) : [];
  const byId = new Map((hourSettings || []).map(h => [String(h.id || ''), h]));
  const unitByCode = new Map((units || []).map(u => [String(u.unitCode || '').trim(), u]));
  const sourceValidation = validateBudgetSelection(budgets, sourceAy, sourceBudgetId, '來源');
  const targetValidation = validateBudgetSelection(budgets, targetAy, targetBudgetId, '目標');
  const sourceBudget = sourceValidation.budget;
  const targetBudget = targetValidation.budget;

  const base = {
    selected: ids.length,
    sourceAcademicYear: sourceAy,
    sourceBudgetId: String(sourceBudgetId || ''),
    sourceBudgetName: sourceBudget?.budgetName || '',
    targetAcademicYear: targetAy,
    targetBudgetId: String(targetBudgetId || ''),
    targetBudgetName: targetBudget?.budgetName || '',
    toAdd: [],
    skipped: []
  };
  if (!sourceValidation.ok) return { ...base, ok: false, error: sourceValidation.error, counters: { selected: ids.length, added: 0 } };
  if (!targetValidation.ok) return { ...base, ok: false, error: targetValidation.error, counters: { selected: ids.length, added: 0 } };

  const sourceScopeUnits = new Set(sourceBudget.unitCodes);
  const targetScopeUnits = new Set(targetBudget.unitCodes);

  const existingKeys = new Set((hourSettings || []).map(h => buildHourSettingDuplicateKey(h)));
  const batchKeys = new Set();

  const toAdd = [];
  const skipped = [];
  const counters = {
    selected: ids.length,
    added: 0,
    duplicateSkipped: 0,
    invalidUnitSkipped: 0,
    sourceScopeSkipped: 0,
    outOfBudgetScopeSkipped: 0,
    targetScopeAnomalySkipped: 0,
    missingSourceSkipped: 0
  };

  ids.forEach(id => {
    const src = byId.get(id);
    if (!src) {
      counters.missingSourceSkipped += 1;
      skipped.push({
        sourceId: id,
        unitName: id,
        scheduleType: '',
        time: '',
        reason: '找不到來源資料'
      });
      return;
    }

    const unitCode = String(src.unitCode || '').trim();
    const unit = unitByCode.get(unitCode);
    const displayUnit = unit ? unit.unitName : (src.unitName || unitCode);
    const time = `${src.startTime || ''}~${src.endTime || ''}`;

    if (String(src.academicYear || '').trim() !== sourceAy) {
      counters.sourceScopeSkipped += 1;
      skipped.push({ sourceId: id, unitName: displayUnit, scheduleType: src.scheduleType || '', time, reason: '來源學年度不符' });
      return;
    }

    const sourceMapping = findBudgetsByYearAndUnit(budgets, sourceAy, unitCode);
    if (sourceMapping.status === 'multiple') {
      counters.sourceScopeSkipped += 1;
      skipped.push({ sourceId: id, unitName: displayUnit, scheduleType: src.scheduleType || '', time, reason: '來源年度預算單位範圍異常' });
      return;
    }
    if (!sourceScopeUnits.has(unitCode) || sourceMapping.status !== 'unique' || budgetOptionValue(sourceMapping.budgets[0]) !== budgetOptionValue(sourceBudget)) {
      counters.sourceScopeSkipped += 1;
      skipped.push({ sourceId: id, unitName: displayUnit, scheduleType: src.scheduleType || '', time, reason: '來源預算單位未包含此實際單位' });
      return;
    }

    if (!unit) {
      counters.invalidUnitSkipped += 1;
      skipped.push({
        sourceId: id,
        unitName: displayUnit,
        scheduleType: src.scheduleType || '',
        time,
        reason: '單位不存在於單位設定'
      });
      return;
    }

    const targetMapping = findBudgetsByYearAndUnit(budgets, targetAy, unitCode);
    if (targetMapping.status === 'multiple') {
      counters.targetScopeAnomalySkipped += 1;
      skipped.push({
        sourceId: id,
        unitName: unit.unitName || unitCode,
        scheduleType: src.scheduleType || '',
        time,
        reason: '目標年度預算單位範圍異常'
      });
      return;
    }

    if (!targetScopeUnits.has(unitCode) || targetMapping.status !== 'unique' || budgetOptionValue(targetMapping.budgets[0]) !== budgetOptionValue(targetBudget)) {
      counters.outOfBudgetScopeSkipped += 1;
      skipped.push({
        sourceId: id,
        unitName: unit.unitName || unitCode,
        scheduleType: src.scheduleType || '',
        time,
        reason: '目標預算單位未包含此實際單位'
      });
      return;
    }

    const payload = {
      academicYear: targetAy,
      scheduleType: src.scheduleType || '',
      unitCode,
      unitName: unit.unitName || unitCode,
      weekdays: src.weekdays || '',
      startTime: src.startTime || '',
      endTime: src.endTime || '',
      hours: Number(src.hours),
      note: src.note || ''
    };

    const key = buildHourSettingDuplicateKey(payload);
    if (existingKeys.has(key) || batchKeys.has(key)) {
      counters.duplicateSkipped += 1;
      skipped.push({
        sourceId: id,
        unitName: payload.unitName,
        scheduleType: payload.scheduleType,
        time,
        reason: '目標學年度已存在相同組合（學年度/作息/單位/週期/開館時間）'
      });
      return;
    }

    batchKeys.add(key);
    toAdd.push({ sourceId: id, payload });
  });

  counters.added = toAdd.length;
  return {
    ...base,
    ok: true,
    toAdd,
    skipped,
    counters
  };
}
