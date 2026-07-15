// Pure helpers for PTB 1.6.0 hour-setting batch copy. No DOM / dataStore deps.
import { normalizeBudgetUnitCodes } from './budgetGroupUtils.js';

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

/**
 * Plan batch copy without side effects.
 */
export function planBatchHourCopy({
  sourceIds = [],
  targetAcademicYear = '',
  hourSettings = [],
  units = [],
  budgets = []
} = {}) {
  const targetAy = String(targetAcademicYear ?? '').trim();
  const ids = Array.isArray(sourceIds) ? sourceIds.map(id => String(id || '').trim()).filter(Boolean) : [];
  const byId = new Map((hourSettings || []).map(h => [String(h.id || ''), h]));
  const unitByCode = new Map((units || []).map(u => [String(u.unitCode || '').trim(), u]));
  const scopeUnits = getValidBudgetUnitCodesForYear(budgets, targetAy);

  const existingKeys = new Set((hourSettings || []).map(h => buildHourSettingDuplicateKey(h)));
  const batchKeys = new Set();

  const toAdd = [];
  const skipped = [];
  const counters = {
    selected: ids.length,
    added: 0,
    duplicateSkipped: 0,
    invalidUnitSkipped: 0,
    outOfBudgetScopeSkipped: 0,
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

    if (!scopeUnits.has(unitCode)) {
      counters.outOfBudgetScopeSkipped += 1;
      skipped.push({
        sourceId: id,
        unitName: unit.unitName || unitCode,
        scheduleType: src.scheduleType || '',
        time,
        reason: '目標學年度預算群組未包含此單位'
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
    selected: counters.selected,
    targetAcademicYear: targetAy,
    toAdd,
    skipped,
    counters
  };
}
