import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBudgetUnitCodes,
  normalizeBudgetRecord,
  getValidBudgetGroups,
  getDistinctBudgetNames,
  getBudgetForNameAndYear,
  getBudgetsByName,
  getBudgetGroupConflicts,
  getAcademicYearsInYmRange,
  isUnitInBudgetGroup,
  sumBudgetAmounts,
  sumEntriesForUnitCodes,
  validateRocAcademicYear,
  validateYm,
  buildBudgetScope,
  resolveMonthlyWage,
  validateSalaryModalUnit,
  buildUnitSalarySummary,
  evaluateMonthRegistrationForGroup
} from '../js/budgetGroupUtils.js';

test('unitCodes JSON string to array', () => assert.deepEqual(normalizeBudgetUnitCodes('[" A ","B"]'), ['A','B']));
test('array trim unique remove empty', () => assert.deepEqual(normalizeBudgetUnitCodes([' A ','','A',' B ']), ['A','B']));
test('invalid JSON returns empty array', () => assert.deepEqual(normalizeBudgetUnitCodes('{bad'), []));
test('same year duplicate unit conflict', () => assert.equal(getBudgetGroupConflicts([{academicYear:'114',budgetName:'A',unitCodes:['U1']},{academicYear:'114',budgetName:'B',unitCodes:['U1']}])[0].type, 'unitOverlap'));
test('different years may reuse unit', () => assert.equal(getBudgetGroupConflicts([{academicYear:'114',budgetName:'A',unitCodes:['U1']},{academicYear:'115',budgetName:'B',unitCodes:['U1']}]).length, 0));
test('same budgetName can span years', () => assert.deepEqual(getDistinctBudgetNames([{academicYear:'114',budgetName:'A',unitCodes:['U1']},{academicYear:'115',budgetName:'A',unitCodes:['U2']}]), ['A']));
test('same year same name conflict', () => assert.equal(getBudgetGroupConflicts([{academicYear:'114',budgetName:'A',unitCodes:['U1']},{academicYear:'114',budgetName:'A',unitCodes:['U2']}])[0].type, 'duplicateName'));
test('2025-07 to 2025-08 covers two academic years', () => assert.deepEqual(getAcademicYearsInYmRange('2025-07','2025-08'), ['113','114']));
test('single year budget lookup', () => assert.equal(getBudgetForNameAndYear([{academicYear:'114',budgetName:'A',unitCodes:['U'],budgetAmount:1}], 'A', '114').budgetAmount, 1));
test('sum same name across years', () => assert.equal(sumBudgetAmounts(getBudgetsByName([{academicYear:'114',budgetName:'A',unitCodes:['U'],budgetAmount:10},{academicYear:'115',budgetName:'A',unitCodes:['U'],budgetAmount:20}], 'A')), 30));
test('group actual only counts unitCodes', () => assert.equal(sumEntriesForUnitCodes([{unitCode:'U1',actualAmount:10},{unitCode:'U2',actualAmount:99}], ['U1']), 10));
test('legacy budget normalizes safely', () => assert.deepEqual(normalizeBudgetRecord({academicYear:'114',budgetAmount:'5'}).unitCodes, []));
test('budget without unitCodes is not valid option', () => assert.equal(getValidBudgetGroups([{academicYear:'114',budgetName:'A',budgetAmount:1}]).length, 0));
test('isUnitInBudgetGroup uses unitCode', () => assert.equal(isUnitInBudgetGroup({unitCodes:'["U1"]'}, 'U1'), true));

test('ROC year accepts positive integers only', () => {
  assert.equal(validateRocAcademicYear('114'), true);
  assert.equal(validateRocAcademicYear('1'), true);
  assert.equal(validateRocAcademicYear('0'), false);
  assert.equal(validateRocAcademicYear('abc'), false);
  assert.equal(validateRocAcademicYear('1.5'), false);
  assert.equal(validateRocAcademicYear('-1'), false);
  assert.equal(validateRocAcademicYear('000'), false);
});

test('invalid YM returns immediately for range helper', () => {
  const start = Date.now();
  const years = getAcademicYearsInYmRange('2025-13', '2026-01');
  const elapsed = Date.now() - start;
  assert.deepEqual(years, []);
  assert.ok(elapsed < 80);
});

test('cross-year same group name keeps per-year unitCodes', () => {
  const budgets = [
    { academicYear: '114', budgetName: '公博流通', unitCodes: ['A'], budgetAmount: 100 },
    { academicYear: '115', budgetName: '公博流通', unitCodes: ['B'], budgetAmount: 200 }
  ];
  const scope = buildBudgetScope({ budgetName: '公博流通', mode: 'dateRange', startYm: '2025-08', endYm: '2026-09' }, budgets);
  assert.equal(scope.ok, true);
  assert.deepEqual(scope.scope.budgets.map(b => b.unitCodes), [['A'], ['B']]);
});

test('query scope conflict returns error (duplicateName)', () => {
  const budgets = [
    { academicYear: '114', budgetName: 'A', unitCodes: ['U1'], budgetAmount: 100 },
    { academicYear: '114', budgetName: 'A', unitCodes: ['U2'], budgetAmount: 100 }
  ];
  const scope = buildBudgetScope({ budgetName: 'A', mode: 'academicYear', academicYear: '114' }, budgets);
  assert.equal(scope.ok, false);
  assert.match(scope.error, /重複群組名稱/);
});

test('unselected group returns scope error', () => {
  const scope = buildBudgetScope({ budgetName: '', mode: 'academicYear', academicYear: '114' }, []);
  assert.equal(scope.ok, false);
});

test('monthly wage display: none/single/multi and latest', () => {
  assert.deepEqual(resolveMonthlyWage([]), { display: '', latestHourlyWage: 0, wages: [] });
  assert.deepEqual(resolveMonthlyWage([{ date: '2025-08-02', hourlyWage: 195 }]), { display: '195', latestHourlyWage: 195, wages: [195] });
  const multi = resolveMonthlyWage([
    { date: '2025-08-01', hourlyWage: 190 },
    { date: '2025-08-02', hourlyWage: 200 },
    { date: '2025-08-03', hourlyWage: 190 }
  ]);
  assert.equal(multi.display, '190/200');
  assert.equal(multi.latestHourlyWage, 190);
});

test('modal unit validation blocks non-calendar positive new entry', () => {
  const result = validateSalaryModalUnit({ unitName: '館藏組', salaryAmount: 1000, existingEntry: null, calendarRows: [] });
  assert.equal(result.canSave, false);
  assert.equal(result.skip, false);
});

test('modal unit validation keeps existing hourlyWage when update payload misses wage', () => {
  const result = validateSalaryModalUnit({
    unitName: '館藏組',
    salaryAmount: 1200,
    existingEntry: { hourlyWage: 201 },
    calendarRows: []
  });
  assert.equal(result.canSave, false);
  assert.equal(result.skip, false);
  assert.match(result.error, /無行事曆資料/);
});

test('modal unit validation blocks existing entry with no calendar and positive amount', () => {
  const result = validateSalaryModalUnit({
    unitName: '館藏組',
    salaryAmount: 300,
    existingEntry: { hourlyWage: 201, actualAmount: 100 },
    calendarRows: []
  });
  assert.equal(result.canSave, false);
  assert.equal(result.skip, false);
  assert.match(result.error, /無行事曆資料/);
});

test('unit summary totals equal row sums', () => {
  const summary = buildUnitSalarySummary({
    scopeBudgets: [{ unitCodes: ['U1', 'U2'] }],
    rows: [
      { unitCode: 'U1', hours: 2, hourlyWage: 200 },
      { unitCode: 'U2', hours: 3, hourlyWage: 180 }
    ],
    entries: [
      { unitCode: 'U1', actualAmount: 300 },
      { unitCode: 'U2', actualAmount: 400 }
    ]
  });

  const rowEstimate = summary.rows.reduce((s, r) => s + r.estimate, 0);
  const rowActual = summary.rows.reduce((s, r) => s + r.actual, 0);
  const rowDiff = summary.rows.reduce((s, r) => s + r.diff, 0);
  assert.equal(summary.totals.estimate, rowEstimate);
  assert.equal(summary.totals.actual, rowActual);
  assert.equal(summary.totals.diff, rowDiff);
});

test('validateYm rejects malformed values quickly', () => {
  assert.equal(validateYm('2025-08'), true);
  assert.equal(validateYm('2025-13'), false);
  assert.equal(validateYm('2025-8'), false);
  assert.equal(validateYm('bad'), false);
});

test('recent month completion uses active units only', () => {
  const result = evaluateMonthRegistrationForGroup({
    academicYear: '114',
    ym: '2025-08',
    groupUnitCodes: ['A', 'B'],
    calendarRows: [
      { academicYear: '114', date: '2025-08-05', unitCode: 'A' }
    ],
    existingEntries: [
      { academicYear: '114', year: 2025, month: 8, unitCode: 'A', actualAmount: 100 }
    ]
  });

  assert.deepEqual(result.activeUnitCodes, ['A']);
  assert.equal(result.completed, true);
  assert.equal(result.skipped, false);
});
