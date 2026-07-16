import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const hourPage = fs.readFileSync(new URL('../js/hourSettingPage.js', import.meta.url), 'utf8');

test('batch source budget search preserves search semantics and shares query field sizing', () => {
  assert.match(hourPage, /id="hour-batch-source-budget-search" type="search"/);
  assert.doesNotMatch(hourPage, /id="hour-batch-source-budget-search" type="text"/);
  assert.match(css, /\.query-field input\[type="search"\],[\s\S]*#hour-batch-source-budget-search \{[\s\S]*min-height: 32px;[\s\S]*padding: 5px 8px;[\s\S]*font-size: 13px;[\s\S]*border: 1px solid var\(--border\);[\s\S]*border-radius: 4px;[\s\S]*background: var\(--panel\);/);
  assert.match(css, /#hour-batch-source-budget-search \{\s*margin-bottom: 6px;/);
});

test('search and text query inputs share focus styling while search keeps native semantics', () => {
  assert.match(css, /\.query-field input\[type="search"\],[\s\S]*#hour-batch-source-budget-search \{[\s\S]*font-family: inherit;[\s\S]*appearance: none;[\s\S]*-webkit-appearance: none;/);
  assert.match(css, /\.query-field input\[type="text"\]:focus,[\s\S]*\.query-field input\[type="search"\]:focus,[\s\S]*#hour-batch-source-budget-search:focus \{[\s\S]*outline: none;[\s\S]*border-color: var\(--primary\);[\s\S]*box-shadow: 0 0 0 2px rgba\(31, 110, 212, 0\.12\);/);
});
