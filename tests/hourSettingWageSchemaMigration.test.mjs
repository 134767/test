import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../gas/06_Migration160.gs',import.meta.url),'utf8');
const config=fs.readFileSync(new URL('../gas/00_Config.gs',import.meta.url),'utf8');

test('inspection identifies deprecated 03 hourlyWage and requires migration',()=>{
  assert.match(migration,/deprecatedColumns/);
  assert.match(migration,/k==='hourSettings'&&headers\.indexOf\('hourlyWage'\)>=0/);
  assert.match(migration,/report\.migrationRequired=true/);
});

test('migration fills calendar wages before rewriting hour settings schema',()=>{
  assert.ok(migration.indexOf('calendarRaw.values.forEach')<migration.indexOf('backupMigrationSheet_\(ss,hourSheet'));
  assert.ok(migration.indexOf('rewriteSheetSchema_\(calendarSheet')<migration.indexOf('rewriteSheetSchema_\(hourSheet'));
  const hourSchema=config.match(/hourSettings:\{[^\n]+/)[0];
  assert.doesNotMatch(hourSchema,/hourlyWage/);
});
