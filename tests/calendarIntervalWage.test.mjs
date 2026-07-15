import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CALENDAR_WAGE_YEAR_WARNING,
  buildCalendarRowFromHourSetting,
  getAcademicYearDateRange,
  getAcademicYearRangeHint,
  getCalendarWagePreviewText,
  validateCalendarIntervalRange,
  validateIntervalHourlyWage
} from '../js/calendarWageUtils.js';

const match={id:'HOUR_same_source',scheduleType:'平日',unitCode:'U01',unitName:'單位',startTime:'08:00',endTime:'16:00',hours:8};
const calendarPage=fs.readFileSync(new URL('../js/calendarPage.js',import.meta.url),'utf8');

test('interval wage is required, finite, and greater than zero',()=>{
  for(const value of ['',0,-1,Infinity,NaN])assert.equal(validateIntervalHourlyWage(value).ok,false);
  assert.deepEqual(validateIntervalHourlyWage('190'),{ok:true,error:'',hourlyWage:190});
});

test('calendar row wage comes from interval input and keeps source id',()=>{
  const legacyMatch={...match,hourlyWage:999};
  const row=buildCalendarRowFromHourSetting({date:'2025-08-01',academicYear:'114',weekday:'星期五',match:legacyMatch,hourlyWage:190});
  assert.equal(row.hourlyWage,190);
  assert.equal(row.sourceHourSettingId,match.id);
  assert.notEqual(row.hourlyWage,legacyMatch.hourlyWage);
});

test('fixed government wage warning is distinct from academic year range hint',()=>{
  assert.equal(CALENDAR_WAGE_YEAR_WARNING,'跨年度要考慮政府薪資調漲問題，建議固定新增區間為 1/1～12/31。');
  const hint=getAcademicYearRangeHint('114');
  assert.equal(hint,'所選學年度的日期必須介於 2025-08-01～2026-07-31。');
  assert.notEqual(hint,CALENDAR_WAGE_YEAR_WARNING);
  assert.doesNotMatch(hint,/政府薪資調漲|1\/1～12\/31/);
});

test('wage preview has explicit invalid and valid input states',()=>{
  assert.equal(getCalendarWagePreviewText(''),'本次套用時薪：尚未輸入有效時薪');
  assert.equal(getCalendarWagePreviewText(0),'本次套用時薪：尚未輸入有效時薪');
  assert.equal(getCalendarWagePreviewText(190),'本次套用時薪：190');
});

test('preview is driven by wage input and never by hour setting residual wage',()=>{
  const previewSource=calendarPage.slice(calendarPage.indexOf('function updateIntervalPreview()'),calendarPage.indexOf('async function handleIntervalConfirm()'));
  assert.match(calendarPage,/iWage\.addEventListener\('input', updateIntervalPreview\)/);
  assert.match(previewSource,/getCalendarWagePreviewText\(wageInput\)/);
  assert.doesNotMatch(previewSource,/m\.hourlyWage|match\.hourlyWage/);
  assert.match(calendarPage,/id="int-wage-year-warning"[\s\S]*id="int-academic-year-range-hint"/);
});

test('selected academic year restricts date range',()=>{
  assert.deepEqual(getAcademicYearDateRange('114'),{start:'2025-08-01',end:'2026-07-31'});
  assert.equal(validateCalendarIntervalRange('2025-08-01','2026-07-31','114').ok,true);
  assert.equal(validateCalendarIntervalRange('2025-07-31','2026-07-31','114').ok,false);
  assert.equal(validateCalendarIntervalRange('2025-08-01','2026-08-01','114').ok,false);
});
