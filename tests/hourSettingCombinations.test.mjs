import test from 'node:test';
import assert from 'node:assert/strict';
import { empty, setupMutationStore, storage, succeedSingle } from './mutationTestHarness.mjs';

function seedData() {
  const data = structuredClone(empty);
  data.units = [
    { id: 'U1', unitCode: 'A', unitName: '甲' },
    { id: 'U2', unitCode: 'B', unitName: '乙' },
    { id: 'U3', unitCode: 'C', unitName: '丙' }
  ];
  data.budgets = [{ id: 'B1', academicYear: '114', budgetName: '測試群組', unitCodes: ['A', 'B', 'C'], budgetAmount: 1 }];
  return data;
}

const base = {
  academicYear: '114',
  scheduleTypes: ['平日', '假日'],
  unitCodes: ['A', 'B', 'C'],
  weekdays: '星期一、星期二',
  startTime: '08:00',
  endTime: '17:00',
  hours: 8,
  note: 'six rows'
};

test('add expands 2 × 3 through one replaceCollection and returns six unique ids', async () => {
  const { store, pending } = await setupMutationStore({ data: seedData() });
  const saving = store.saveHourSettingCombinations(base);
  assert.equal(store.getHourSettings().length, 6);
  assert.equal(new Set(store.getHourSettings().map(row => row.id)).size, 6);
  const flushing = store.flushCollectionSync('hourSettings');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].action, 'replaceCollection');
  assert.equal(pending[0].payload.collection, 'hourSettings');
  succeedSingle(pending[0]);
  const [result] = await Promise.all([saving, flushing]);
  assert.equal(result.originalId, null);
  assert.equal(result.createdCount, 6);
  assert.equal(result.createdIds.length, 6);
  assert.equal(result.authoritativeRows.length, 6);
  assert.ok(result.authoritativeRows.every(row => row.note === 'six rows' && row.hours === 8));
});

test('edit retains original id and atomically adds the remaining combinations', async () => {
  const data = seedData();
  data.hourSettings = [{ id: 'H_ORIGINAL', academicYear: '114', scheduleType: '平日', unitCode: 'A', unitName: '甲', weekdays: '星期一、星期二', startTime: '08:00', endTime: '17:00', hours: 8, note: 'old', createdAt: 'old' }];
  const { store, pending } = await setupMutationStore({ data });
  const saving = store.saveHourSettingCombinations({ ...base, editingId: 'H_ORIGINAL', scheduleTypes: ['平日', '假日'], unitCodes: ['A', 'B'] });
  const optimistic = store.getHourSettings();
  assert.equal(optimistic.length, 4);
  assert.equal(optimistic.filter(row => row.id === 'H_ORIGINAL').length, 1);
  assert.equal(optimistic.find(row => row.id === 'H_ORIGINAL').scheduleType, '平日');
  assert.equal(optimistic.find(row => row.id === 'H_ORIGINAL').unitCode, 'A');
  const flushing = store.flushCollectionSync('hourSettings');
  assert.equal(pending.length, 1);
  succeedSingle(pending[0]);
  const [result] = await Promise.all([saving, flushing]);
  assert.equal(result.originalId, 'H_ORIGINAL');
  assert.equal(result.createdCount, 3);
  assert.equal(result.createdIds.length, 3);
  assert.equal(new Set(result.authoritativeRows.map(row => `${row.academicYear}|${row.scheduleType}|${row.unitCode}|${row.weekdays}|${row.startTime}|${row.endTime}`)).size, 4);
});

test('unreferenced edit may map original id to first replacement combination', async () => {
  const data = seedData();
  data.hourSettings = [{ id: 'H_ORIGINAL', academicYear: '114', scheduleType: '平日', unitCode: 'A', unitName: '甲', weekdays: '星期一', startTime: '08:00', endTime: '17:00', hours: 8 }];
  const { store, pending } = await setupMutationStore({ data });
  const saving = store.saveHourSettingCombinations({ ...base, editingId: 'H_ORIGINAL', scheduleTypes: ['假日'], unitCodes: ['B', 'C'] });
  assert.deepEqual(store.getHourSettings().map(row => [row.id, row.scheduleType, row.unitCode]), [['H_ORIGINAL', '假日', 'B'], [store.getHourSettings()[1].id, '假日', 'C']]);
  const flushing = store.flushCollectionSync('hourSettings');
  succeedSingle(pending[0]);
  const [result] = await Promise.all([saving, flushing]);
  assert.equal(result.createdCount, 1);
});

test('referenced edit cannot remove or reassign the original academic-year/type/unit identity', async () => {
  const data = seedData();
  data.hourSettings = [{ id: 'H_USED', academicYear: '114', scheduleType: '平日', unitCode: 'A', unitName: '甲', weekdays: '星期一', startTime: '08:00', endTime: '17:00', hours: 8 }];
  data.calendarRows = [{ id: 'C1', sourceHourSettingId: 'H_USED', hourlyWage: 237 }];
  const { store, pending } = await setupMutationStore({ data });
  await assert.rejects(
    store.saveHourSettingCombinations({ ...base, editingId: 'H_USED', scheduleTypes: ['假日'], unitCodes: ['B'] }),
    /此時數設定已被行事曆使用，原作息類型與實際單位不可移除；可保留原組合並新增其他組合。/
  );
  assert.equal(pending.length, 0);
  assert.deepEqual(store.getHourSettings(), data.hourSettings);
  assert.deepEqual(store.getCalendarRows(), data.calendarRows);
});

test('duplicate in the complete candidate rejects before any write', async () => {
  const data = seedData();
  data.hourSettings = [{ id: 'EXISTING', academicYear: '114', scheduleType: '平日', unitCode: 'A', unitName: '甲', weekdays: base.weekdays, startTime: base.startTime, endTime: base.endTime, hours: 8 }];
  const { store, pending } = await setupMutationStore({ data });
  await assert.rejects(store.saveHourSettingCombinations({ ...base, scheduleTypes: ['平日'], unitCodes: ['A'] }), /不可重複/);
  assert.equal(pending.length, 0);
  assert.deepEqual(store.getHourSettings(), data.hourSettings);
});

test('localStorage mode uses the same candidate expansion and persists all six rows together', async () => {
  const local = storage();
  const data = seedData();
  local.setItem('workStudy_seeded', 'true');
  Object.entries(data).forEach(([name, rows]) => local.setItem(`workStudy_${name}`, JSON.stringify(rows)));
  globalThis.window = { WORK_STUDY_CONFIG: { DATA_MODE: 'localStorage' }, dispatchEvent() {} };
  globalThis.localStorage = local;
  globalThis.document = { body: null };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init.detail; } };
  const store = await import(`../js/dataStore.js?local-combinations=${Date.now()}${Math.random()}`);
  await store.initDataStore();
  const result = await store.saveHourSettingCombinations(base);
  assert.equal(result.createdCount, 6);
  assert.equal(result.authoritativeRows.length, 6);
  assert.equal(JSON.parse(local.getItem('workStudy_hourSettings')).length, 6);
});
