import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getValidBudgetsForYear,
  getDistinctValidBudgetNames,
  getYearsForBudgetName,
  resolveBudgetForNameAndYear,
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
