import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeForecastIntervals,
  normalizeForecastEvaluationRecord,
  normalizeForecastEvaluations,
  validateForecastEvaluationDraft
} from '../js/forecastEvaluationUtils.js';

test('forecast intervals normalize arrays, JSON strings, blanks, null and numeric strings without mutation', () => {
  const source = [{ startYm: ' 2026-01 ', endYm: '2026-12', hourlyWage: '205', monthlyHours: '12', note: 7 }];
  const before = structuredClone(source);
  assert.deepEqual(normalizeForecastIntervals(source), [{ startYm: '2026-01', endYm: '2026-12', hourlyWage: 205, monthlyHours: 12, note: '7' }]);
  assert.deepEqual(source, before);
  assert.deepEqual(normalizeForecastIntervals(JSON.stringify(source)), normalizeForecastIntervals(source));
  assert.deepEqual(normalizeForecastIntervals(''), []);
  assert.deepEqual(normalizeForecastIntervals(null), []);
});

test('malformed non-empty interval JSON stays visible as a parse-error record', () => {
  const record = normalizeForecastEvaluationRecord({ id: 9, name: ' broken ', intervals: '{bad' });
  assert.equal(record.id, '9');
  assert.equal(record.name, 'broken');
  assert.deepEqual(record.intervals, []);
  assert.equal(record._intervalParseError, true);
  assert.equal('_intervalParseError' in normalizeForecastEvaluationRecord({ intervals: '[]' }), false);
});

test('forecast evaluation collection normalization returns new records', () => {
  const source = [{ id: 'A', intervals: '[{"startYm":"2026-01","endYm":"2026-02","hourlyWage":"190"}]' }];
  const result = normalizeForecastEvaluations(source);
  assert.notEqual(result, source);
  assert.notEqual(result[0], source[0]);
  assert.equal(result[0].intervals[0].hourlyWage, 190);
});

test('draft validation enforces unique names, valid ranges, nonnegative values and at least one interval', () => {
  const valid = { id: 'A', name: ' Plan ', budget: 0, intervals: [{ startYm: '2026-01', endYm: '2026-12', hourlyWage: 0 }] };
  assert.equal(validateForecastEvaluationDraft(valid, [{ id: 'A', name: 'plan' }]).ok, true);
  assert.equal(validateForecastEvaluationDraft({ ...valid, id: 'B' }, [{ id: 'A', name: 'pLaN' }]).error, '評估名稱不可重複');
  assert.equal(validateForecastEvaluationDraft({ ...valid, name: 'x', intervals: [] }).ok, false);
  assert.equal(validateForecastEvaluationDraft({ ...valid, name: 'x', intervals: [{ startYm: '2026-13', endYm: '2026-12', hourlyWage: 1 }] }).ok, false);
  assert.equal(validateForecastEvaluationDraft({ ...valid, name: 'x', intervals: [{ startYm: '2026-02', endYm: '2026-01', hourlyWage: 1 }] }).ok, false);
  assert.equal(validateForecastEvaluationDraft({ ...valid, name: 'x', intervals: [{ startYm: '2026-01', endYm: '2026-02', hourlyWage: -1 }] }).ok, false);
});
