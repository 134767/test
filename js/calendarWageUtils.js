export const CALENDAR_WAGE_YEAR_WARNING =
  '跨年度要考慮政府薪資調漲問題，建議固定新增區間為 1/1～12/31。';

export function getAcademicYearDateRange(academicYear) {
  const rocYear = Number(String(academicYear ?? '').trim());
  if (!Number.isInteger(rocYear) || rocYear <= 0) return null;
  const startYear = rocYear + 1911;
  return {
    start: `${startYear}-08-01`,
    end: `${startYear + 1}-07-31`
  };
}

export function getAcademicYearRangeHint(academicYear) {
  const range = getAcademicYearDateRange(academicYear);
  return range ? `所選學年度的日期必須介於 ${range.start}～${range.end}。` : '';
}

export function validateCalendarIntervalRange(startDate, endDate, academicYear) {
  const range = getAcademicYearDateRange(academicYear);
  if (!range) return { ok: false, error: '請選擇學年度', range: null };
  if (!startDate || !endDate || startDate > endDate) {
    return { ok: false, error: '日期區間錯誤', range };
  }
  if (startDate < range.start || endDate > range.end) {
    return {
      ok: false,
      error: `日期必須落在所選學年度範圍 ${range.start}～${range.end}`,
      range
    };
  }
  return { ok: true, error: '', range };
}

export function validateIntervalHourlyWage(value) {
  const hourlyWage = Number(value);
  if (!Number.isFinite(hourlyWage) || hourlyWage <= 0) {
    return { ok: false, error: '請輸入大於 0 的有效時薪', hourlyWage: 0 };
  }
  return { ok: true, error: '', hourlyWage };
}

export function getCalendarWagePreviewText(value) {
  const result = validateIntervalHourlyWage(value);
  return result.ok
    ? `本次套用時薪：${result.hourlyWage}`
    : '本次套用時薪：尚未輸入有效時薪';
}

export function buildCalendarRowFromHourSetting({ date, academicYear, weekday, match, hourlyWage }) {
  return {
    date,
    academicYear,
    weekday,
    scheduleType: match.scheduleType,
    unitCode: match.unitCode,
    unitName: match.unitName,
    startTime: match.startTime,
    endTime: match.endTime,
    hours: match.hours,
    hourlyWage,
    sourceHourSettingId: match.id
  };
}
