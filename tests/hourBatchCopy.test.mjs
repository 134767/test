import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHourSettingDuplicateKey,
  filterHourSettingsByBudget,
  findSameNameTargetBudget,
  getBatchSourceAcademicYears,
  planBatchHourCopy
} from '../js/hourBatchUtils.js';

const budgets = [
  { id: 'B114A', academicYear: '114', budgetName: '圖書館預算', unitCodes: ['U_A1', 'U_A2'], budgetAmount: 1 },
  { id: 'B114B', academicYear: '114', budgetName: '其他預算', unitCodes: ['U_B1'], budgetAmount: 1 },
  { id: 'B115A', academicYear: '115', budgetName: '圖書館預算', unitCodes: ['U_A1'], budgetAmount: 1 },
  { id: 'B115B', academicYear: '115', budgetName: '其他預算', unitCodes: ['U_A2', 'U_B1'], budgetAmount: 1 },
  { id: 'B116X', academicYear: '116', budgetName: '不同名稱', unitCodes: ['U_A1'], budgetAmount: 1 }
];

const rows = [
  { id: 'H1', academicYear: '114', scheduleType: '開學', unitCode: 'U_A1', unitName: 'A1 old', weekdays: '星期一', startTime: '08:00', endTime: '09:00', hours: 1, note: 'one' },
  { id: 'H2', academicYear: '114', scheduleType: '開學', unitCode: 'U_A2', unitName: 'A2 old', weekdays: '星期二', startTime: '09:00', endTime: '10:00', hours: 1, note: 'two' },
  { id: 'H3', academicYear: '114', scheduleType: '假日', unitCode: 'U_B1', unitName: 'B1 old', weekdays: '星期六', startTime: '10:00', endTime: '11:00', hours: 1, note: 'three' }
];

const units = [
  { unitCode: 'U_A1', unitName: 'A1 latest' },
  { unitCode: 'U_A2', unitName: 'A2 latest' },
  { unitCode: 'U_B1', unitName: 'B1 latest' }
];

const plan = overrides => planBatchHourCopy({
  sourceIds: ['H1', 'H2'],
  sourceAcademicYear: '114',
  sourceBudgetId: 'B114A',
  targetAcademicYear: '115',
  targetBudgetId: 'B115A',
  hourSettings: rows,
  units,
  budgets,
  ...overrides
});

test('source academic years require both hour rows and valid budgets', () => {
  assert.deepEqual(getBatchSourceAcademicYears(rows, budgets), ['114']);
});

test('source budget filter excludes same-year other budget units', () => {
  const result = filterHourSettingsByBudget({ hourSettings: rows, budgets, academicYear: '114', budgetId: 'B114A' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.rows.map(row => row.id), ['H1', 'H2']);
});

test('same-name cross-year target auto match is unique only', () => {
  assert.equal(findSameNameTargetBudget(budgets, budgets[0], '115')?.id, 'B115A');
  assert.equal(findSameNameTargetBudget(budgets, budgets[0], '116'), null);
});

test('source and target budget ids are required and year-bound', () => {
  assert.equal(plan({ sourceBudgetId: '' }).ok, false);
  assert.match(plan({ sourceBudgetId: 'B115A' }).error, /來源預算單位/);
  assert.equal(plan({ targetBudgetId: '' }).ok, false);
  assert.match(plan({ targetBudgetId: 'B114A' }).error, /目標預算單位/);
});

test('exact target budget scope blocks a unit found only in another target budget', () => {
  const result = plan();
  assert.equal(result.ok, true);
  assert.deepEqual(result.toAdd.map(entry => entry.sourceId), ['H1']);
  assert.equal(result.counters.outOfBudgetScopeSkipped, 1);
  assert.equal(result.skipped[0].reason, '目標預算單位未包含此實際單位');
});

test('planner never copies a source outside the selected source budget', () => {
  const result = plan({ sourceIds: ['H3'] });
  assert.equal(result.counters.sourceScopeSkipped, 1);
  assert.equal(result.toAdd.length, 0);
});

test('same-year multiple target mappings are blocked explicitly', () => {
  const anomalous = [...budgets, { id: 'B115D', academicYear: '115', budgetName: '重複範圍', unitCodes: ['U_A1'], budgetAmount: 1 }];
  const result = plan({ sourceIds: ['H1'], budgets: anomalous });
  assert.equal(result.counters.targetScopeAnomalySkipped, 1);
  assert.equal(result.skipped[0].reason, '目標年度預算單位範圍異常');
});

test('duplicate key and target duplicate protection are preserved', () => {
  const duplicate = { ...rows[0], id: 'H115', academicYear: '115', unitName: 'A1 latest' };
  const result = plan({ sourceIds: ['H1'], hourSettings: [...rows, duplicate] });
  assert.equal(result.counters.duplicateSkipped, 1);
  assert.equal(result.toAdd.length, 0);
  assert.equal(buildHourSettingDuplicateKey({ ...duplicate, note: 'changed', hours: 99 }), buildHourSettingDuplicateKey(duplicate));
});

test('payload preserves fields, uses current unit name, and adds no budget field', () => {
  const result = plan({ sourceIds: ['H1'] });
  const payload = result.toAdd[0].payload;
  assert.equal(payload.academicYear, '115');
  assert.equal(payload.unitName, 'A1 latest');
  assert.equal(payload.note, 'one');
  ['budgetName', 'budgetUnit', 'budgetGroup'].forEach(key => assert.equal(Object.hasOwn(payload, key), false));
});

test('planner does not mutate source rows', () => {
  const before = structuredClone(rows);
  plan({ sourceIds: ['H1'] });
  assert.deepEqual(rows, before);
});
