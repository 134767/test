import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sumRowsEstimateForUnitCodes } from '../js/budgetGroupUtils.js';

test('current and past estimate uses each calendar row wage',()=>{
  const rows=[{unitCode:'U1',hours:8,hourlyWage:190},{unitCode:'U1',hours:8,hourlyWage:200}];
  assert.equal(sumRowsEstimateForUnitCodes(rows,['U1']),3120);
});

test('future forecast uses interval wage without hour setting fallback',()=>{
  const source=fs.readFileSync(new URL('../js/differenceForecastPage.js',import.meta.url),'utf8');
  const future=source.slice(source.indexOf('function buildFutureMonthlyRows'),source.indexOf('function computeFuture'));
  assert.match(source,/interval\.hourlyWage/);
  assert.doesNotMatch(future,/hourSettings|match\.hourlyWage/);
});
