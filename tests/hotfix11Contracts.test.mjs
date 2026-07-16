import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const forecast = read('js/differenceForecastPage.js');
const calendar = read('js/calendarPage.js');
const salary = read('js/salaryEntryPage.js');
const feedback = read('js/dbFeedback.js');
const dataStore = read('js/dataStore.js');
const config = read('gas/00_Config.gs');

test('forecast modal owns load/create pages, separate start/save actions and checkbox intervals', () => {
  for (const id of ['fe-tab-load','fe-tab-create','fe-load-panel','fe-create-panel','fe-load-select','fe-start-evaluation','fe-save-evaluation','fe-add-interval','fe-delete-selected-intervals','fe-interval-select-all','fe-history-tbody']) {
    assert.match(forecast, new RegExp(`id="${id}"`));
  }
  assert.match(forecast, />評估設定<|>評估設定<\/button>/);
  assert.doesNotMatch(forecast, /\.onclick\s*=/);
  assert.match(forecast, /function startSelectedForecastEvaluation\([\s\S]*currentEvaluation = normalizeForecastEvaluationRecord\(found\)[\s\S]*activeForecastEvaluationId = currentEvaluation\.id/);
  const save = forecast.slice(forecast.indexOf('async function saveForecastEvaluationDraft'), forecast.indexOf('function startSelectedForecastEvaluation'));
  assert.doesNotMatch(save, /currentEvaluation\s*=|activeForecastEvaluationId\s*=|closeForecastEvalModal/);
});

test('forecast dataStore reads and saves only normalized schema-compatible records', () => {
  assert.match(dataStore, /return normalizeForecastEvaluations\(_getCollection\('forecastEvaluations'\)\)/);
  assert.match(dataStore, /normalizeForecastEvaluationRecord\(evaluation \|\| \{\}\)/);
  assert.doesNotMatch(config.match(/forecastEvaluations:\{[^\n]+/)[0], /_intervalParseError/);
  assert.match(config, /headers:\['id','name','budget','baseHourlyWage','intervals','createdAt','updatedAt'\]/);
});

test('calendar interval modal stays open, exposes scoped selection controls and snapshots unit names', () => {
  for (const id of ['int-schedule-select-all','int-schedule-clear-all','int-unit-select-all','int-unit-clear-all','int-delete-preview-select-all','int-delete-preview-clear-all','int-delete-preview-all-check','interval-operation-result']) {
    assert.match(calendar, new RegExp(`id="${id}"`));
  }
  assert.match(calendar, /id="int-cancel-btn" class="btn-secondary">退出<\/button>/);
  const confirm = calendar.slice(calendar.indexOf('async function handleIntervalConfirm()'), calendar.indexOf('// ===== HOLIDAY MODAL'));
  assert.doesNotMatch(confirm, /hideIntervalModal\(\)/);
  assert.match(confirm, /unitNameSnapshot:/);
  assert.match(confirm, /renderCalendarTable\(\);\s*updateIntervalPreview\(\);/);
  assert.match(calendar, /deleteCalendarRowsByScope\(\{selectedBudgetName:[\s\S]*sourceHourSettingIds:idsToDelete/);
  assert.doesNotMatch(confirm, /unitName\s*:/);
});

test('salary modal orders units before building indexed unitsData', () => {
  const render = salary.slice(salary.indexOf('function renderModalUnitTable()'), salary.indexOf('async function handleSalaryModalSubmit()'));
  assert.match(render, /const unitCodes = sortUnitCodesByUnitSettings\([\s\S]*normalizeBudgetUnitCodes[\s\S]*getUnits\(\)[\s\S]*salaryModalState = \{/);
});

test('blocking feedback title is data updating and operation mechanics remain present', () => {
  assert.equal((feedback.match(/資料更新中/g) || []).length, 2);
  assert.doesNotMatch(feedback, /資料載入中/);
  assert.match(feedback, /activeOps[\s\S]*isBlocking\(\)[\s\S]*lockButtons\(\)[\s\S]*unlockButtons\(\)/);
});
