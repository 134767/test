import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const local = fs.readFileSync(new URL('../local.html', import.meta.url), 'utf8');
const browserTools = [
  'browser_runtime_check.py',
  'browser_note_edit_check.py',
  'browser_hour_batch_copy_check.py',
  'browser_hour_calendar_scope_check.py',
].map(name => fs.readFileSync(new URL(`../tools/${name}`, import.meta.url), 'utf8'));

test('public root is a noindex static asset notice', () => {
  assert.match(root, /noindex,nofollow/);
  assert.match(root, /此網址僅提供系統靜態資產，不是正式操作入口/);
});

test('public root does not start or expose a business runtime', () => {
  assert.doesNotMatch(root, /DATA_MODE|app\.js|localStorage|tab-bar|main-content/);
  assert.doesNotMatch(root, /script\.google\.com|\/exec|Spreadsheet ID|deployment ID/);
});

test('local entry declares the localStorage runtime and versioned app asset', () => {
  assert.match(local, /DATA_MODE:\s*'localStorage'/);
  assert.match(local, /\.\/js\/app\.js\?v=1\.6\.0/);
  assert.match(local, /版本 1\.6\.0/);
});

test('local entry guard runs before dynamic app import', () => {
  const guard = local.indexOf("allowedHosts.includes(location.hostname)");
  const load = local.indexOf("import('./js/app.js?v=1.6.0')");
  assert.ok(guard >= 0 && load > guard);
  assert.match(local, /\['localhost', '127\.0\.0\.1', '::1'\]/);
  assert.match(local, /Local Runtime 僅允許從本機 localhost 啟動/);
});

test('non-local host returns before runtime configuration and bootstrap', () => {
  assert.match(local, /if \(!allowedHosts\.includes\(location\.hostname\)\) \{[\s\S]*?return;[\s\S]*?WORK_STUDY_CONFIG/);
  assert.doesNotMatch(local, /google\.script\.run|PTB_SPREADSHEET_ID|script\.google\.com|\/exec/);
});

test('all local browser runtime checks open local.html', () => {
  browserTools.forEach(source => assert.match(source, /BASE = "http:\/\/127\.0\.0\.1:5500\/local\.html"/));
});
