import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const source=fs.readFileSync(path.join(root,'gas/06_Migration160.gs'),'utf8');
const hourTarget=['id','academicYear','scheduleType','unitCode','unitName','weekdays','startTime','endTime','hours','note','createdAt','updatedAt'];
const calendarTarget=['id','date','academicYear','weekday','scheduleType','unitCode','unitName','startTime','endTime','hours','hourlyWage','sourceHourSettingId','createdAt'];
const tables={hourSettings:{sheet:'03_hour_settings',headers:hourTarget},calendarRows:{sheet:'05_calendar_rows',headers:calendarTarget}};
const utilities={DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest(_algorithm,text){return [...crypto.createHash('sha256').update(text,'utf8').digest()].map(v=>v>127?v-256:v);}};

function runtime(customTables=tables){const sandbox={PTB_TABLES:structuredClone(customTables),Utilities:utilities};vm.createContext(sandbox);vm.runInContext(source,sandbox);return sandbox;}
function fixtures(){
  const hour={headers:[...hourTarget,'hourlyWage'],values:[['hs-1','114','平日','U1','單位一','[1]','08:00','09:00',1,'','','',190]]};
  const calendar={headers:calendarTarget,values:[['row-1','2025-08-04','114','一','平日','U1','單位一','08:00','09:00',1,200,'hs-1',''],['row-2','2025-08-11','114','一','平日','U1','單位一','08:00','09:00',1,'','hs-1',''],['row-3','2025-08-18','114','一','平日','U1','單位一','08:00','09:00',1,'','missing','']]};
  return {hour,calendar};
}

test('7 public plan entry point is read-only',()=>{
  const body=source.slice(source.indexOf('function planPtb160SchemaMigration'),source.indexOf('function migrationBackupSuffix_'));
  assert.doesNotMatch(body,/clearContents|setValues|insertColumns|deleteColumns|copyTo|backupMigrationSheet|withWriteLock/);
});
test('8 plan reports only safe unresolved row fields',()=>{
  const {hour,calendar}=fixtures(),result=runtime().analyzePtb160Migration_(hour,calendar).plan;
  assert.deepEqual([...Object.keys(result.calendarRows.unresolvedRows[0])].sort(),['reason','rowNumber','sourceHourSettingId']);
  assert.equal(result.calendarRows.unresolvedRows[0].rowNumber,4);assert.equal(result.ok,false);
});
test('9 plan counts and preserves existing positive calendar wages',()=>{
  const {hour,calendar}=fixtures(),result=runtime().analyzePtb160Migration_(hour,calendar);
  assert.equal(result.plan.calendarRows.positiveWageRows,1);assert.equal(result.plan.calendarRows.preservedPositiveRows,1);assert.equal(result.calendarPrepared.values[0][10],200);
});
test('10 plan backfills only non-positive wages from the matching legacy source',()=>{
  const {hour,calendar}=fixtures(),result=runtime().analyzePtb160Migration_(hour,calendar);
  assert.equal(result.plan.calendarRows.backfillRequiredRows,2);assert.equal(result.calendarPrepared.values[1][10],190);assert.equal(result.calendarPrepared.values[2][10],'');
});
test('11 plan token is deterministic SHA-256 over the raw source state',()=>{
  const {hour,calendar}=fixtures(),rt=runtime(),a=rt.migrationPlanToken_(hour,calendar),b=rt.migrationPlanToken_(hour,calendar);
  assert.equal(a,b);assert.match(a,/^[0-9a-f]{64}$/);
});
test('12 plan token changes with either source data or target headers',()=>{
  const {hour,calendar}=fixtures(),base=runtime().migrationPlanToken_(hour,calendar),changed=structuredClone(calendar);changed.values[0][10]=201;
  assert.notEqual(runtime().migrationPlanToken_(hour,changed),base);
  const changedTables=structuredClone(tables);changedTables.calendarRows.headers=[...calendarTarget,'futureField'];
  assert.notEqual(runtime(changedTables).migrationPlanToken_(hour,calendar),base);
});
test('13 plan gate requires test mode and sheet only, never write or approval',()=>{
  const gateSource=source.slice(source.indexOf('function assertSchemaMigrationPlanAllowed_'),source.indexOf('function assertAnonymousSchemaMigrationAllowed_'));
  assert.match(gateSource,/TEST_MODE_REQUIRED/);assert.match(gateSource,/SHEET_NOT_CONFIGURED/);assert.doesNotMatch(gateSource,/WRITE_DISABLED|MIGRATION_APPROVAL_REQUIRED|schemaMigrationApproval/);
});
