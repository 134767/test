import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const source=fs.readFileSync(path.join(root,'gas/06_Migration160.gs'),'utf8');
const migrate=source.slice(source.indexOf('function migratePtb160Schema'));

test('14 stale plan rejection occurs before backup or write',()=>{
  assert.ok(migrate.indexOf('MIGRATION_PLAN_STALE')<migrate.indexOf('backupMigrationSheet_'));
  assert.ok(migrate.indexOf('MIGRATION_PLAN_STALE')<migrate.indexOf('rewriteSheetSchema_'));
});
test('15 unresolved rows block all writes and already-migrated returns writesPerformed false',()=>{
  assert.ok(migrate.indexOf('unresolvedRows.length')<migrate.indexOf('backupMigrationSheet_'));
  assert.match(migrate,/alreadyMigrated:true,writesPerformed:false/);
});
test('16 both timestamp-UUID backups are created before either schema rewrite',()=>{
  const suffix=source.slice(source.indexOf('function migrationBackupSuffix_'),source.indexOf('function rewriteSheetSchema_'));
  assert.match(suffix,/yyyyMMdd_HHmmss/);assert.match(suffix,/getUuid/);assert.match(suffix,/slice\(0,6\)/);
  const firstWrite=migrate.indexOf('rewriteSheetSchema_');
  assert.ok(migrate.indexOf('hourBackup=backupMigrationSheet_')<firstWrite);assert.ok(migrate.indexOf('calendarBackup=backupMigrationSheet_')<firstWrite);
});
test('17 post-migration verification enforces row, id, source, wage, salary, and other-table invariants',()=>{
  const sandbox={};vm.createContext(sandbox);vm.runInContext(source,sandbox);
  const hour={headers:['id'],values:[['h1']]},calendar={headers:['id','sourceHourSettingId','hourlyWage'],values:[['c1','h1',190]]};
  const pass=sandbox.verifyMigrationData_(hour,calendar,hour,calendar,{salaryEntries:'a',units:'b'},{salaryEntries:'a',units:'b'},{status:'PASS'});
  assert.equal(sandbox.migrationVerificationPassed_(pass),true);
  const changed={headers:calendar.headers,values:[['c1','h1',200]]};assert.equal(sandbox.migrationVerificationPassed_(sandbox.verifyMigrationData_(hour,calendar,hour,changed,{salaryEntries:'a'},{salaryEntries:'a'},{status:'PASS'})),false);
});
test('18 any post-backup failure restores both sheets with distinct rollback outcome codes',()=>{
  const rollback=source.slice(source.indexOf('function rollbackMigration_'),source.indexOf('function migratePtb160Schema'));
  assert.equal((rollback.match(/restoreSheetFromBackup_/g)||[]).length,2);
  assert.match(rollback,/MIGRATION_FAILED_ROLLED_BACK/);assert.match(rollback,/MIGRATION_ROLLBACK_FAILED/);assert.match(rollback,/hourSettingsRestored/);assert.match(rollback,/calendarRowsRestored/);
  assert.match(migrate,/catch\(error\)\{return rollbackMigration_/);
});
test('19 execution never writes salary or other tables and success evidence exposes no spreadsheet id',()=>{
  assert.doesNotMatch(migrate,/rewriteSheetSchema_\((salary|budget|unit|forecast|holiday)/);
  assert.doesNotMatch(migrate,/replaceTableRows_|setProperty|spreadsheetId\s*:/);
  assert.match(source,/captureOtherTableDigests_/);assert.match(source,/salaryEntriesUnchanged/);assert.match(source,/otherTablesUnchanged/);
});
