import test from 'node:test';
import assert from 'node:assert/strict';
import { filterHourSettingsAdvanced } from '../js/hourFilterUtils.js';

const budgets = [
  { id: 'B114A', academicYear: '114', budgetName: 'Alpha', unitCodes: ['U1'], budgetAmount: 1 },
  { id: 'B114B', academicYear: '114', budgetName: 'Beta', unitCodes: ['U2'], budgetAmount: 1 },
  { id: 'B115A', academicYear: '115', budgetName: 'Alpha', unitCodes: ['U3'], budgetAmount: 1 }
];
const rows = [
  { id: 'H1', academicYear: '114', scheduleType: '平日', unitCode: 'U1', unitName: '流通組', weekdays: '星期一', startTime: '08:00', endTime: '12:00', hours: 4, note: '早班' },
  { id: 'H2', academicYear: '114', scheduleType: '假日', unitCode: 'U2', unitName: '典藏組', weekdays: '星期六', startTime: '09:00', endTime: '17:00', hours: 8, note: '週末' },
  { id: 'H3', academicYear: '115', scheduleType: '平日', unitCode: 'U3', unitName: '閱覽組', weekdays: '星期二', startTime: '13:00', endTime: '18:00', hours: 5, note: '午後' }
];

test('all empty advanced filters return every row without mutation', () => {
  const before = structuredClone(rows);
  assert.deepEqual(filterHourSettingsAdvanced({ hourSettings: rows, budgets }).map(r => r.id), ['H1', 'H2', 'H3']);
  assert.deepEqual(rows, before);
});

test('non-empty advanced filters combine with AND', () => {
  const result = filterHourSettingsAdvanced({
    hourSettings: rows, budgets, academicYear: '114', budgetName: 'Alpha',
    scheduleType: '平日', unitCode: 'U1', keyword: '早班'
  });
  assert.deepEqual(result.map(r => r.id), ['H1']);
  assert.equal(filterHourSettingsAdvanced({ hourSettings: rows, budgets, academicYear: '114', budgetName: 'Alpha', scheduleType: '假日' }).length, 0);
});

test('keyword covers derived budget, code, time, hours and notes case-insensitively', () => {
  assert.deepEqual(filterHourSettingsAdvanced({ hourSettings: rows, budgets, keyword: 'alpha' }).map(r => r.id), ['H1', 'H3']);
  for (const keyword of ['u1', '08:00', '12:00', '早班']) {
    assert.deepEqual(filterHourSettingsAdvanced({ hourSettings: rows, budgets, keyword }).map(r => r.id), ['H1']);
  }
  assert.deepEqual(filterHourSettingsAdvanced({ hourSettings: rows, budgets, keyword: '5' }).map(r => r.id), ['H3']);
});

test('warning-derived budget labels remain exact filter values', () => {
  const orphan = { ...rows[0], id: 'HX', unitCode: 'NO_BUDGET' };
  const label = '未對應預算單位';
  assert.deepEqual(filterHourSettingsAdvanced({ hourSettings: [orphan], budgets, budgetName: label }).map(r => r.id), ['HX']);
});
