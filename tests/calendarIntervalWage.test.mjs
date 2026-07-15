import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendarRowFromHourSetting, getAcademicYearDateRange, validateCalendarIntervalRange, validateIntervalHourlyWage } from '../js/calendarWageUtils.js';

const match={id:'HOUR_same_source',scheduleType:'平日',unitCode:'U01',unitName:'單位',startTime:'08:00',endTime:'16:00',hours:8};

test('interval wage is required, finite, and greater than zero',()=>{
  for(const value of ['',0,-1,Infinity,NaN])assert.equal(validateIntervalHourlyWage(value).ok,false);
  assert.deepEqual(validateIntervalHourlyWage('190'),{ok:true,error:'',hourlyWage:190});
});

test('calendar row wage comes from interval input and keeps source id',()=>{
  const row=buildCalendarRowFromHourSetting({date:'2025-08-01',academicYear:'114',weekday:'星期五',match,hourlyWage:190});
  assert.equal(row.hourlyWage,190);
  assert.equal(row.sourceHourSettingId,match.id);
  assert.equal(Object.hasOwn(match,'hourlyWage'),false);
});

test('selected academic year restricts date range',()=>{
  assert.deepEqual(getAcademicYearDateRange('114'),{start:'2025-08-01',end:'2026-07-31'});
  assert.equal(validateCalendarIntervalRange('2025-08-01','2026-07-31','114').ok,true);
  assert.equal(validateCalendarIntervalRange('2025-07-31','2026-07-31','114').ok,false);
  assert.equal(validateCalendarIntervalRange('2025-08-01','2026-08-01','114').ok,false);
});
