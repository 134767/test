import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHourSettingDuplicateKey,
  getUniqueBudgetAcademicYears,
  getValidBudgetUnitCodesForYear,
  isUnitInTargetBudgetScope,
  planBatchHourCopy
} from '../js/hourBatchUtils.js';

const sampleRows = [
  {
    id: 'H1',
    academicYear: '114',
    scheduleType: '開學期間',
    unitCode: 'U_A1',
    unitName: '公博流通',
    weekdays: '星期一|星期二|星期三|星期四|星期五',
    startTime: '08:00',
    endTime: '21:30',
    hours: 34,
    hourlyWage: 196,
    note: ''
  },
  {
    id: 'H2',
    academicYear: '114',
    scheduleType: '開學期間',
    unitCode: 'U_C1',
    unitName: '國璽流通兼自學中心',
    weekdays: '星期一|星期二|星期三|星期四|星期五',
    startTime: '08:00',
    endTime: '21:00',
    hours: 32,
    hourlyWage: 196,
    note: ''
  },
  {
    id: 'H3',
    academicYear: '114',
    scheduleType: '開學期間',
    unitCode: 'U_C1',
    unitName: '國璽流通兼自學中心',
    weekdays: '星期一|星期二|星期三|星期四|星期五',
    startTime: '21:00',
    endTime: '23:00',
    hours: 2,
    hourlyWage: 196,
    note: '自學中心(平日)'
  },
  {
    id: 'H4',
    academicYear: '114',
    scheduleType: '開學期間',
    unitCode: 'U_B1',
    unitName: '濟時流通',
    weekdays: '星期一|星期二|星期三|星期四|星期五',
    startTime: '08:00',
    endTime: '22:00',
    hours: 34,
    hourlyWage: 196,
    note: ''
  }
];

const units = [
  { unitCode: 'U_A1', unitName: 'Unit_A1_Latest' },
  { unitCode: 'U_B1', unitName: 'Unit_B1_Latest' },
  { unitCode: 'U_C1', unitName: 'Unit_C1_Latest' }
];

const budgets = [
  { academicYear: '114', budgetName: 'Group_Alpha', unitCodes: ['U_A1', 'U_A2'], budgetAmount: 1 },
  { academicYear: '114', budgetName: 'Group_Beta', unitCodes: ['U_B1', 'U_B2'], budgetAmount: 1 },
  { academicYear: '114', budgetName: 'Group_Gamma', unitCodes: ['U_C1'], budgetAmount: 1 },
  { academicYear: '115', budgetName: 'Group_Alpha', unitCodes: ['U_A1', 'U_C1'], budgetAmount: 1 },
  { academicYear: '115', budgetName: 'Group_Beta', unitCodes: ['U_B1'], budgetAmount: 1 },
  { academicYear: '115', budgetName: 'Group_Alpha_dup', unitCodes: ['U_A1'], budgetAmount: 1 },
  { academicYear: '115', budgetName: '', unitCodes: ['U_X'], budgetAmount: 1 },
  { academicYear: '115', budgetName: 'EmptyUnits', unitCodes: [], budgetAmount: 1 }
];

test('target_years_unique newest first', () => {
  const years = getUniqueBudgetAcademicYears(budgets);
  assert.deepEqual(years, ['115', '114']);
});

test('duplicate key ignores note/hours/wage', () => {
  const a = buildHourSettingDuplicateKey({
    academicYear: '115',
    scheduleType: 'A',
    unitCode: 'U1',
    weekdays: '星期一',
    startTime: '08:00',
    endTime: '09:00',
    note: 'x',
    hours: 1,
    hourlyWage: 1
  });
  const b = buildHourSettingDuplicateKey({
    academicYear: '115',
    scheduleType: 'A',
    unitCode: 'U1',
    weekdays: '星期一',
    startTime: '08:00',
    endTime: '09:00',
    note: 'y',
    hours: 9,
    hourlyWage: 9
  });
  assert.equal(a, b);
});

test('copy_four_rows_to_new_year plan', () => {
  const plan = planBatchHourCopy({
    sourceIds: ['H1', 'H2', 'H3', 'H4'],
    targetAcademicYear: '115',
    hourSettings: sampleRows,
    units,
    budgets
  });
  assert.equal(plan.counters.selected, 4);
  assert.equal(plan.counters.added, 4);
  assert.equal(plan.toAdd.length, 4);
  plan.toAdd.forEach(entry => {
    assert.equal(entry.payload.academicYear, '115');
  });
  const h3 = plan.toAdd.find(e => e.sourceId === 'H3');
  assert.equal(h3.payload.note, '自學中心(平日)');
  assert.equal(h3.payload.startTime, '21:00');
  assert.equal(h3.payload.endTime, '23:00');
});

test('copied_fields_preserved and unit_name_uses_latest_master_value', () => {
  const plan = planBatchHourCopy({
    sourceIds: ['H1'],
    targetAcademicYear: '115',
    hourSettings: sampleRows,
    units,
    budgets
  });
  const p = plan.toAdd[0].payload;
  const src = sampleRows[0];
  assert.equal(p.scheduleType, src.scheduleType);
  assert.equal(p.unitCode, src.unitCode);
  assert.equal(p.weekdays, src.weekdays);
  assert.equal(p.startTime, src.startTime);
  assert.equal(p.endTime, src.endTime);
  assert.equal(p.hours, src.hours);
  assert.equal(Object.hasOwn(p, 'hourlyWage'), false);
  assert.equal(p.note, src.note);
  assert.equal(p.unitName, 'Unit_A1_Latest');
  assert.notEqual(p.unitName, src.unitName);
});

test('duplicate_target_rows_skipped', () => {
  const existing = [
    ...sampleRows,
    {
      id: 'H115',
      academicYear: '115',
      scheduleType: '開學期間',
      unitCode: 'U_A1',
      unitName: 'Unit_A1_Latest',
      weekdays: '星期一|星期二|星期三|星期四|星期五',
      startTime: '08:00',
      endTime: '21:30',
      hours: 34,
      hourlyWage: 196,
      note: 'already'
    }
  ];
  const plan = planBatchHourCopy({
    sourceIds: ['H1', 'H2', 'H3', 'H4'],
    targetAcademicYear: '115',
    hourSettings: existing,
    units,
    budgets
  });
  assert.equal(plan.counters.duplicateSkipped, 1);
  assert.equal(plan.counters.added, 3);
});

test('duplicates_inside_batch_skipped', () => {
  const mixed = [
    ...sampleRows,
    {
      id: 'H5',
      academicYear: '113',
      scheduleType: '開學期間',
      unitCode: 'U_A1',
      unitName: '公博流通',
      weekdays: '星期一|星期二|星期三|星期四|星期五',
      startTime: '08:00',
      endTime: '21:30',
      hours: 99,
      hourlyWage: 1,
      note: 'different note but same key after year map'
    }
  ];
  const plan = planBatchHourCopy({
    sourceIds: ['H1', 'H5'],
    targetAcademicYear: '115',
    hourSettings: mixed,
    units,
    budgets
  });
  assert.equal(plan.counters.added, 1);
  assert.equal(plan.counters.duplicateSkipped, 1);
});

test('invalid_unit_skipped', () => {
  const rows = [
    {
      id: 'HX',
      academicYear: '114',
      scheduleType: '開學期間',
      unitCode: 'GONE',
      unitName: '已刪',
      weekdays: '星期一',
      startTime: '08:00',
      endTime: '09:00',
      hours: 1,
      hourlyWage: 100,
      note: ''
    }
  ];
  const plan = planBatchHourCopy({
    sourceIds: ['HX'],
    targetAcademicYear: '115',
    hourSettings: rows,
    units,
    budgets
  });
  assert.equal(plan.counters.invalidUnitSkipped, 1);
  assert.equal(plan.counters.added, 0);
  assert.match(plan.skipped[0].reason, /單位不存在/);
});

test('out_of_target_budget_scope_skipped', () => {
  // 115 budgets do not include U_A2
  const rows = [
    {
      id: 'HA2',
      academicYear: '114',
      scheduleType: '開學期間',
      unitCode: 'U_A2',
      unitName: '公博典藏',
      weekdays: '星期一',
      startTime: '08:00',
      endTime: '12:00',
      hours: 4,
      hourlyWage: 196,
      note: ''
    }
  ];
  const unitsWithA2 = [...units, { unitCode: 'U_A2', unitName: 'Unit_A2' }];
  const plan = planBatchHourCopy({
    sourceIds: ['HA2'],
    targetAcademicYear: '115',
    hourSettings: rows,
    units: unitsWithA2,
    budgets
  });
  assert.equal(plan.counters.outOfBudgetScopeSkipped, 1);
  assert.equal(plan.counters.added, 0);
  assert.match(plan.skipped[0].reason, /預算群組未包含/);
});

test('missing source skipped', () => {
  const plan = planBatchHourCopy({
    sourceIds: ['NOPE'],
    targetAcademicYear: '115',
    hourSettings: sampleRows,
    units,
    budgets
  });
  assert.equal(plan.counters.missingSourceSkipped, 1);
  assert.equal(plan.counters.added, 0);
});

test('partial_success_summary counters', () => {
  const rows = [
    ...sampleRows,
    {
      id: 'HGONE',
      academicYear: '114',
      scheduleType: 'X',
      unitCode: 'GONE',
      unitName: 'gone',
      weekdays: '星期一',
      startTime: '01:00',
      endTime: '02:00',
      hours: 1,
      hourlyWage: 1,
      note: ''
    }
  ];
  const plan = planBatchHourCopy({
    sourceIds: ['H1', 'HGONE', 'H2'],
    targetAcademicYear: '115',
    hourSettings: rows,
    units,
    budgets
  });
  assert.equal(plan.counters.selected, 3);
  assert.equal(plan.counters.added, 2);
  assert.equal(plan.counters.invalidUnitSkipped, 1);
});

test('same year all duplicate yields zero added', () => {
  const plan = planBatchHourCopy({
    sourceIds: ['H1', 'H2', 'H3', 'H4'],
    targetAcademicYear: '114',
    hourSettings: sampleRows,
    units,
    budgets
  });
  assert.equal(plan.counters.added, 0);
  assert.equal(plan.counters.duplicateSkipped, 4);
});

test('valid budget scope uses only named non-empty unit groups', () => {
  const set = getValidBudgetUnitCodesForYear(budgets, '115');
  assert.equal(set.has('U_A1'), true);
  assert.equal(set.has('U_B1'), true);
  assert.equal(set.has('U_C1'), true);
  assert.equal(set.has('U_X'), false);
  assert.equal(isUnitInTargetBudgetScope(budgets, '115', 'U_A2'), false);
});

test('note field retained including html-looking text', () => {
  const rows = [{
    id: 'HN',
    academicYear: '114',
    scheduleType: 'A',
    unitCode: 'U_A1',
    unitName: 'old',
    weekdays: '星期一',
    startTime: '08:00',
    endTime: '09:00',
    hours: 1,
    hourlyWage: 100,
    note: '備註測試<script>x</script>'
  }];
  const plan = planBatchHourCopy({
    sourceIds: ['HN'],
    targetAcademicYear: '115',
    hourSettings: rows,
    units,
    budgets
  });
  assert.equal(plan.toAdd[0].payload.note, '備註測試<script>x</script>');
});
