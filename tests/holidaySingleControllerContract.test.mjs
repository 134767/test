import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../js/ptb156Enhancements.js', import.meta.url), 'utf8');

test('holiday v2 replaces the legacy button and removes the legacy modal', () => {
  assert.match(source, /const replacementButton = originalButton\.cloneNode\(true\)/);
  assert.match(source, /originalButton\.replaceWith\(replacementButton\)/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
  assert.match(source, /root\.querySelector\('#holiday-modal'\)\?\.remove\(\)/);
  assert.doesNotMatch(source, /const replacementButton = originalButton;/);
});

test('holiday v2 owns aria visibility, focus return, and one observer installation', () => {
  assert.match(source, /modal\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(source, /modal\.setAttribute\('aria-hidden', 'false'\)/);
  assert.match(source, /root\.querySelector\('#btn-holiday-setting'\)\?\.focus\(\)/);
  assert.match(source, /holidayEnhancementObserver && holidayObservedMain === main/);
});
