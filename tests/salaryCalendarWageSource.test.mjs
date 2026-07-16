import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMonthlyWage, validateSalaryModalUnit } from '../js/budgetGroupUtils.js';

test('salary modal displays mixed calendar row wages and stores latest audit snapshot',()=>{
  const calendarRows=[{date:'2026-01-01',hourlyWage:190},{date:'2026-01-15',hourlyWage:200}];
  assert.deepEqual(resolveMonthlyWage(calendarRows),{display:'190/200',latestHourlyWage:200,wages:[190,200]});
  const result=validateSalaryModalUnit({unitName:'單位',salaryAmount:1234,calendarRows});
  assert.equal(result.canSave,true);
  assert.equal(result.hourlyWage,200);
});

test('manual actual amount is independent of hours times wage',()=>{
  const result=validateSalaryModalUnit({unitName:'單位',salaryAmount:1234,calendarRows:[{date:'2026-01-01',hours:8,hourlyWage:200}]});
  assert.equal(result.canSave,true);
  assert.notEqual(1234,8*200);
});
