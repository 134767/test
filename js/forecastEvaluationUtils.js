function parseForecastIntervals(value) {
  let parsed = value;
  let parseError = false;

  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    if (!trimmed) return { intervals: [], parseError: false };
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { intervals: [], parseError: true };
    }
  }

  if (!Array.isArray(parsed)) {
    parseError = parsed !== null && parsed !== undefined;
    return { intervals: [], parseError };
  }

  return {
    intervals: parsed.map(item => ({
      startYm: String(item?.startYm || '').trim(),
      endYm: String(item?.endYm || '').trim(),
      hourlyWage: Number(item?.hourlyWage) || 0,
      note: String(item?.note || ''),
      ...(item?.monthlyHours !== undefined
        ? { monthlyHours: Number(item.monthlyHours) || 0 }
        : {})
    })),
    parseError
  };
}

export function normalizeForecastIntervals(value) {
  return parseForecastIntervals(value).intervals;
}

export function normalizeForecastEvaluationRecord(record = {}) {
  const parsed = parseForecastIntervals(record?.intervals);
  const normalized = {
    id: String(record?.id || ''),
    name: String(record?.name || '').trim(),
    budget: Number(record?.budget) || 0,
    baseHourlyWage: Number(record?.baseHourlyWage) || 0,
    intervals: parsed.intervals,
    createdAt: String(record?.createdAt || ''),
    updatedAt: String(record?.updatedAt || '')
  };
  if (parsed.parseError) normalized._intervalParseError = true;
  return normalized;
}

export function normalizeForecastEvaluations(records) {
  return (Array.isArray(records) ? records : []).map(normalizeForecastEvaluationRecord);
}

function isValidYm(value) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(value || '').trim());
  return !!match;
}

export function validateForecastEvaluationDraft(draft, existingRecords = []) {
  const normalized = normalizeForecastEvaluationRecord(draft || {});
  if (!normalized.name) return { ok: false, error: '評估名稱不可空白' };
  if (!Number.isFinite(Number(draft?.budget)) || Number(draft.budget) < 0) {
    return { ok: false, error: '評估預算不可小於 0' };
  }
  const duplicate = normalizeForecastEvaluations(existingRecords).some(record =>
    record.id !== normalized.id && record.name.toLocaleLowerCase('zh-Hant') === normalized.name.toLocaleLowerCase('zh-Hant')
  );
  if (duplicate) return { ok: false, error: '評估名稱不可重複' };
  if (!normalized.intervals.length) return { ok: false, error: '至少需要 1 筆帶入區間' };
  for (const interval of normalized.intervals) {
    if (!isValidYm(interval.startYm) || !isValidYm(interval.endYm)) {
      return { ok: false, error: '區間必須使用合法年月（YYYY-MM）' };
    }
    if (interval.startYm > interval.endYm) return { ok: false, error: '結束年月不可早於起始年月' };
    if (!Number.isFinite(Number(interval.hourlyWage)) || Number(interval.hourlyWage) < 0) {
      return { ok: false, error: '區間預估時薪不可小於 0' };
    }
  }
  return { ok: true, value: normalized };
}
