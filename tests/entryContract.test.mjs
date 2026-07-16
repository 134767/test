import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const local = fs.readFileSync(new URL('../local.html', import.meta.url), 'utf8');
const browserTools = [
  'browser_runtime_check.py',
  'browser_note_edit_check.py',
  'browser_hour_batch_copy_check.py',
  'browser_hour_calendar_scope_check.py',
  'browser_calendar_interval_wage_check.py',
  'browser_hour_button_multiselect_check.py',
  'browser_hour_single_controller_check.py',
  'browser_salary_month_width_stability_check.py',
  'browser_hour_advanced_filter_check.py',
  'browser_holiday_single_controller_check.py',
  'browser_salary_unit_order_actual_check.py',
  'browser_forecast_workflow_hotfix11_check.py',
  'browser_db_feedback_hotfix11_check.py',
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
  const load = local.indexOf("import('./js/app.js?v=1.6.0-forecast-calendar-workflow-hotfix-11')");
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

test('all active asset cachebusters use the HOTFIX11 forecast calendar workflow token', () => {
  const repoRoot = path.resolve(import.meta.dirname, '..');
  const roots = ['js', 'gas'];
  const files = roots.flatMap(dir => fs.readdirSync(path.join(repoRoot, dir)).filter(name => /\.(js|gs|html)$/.test(name)).map(name => path.join(repoRoot, dir, name))).concat(path.join(repoRoot, 'local.html'));
  files.forEach(file => {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\?v=1\.6\.0(?=['"]|$)/, file);
    for (const match of source.matchAll(/\?v=(1\.6\.0-[A-Za-z0-9._-]+)/g)) {
      assert.equal(match[1], '1.6.0-forecast-calendar-workflow-hotfix-11', file);
    }
  });
  assert.match(local, /1\.6\.0-forecast-calendar-workflow-hotfix-11/);
});
