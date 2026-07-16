import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const salaryPage = fs.readFileSync(new URL('../js/salaryEntryPage.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');

test('salary month widths are stylesheet-owned and dynamic measurement is removed', () => {
  assert.doesNotMatch(salaryPage, /function\s+applyStickyWidths/);
  assert.doesNotMatch(salaryPage, /scrollWidth\s*\|\|\s*0/);
  assert.doesNotMatch(salaryPage, /style\.setProperty\(['"]--month-detail-col[12]-width/);
  assert.doesNotMatch(salaryPage, /schedule\(applyStickyWidths\)/);
  assert.doesNotMatch(salaryPage, /requestAnimationFrame/);
  assert.match(salaryPage, /style\.removeProperty\('--month-detail-col1-width'\)/);
  assert.match(salaryPage, /style\.removeProperty\('--month-detail-col2-width'\)/);
});

test('salary month table has fixed sticky columns and scroll-safe month minimums', () => {
  assert.match(css, /--month-detail-col1-width:\s*140px/);
  assert.match(css, /--month-detail-col2-width:\s*128px/);
  assert.match(css, /\.salary-month-transpose-table\s*\{[\s\S]*?width:\s*max-content;[\s\S]*?min-width:\s*100%;[\s\S]*?table-layout:\s*auto;/);
  assert.match(css, /nth-child\(n\+3\)[\s\S]*?min-width:\s*92px/);
  assert.match(css, /\.salary-month-transpose-table \.note-cell\s*\{[\s\S]*?min-width:\s*110px/);
  assert.match(css, /td\.month-detail-unit-name\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap/);
  assert.match(css, /\.table-wrapper\s*\{[\s\S]*?overflow-x:\s*auto;[\s\S]*?max-width:\s*100%/);
});
