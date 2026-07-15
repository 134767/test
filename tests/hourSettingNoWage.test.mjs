import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync(new URL('../js/hourSettingPage.js',import.meta.url),'utf8');
const config=fs.readFileSync(new URL('../gas/00_Config.gs',import.meta.url),'utf8');
const csv=fs.readFileSync(new URL('../js/csvDb.js',import.meta.url),'utf8');
const batch=fs.readFileSync(new URL('../js/hourBatchUtils.js',import.meta.url),'utf8');

test('hour setting schema and UI have no wage field',()=>{
  const hourSchema=config.match(/hourSettings:\{[^\n]+/)[0];
  const csvSchema=csv.match(/hourSettings:\s*\{[\s\S]*?\n\s*\}/)[0];
  assert.doesNotMatch(hourSchema,/hourlyWage/);
  assert.doesNotMatch(csvSchema,/hourlyWage/);
  assert.doesNotMatch(page,/hour-wage|item\.hourlyWage|hourlyWage:\s*Number\(wage\)/);
});

test('hour setting batch payload never copies wage',()=>{
  const payload=batch.slice(batch.indexOf('const payload = {'),batch.indexOf('const key ='));
  assert.doesNotMatch(payload,/hourlyWage/);
});
