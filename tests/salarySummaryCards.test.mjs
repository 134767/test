import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../js/salaryEntryPage.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');

test('salary summary uses a query row and five semantic value cards', () => {
  assert.match(page, /class="salary-summary-box"/);
  assert.match(page, /class="salary-summary-query-info"/);
  assert.match(page, /class="salary-summary-grid"/);
  assert.equal((page.match(/class="salary-summary-item(?: |")/g) || []).length, 5);
  assert.match(page, /function getSalarySummaryStateClass\(value\)/);
  assert.match(page, /Number\(value\) < 0/);
  assert.doesNotMatch(page, /const bits =/);
  assert.doesNotMatch(page, /bits\.map/);
  assert.doesNotMatch(page, /<div class="summary-box">/);
  assert.doesNotMatch(page, /id="salary-summary" style=/);
});

test('salary summary preserves calculations and safely renders dynamic query values', () => {
  assert.match(page, /const totalBudget = sumBudgetAmounts\(scope\.budgets\)/);
  assert.match(page, /const estimate = \(rows \|\| \[\]\)\.reduce/);
  assert.match(page, /const actual = \(entries \|\| \[\]\)\.reduce/);
  assert.match(page, /const difference = estimate - actual/);
  assert.match(page, /const remain = totalBudget - actual/);
  assert.match(page, /escapeHtml\(salaryFilter\.budgetName\)/);
  assert.match(page, /escapeHtml\(salaryFilter\.academicYear\)/);
  assert.match(page, /escapeHtml\(salaryFilter\.startYm\)/);
  assert.match(page, /escapeHtml\(salaryFilter\.endYm\)/);
  assert.doesNotMatch(page, /x\.includes\('差額'\)|x\.includes\('剩餘預算'\)/);
});

test('salary summary CSS is scoped, restrained, and follows responsive columns', () => {
  assert.match(css, /\.salary-summary-grid\s*\{[\s\S]*?repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 1000px\)[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 440px\)[\s\S]*?grid-template-columns: 1fr/);
  const summaryCss = css.slice(css.indexOf('.salary-summary-box'), css.indexOf('.salary-query-panel'));
  assert.doesNotMatch(summaryCss, /box-shadow|linear-gradient|999px|transform|animation/);
});
