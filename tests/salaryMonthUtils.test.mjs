import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUnitOrderRank, sortUnitCodesByUnitSettings, calculateMonthlyActualTotal } from '../js/salaryMonthUtils.js';

const units = [{ unitCode: 'U3' }, { unitCode: 'U1' }, { unitCode: 'U2' }];

test('unit codes follow unit settings order and scope subsequences', () => {
  assert.deepEqual(sortUnitCodesByUnitSettings(['U1', 'U2', 'U3'], units), ['U3', 'U1', 'U2']);
  assert.deepEqual(sortUnitCodesByUnitSettings(['U2', 'U1'], units), ['U1', 'U2']);
  assert.equal(buildUnitOrderRank(units).get('U1'), 1);
});

test('unit ordering deduplicates, puts unknown codes last, and preserves inputs', () => {
  const codes = ['UX2', 'U2', 'U1', 'U2', 'UX1'];
  const beforeCodes = structuredClone(codes);
  const beforeUnits = structuredClone(units);
  assert.deepEqual(sortUnitCodesByUnitSettings(codes, units), ['U1', 'U2', 'UX1', 'UX2']);
  assert.deepEqual(codes, beforeCodes);
  assert.deepEqual(units, beforeUnits);
});

test('monthly actual totals include all scoped units without crossing month, year, or scope', () => {
  const entries = [
    { academicYear: '114', year: 2025, month: 8, unitCode: 'U1', actualAmount: 100 },
    { academicYear: '114', year: 2025, month: 8, unitCode: 'U2', actualAmount: 200 },
    { academicYear: '114', year: 2025, month: 8, unitCode: 'U3', actualAmount: 300 },
    { academicYear: '114', year: 2025, month: 9, unitCode: 'U1', actualAmount: 50 },
    { academicYear: '114', year: 2025, month: 9, unitCode: 'U3', actualAmount: 25 },
    { academicYear: '114', year: 2025, month: 8, unitCode: 'OUT', actualAmount: 999 },
    { academicYear: '115', year: 2025, month: 8, unitCode: 'U1', actualAmount: 999 }
  ];
  assert.equal(calculateMonthlyActualTotal({ entries, ym: '2025-08', academicYear: '114', unitCodes: ['U1', 'U2', 'U3'] }), 600);
  assert.equal(calculateMonthlyActualTotal({ entries, ym: '2025-09', academicYear: '114', unitCodes: ['U1', 'U2', 'U3'] }), 75);
  assert.equal(calculateMonthlyActualTotal({ entries, ym: '2025-10', academicYear: '114', unitCodes: ['U1', 'U2', 'U3'] }), 0);
});
