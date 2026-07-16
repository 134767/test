import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const config = fs.readFileSync(new URL('../gas/00_Config.gs', import.meta.url), 'utf8');
const hourCsv = fs.readFileSync(new URL('../db/03_hour_settings.csv', import.meta.url), 'utf8');
const hourPage = fs.readFileSync(new URL('../js/hourSettingPage.js', import.meta.url), 'utf8');

const hourHeaders = [
  'id', 'academicYear', 'scheduleType', 'unitCode', 'unitName', 'weekdays',
  'startTime', 'endTime', 'hours', 'note', 'createdAt', 'updatedAt'
];

test('hour setting GAS and CSV schemas remain unchanged', () => {
  const headerLiteral = hourHeaders.map(name => `'${name}'`).join(',');
  assert.ok(config.includes(`hourSettings:{sheet:'03_hour_settings',headers:[${headerLiteral}]}`));
  assert.deepEqual(hourCsv.split(/\r?\n/, 1)[0].split(','), hourHeaders);
});

test('hour setting form payload does not persist derived budget fields', () => {
  const payloadMatch = hourPage.match(/saveHourSettingCombinations\(\{([\s\S]*?)\n\s*\}\)/);
  assert.ok(payloadMatch, 'hourData payload must remain explicit');
  assert.doesNotMatch(payloadMatch[1], /\bbudget(?:Name|Unit|Group)\b/);
});
