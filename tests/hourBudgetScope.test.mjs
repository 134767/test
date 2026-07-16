import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeBudgetOptionsForYear,
  budgetStableIdentity,
  deduplicateBudgetsByStableIdentity,
  diagnoseBudgetDuplicateGroups,
  getValidBudgetsForYear,
  getDistinctValidBudgetNames,
  getYearsForBudgetName,
  resolveBudgetForNameAndYear,
  deriveHourBudgetUnit,
  findBudgetsByYearAndUnit,
  filterCalendarRowsByBudgetScope,
  budgetOptionValue,
  findBudgetByOptionValue
} from '../js/hourBudgetScopeUtils.js';

const budgets = [
  { id: 'B1', academicYear: '114', budgetName: 'Group_Alpha', unitCodes: ['U_A1', 'U_A2'], budgetAmount: 1 },
  { id: 'B2', academicYear: '114', budgetName: 'Group_Beta', unitCodes: ['U_B1'], budgetAmount: 1 },
  { id: 'B3', academicYear: '115', budgetName: 'Group_Alpha', unitCodes: ['U_A1'], budgetAmount: 1 },
  { id: 'B4', academicYear: '115', budgetName: 'Group_Beta', unitCodes: ['U_B1', 'U_B2'], budgetAmount: 1 },
  { id: 'B5', academicYear: '114', budgetName: '', unitCodes: ['U_X'], budgetAmount: 1 },
  { id: 'B6', academicYear: '114', budgetName: 'Empty', unitCodes: [], budgetAmount: 1 }
];

test('valid budgets for year exclude invalid records', () => {
  const list = getValidBudgetsForYear(budgets, '114');
  assert.equal(list.length, 2);
  assert.deepEqual(list.map(b => b.budgetName).sort(), ['Group_Alpha', 'Group_Beta']);
});

test('distinct budget names across years', () => {
  assert.deepEqual(getDistinctValidBudgetNames(budgets), ['Group_Alpha', 'Group_Beta']);
});

test('years for budget name newest first', () => {
  assert.deepEqual(getYearsForBudgetName(budgets, 'Group_Alpha'), ['115', '114']);
});

test('resolve unique budget for name+year', () => {
  const r = resolveBudgetForNameAndYear(budgets, 'Group_Alpha', '114');
  assert.equal(r.ok, true);
  assert.deepEqual(r.budget.unitCodes, ['U_A1', 'U_A2']);
});

test('resolve missing year group', () => {
  const r = resolveBudgetForNameAndYear(budgets, 'Group_Alpha', '113');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'missing_year_group');
});

test('resolve duplicate year group anomaly', () => {
  const dups = [
    ...budgets,
    { id: 'Bdup', academicYear: '114', budgetName: 'Group_Alpha', unitCodes: ['U_Z'], budgetAmount: 1 }
  ];
  const r = resolveBudgetForNameAndYear(dups, 'Group_Alpha', '114');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'duplicate_year_group');
  assert.equal(r.matches.length, 2);
});

test('edit derivation unique match', () => {
  const r = findBudgetsByYearAndUnit(budgets, '114', 'U_A1');
  assert.equal(r.status, 'unique');
  assert.equal(r.budgets[0].budgetName, 'Group_Alpha');
});

test('edit derivation no match', () => {
  const r = findBudgetsByYearAndUnit(budgets, '114', 'NOPE');
  assert.equal(r.status, 'none');
});

test('edit derivation multiple match', () => {
  const bad = [
    { id: 'X1', academicYear: '114', budgetName: 'A', unitCodes: ['U1'], budgetAmount: 1 },
    { id: 'X2', academicYear: '114', budgetName: 'B', unitCodes: ['U1'], budgetAmount: 1 }
  ];
  const r = findBudgetsByYearAndUnit(bad, '114', 'U1');
  assert.equal(r.status, 'multiple');
  assert.equal(r.budgets.length, 2);
});

test('hour table budget-unit display distinguishes unique, none, and multiple', () => {
  assert.equal(deriveHourBudgetUnit(budgets, '114', 'U_A1').label, 'Group_Alpha');
  const none = deriveHourBudgetUnit(budgets, '114', 'NOPE');
  assert.equal(none.status, 'none');
  assert.equal(none.label, '未對應預算單位');
  assert.equal(none.warning, true);
  const multiple = deriveHourBudgetUnit([
    { id: 'X1', academicYear: '114', budgetName: 'A', unitCodes: ['U1'], budgetAmount: 1 },
    { id: 'X2', academicYear: '114', budgetName: 'B', unitCodes: ['U1'], budgetAmount: 1 }
  ], '114', 'U1');
  assert.equal(multiple.status, 'multiple');
  assert.equal(multiple.label, '預算單位異常');
  assert.equal(multiple.warning, true);
});

test('filter rows academic year scoped to group units only', () => {
  const rows = [
    { id: '1', date: '2025-09-01', academicYear: '114', unitCode: 'U_A1' },
    { id: '2', date: '2025-09-01', academicYear: '114', unitCode: 'U_B1' },
    { id: '3', date: '2025-09-01', academicYear: '114', unitCode: 'U_A2' }
  ];
  const out = filterCalendarRowsByBudgetScope(rows, budgets, 'Group_Alpha', { academicYear: '114' });
  assert.deepEqual(out.rows.map(r => r.unitCode).sort(), ['U_A1', 'U_A2']);
});

test('cross year uses per-year unitCodes', () => {
  const rows = [
    { id: '1', date: '2025-09-01', academicYear: '114', unitCode: 'U_A2' }, // alpha 114 has A2
    { id: '2', date: '2026-09-01', academicYear: '115', unitCode: 'U_A2' }, // alpha 115 only A1 → exclude
    { id: '3', date: '2026-09-02', academicYear: '115', unitCode: 'U_A1' }
  ];
  const out = filterCalendarRowsByBudgetScope(rows, budgets, 'Group_Alpha', {
    startDate: '2025-08-01',
    endDate: '2026-10-01'
  });
  assert.deepEqual(out.rows.map(r => r.id).sort(), ['1', '3']);
});

test('budget option value prefers id', () => {
  assert.equal(budgetOptionValue({ id: 'B1', academicYear: '114', budgetName: 'G' }), 'B1');
  const found = findBudgetByOptionValue(budgets, 'B1', '114');
  assert.equal(found.budgetName, 'Group_Alpha');
});

test('same runtime id repeated three times produces one unique option', () => {
  const repeated = [budgets[0], structuredClone(budgets[0]), structuredClone(budgets[0])];
  const result = analyzeBudgetOptionsForYear(repeated, '114');
  assert.equal(result.options.length, 1);
  assert.equal(result.options[0].status, 'unique');
  assert.equal(result.options[0].value, 'B1');
  assert.equal(result.options[0].rawRecordCount, 3);
  assert.equal(deduplicateBudgetsByStableIdentity(repeated).length, 1);
});

test('different ids with same year and name produce one disabled conflict model', () => {
  const conflicts = [
    { id: 'D1', academicYear: '114', budgetName: '讀服組', unitCodes: ['U1'], budgetAmount: 10 },
    { id: 'D2', academicYear: '114', budgetName: '讀服組', unitCodes: ['U2'], budgetAmount: 20 },
    { id: 'D3', academicYear: '114', budgetName: '讀服組', unitCodes: ['U3'], budgetAmount: 30 }
  ];
  const result = analyzeBudgetOptionsForYear(conflicts, '114');
  assert.equal(result.options.length, 1);
  assert.equal(result.options[0].status, 'duplicate');
  assert.equal(result.options[0].value, '');
  assert.equal(result.options[0].recordCount, 3);
  assert.equal(result.duplicateGroups.length, 1);
});

test('same name in different academic years remains unique per year', () => {
  const crossYear = [
    { id: 'Y114', academicYear: '114', budgetName: '讀服組', unitCodes: ['U1'], budgetAmount: 10 },
    { id: 'Y115', academicYear: '115', budgetName: '讀服組', unitCodes: ['U2'], budgetAmount: 20 }
  ];
  assert.equal(analyzeBudgetOptionsForYear(crossYear, '114').options[0].status, 'unique');
  assert.equal(analyzeBudgetOptionsForYear(crossYear, '115').options[0].status, 'unique');
});

test('fallback identity sorts unit codes and diagnostics classify duplicate categories', () => {
  const a = { academicYear: '114', budgetName: '無編號', unitCodes: ['U2', 'U1'], budgetAmount: 10, note: 'n' };
  const b = { ...a, unitCodes: ['U1', 'U2'] };
  assert.equal(budgetStableIdentity(a), budgetStableIdentity(b));
  const runtime = diagnoseBudgetDuplicateGroups([a, b])[0];
  assert.equal(runtime.category, 'RUNTIME_DUPLICATE_SAME_ID');
  assert.equal(runtime.uniqueIdentityCount, 1);
  const persisted = diagnoseBudgetDuplicateGroups([
    { ...a, id: 'P1' },
    { ...a, id: 'P2' }
  ])[0];
  assert.equal(persisted.category, 'PERSISTED_DUPLICATE_DIFFERENT_IDS');
  assert.deepEqual(persisted.recordIds, ['P1', 'P2']);
});
