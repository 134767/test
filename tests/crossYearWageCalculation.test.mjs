import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendarRowFromHourSetting } from '../js/calendarWageUtils.js';
import { sumRowsEstimateForUnitCodes } from '../js/budgetGroupUtils.js';

test('same hour setting supports old and new period wage snapshots',()=>{
  const match={id:'HOUR_same_source',scheduleType:'平日',unitCode:'U01',unitName:'單位',startTime:'08:00',endTime:'16:00',hours:8};
  const rows=[
    buildCalendarRowFromHourSetting({date:'2025-12-31',academicYear:'114',weekday:'星期三',match,hourlyWage:190}),
    buildCalendarRowFromHourSetting({date:'2026-01-01',academicYear:'114',weekday:'星期四',match,hourlyWage:200})
  ];
  assert.equal(rows[0].sourceHourSettingId,rows[1].sourceHourSettingId);
  assert.deepEqual(rows.map(row=>row.hourlyWage),[190,200]);
  assert.equal(sumRowsEstimateForUnitCodes(rows,['U01']),8*190+8*200);
});
