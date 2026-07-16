export function buildUnitOrderRank(units = []) {
  return new Map((units || []).map((unit, index) => [String(unit?.unitCode || '').trim(), index]));
}

export function sortUnitCodesByUnitSettings(unitCodes = [], units = []) {
  const rank = buildUnitOrderRank(units);
  return [...new Set((unitCodes || []).map(code => String(code ?? '').trim()).filter(Boolean))]
    .sort((a, b) => {
      const ra = rank.has(a) ? rank.get(a) : Number.MAX_SAFE_INTEGER;
      const rb = rank.has(b) ? rank.get(b) : Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b, 'zh-Hant');
    });
}

export function calculateMonthlyActualTotal({ entries = [], ym = '', academicYear = '', unitCodes = [] } = {}) {
  const allowed = new Set((unitCodes || []).map(code => String(code ?? '').trim()).filter(Boolean));
  const targetYm = String(ym || '').trim();
  const targetAy = String(academicYear || '').trim();
  return (entries || []).reduce((sum, entry) => {
    const entryMonth = `${entry?.year}-${String(entry?.month ?? '').padStart(2, '0')}`;
    if (entryMonth !== targetYm || String(entry?.academicYear ?? '').trim() !== targetAy) return sum;
    if (!allowed.has(String(entry?.unitCode ?? '').trim())) return sum;
    return sum + (Number(entry?.actualAmount) || 0);
  }, 0);
}
