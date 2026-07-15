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

function runtime(extra={}){const sandbox={PTB_TABLES:structuredClone(tables),Utilities:utilities,...extra};vm.createContext(sandbox);vm.runInContext(source,sandbox);return sandbox;}
function fixture(){return {
  hour:{headers:[...hourTarget,'hourlyWage'],values:[['hs-1','114','平日','U1','測試單位','[1]','08:00','09:00',1,'','','',190]]},
  calendar:{headers:[...calendarTarget],values:[['row-1','2025-08-04','114','一','平日','U1','測試單位','08:00','09:00',1,190,'hs-1','']]}
};}
function analyze(mutator){const data=fixture();mutator?.(data);return runtime().analyzePtb160Migration_(data.hour,data.calendar).plan;}

test('calendar source id not found blocks the plan',()=>{const p=analyze(({calendar})=>calendar.values[0][11]='missing');assert.equal(p.ok,false);assert.equal(p.calendarSourceIntegrity.issues[0].reason,'source_hour_setting_not_found');});
test('duplicate hour setting id blocks the plan',()=>{const p=analyze(({hour})=>hour.values.push([...hour.values[0]]));assert.equal(p.ok,false);assert.equal(p.calendarSourceIntegrity.issues[0].reason,'duplicate_source_hour_setting_id');});
test('academic year mismatch blocks the plan',()=>{const p=analyze(({calendar})=>calendar.values[0][2]='115');assert.equal(p.ok,false);assert.equal(p.calendarSourceIntegrity.issues[0].reason,'source_academic_year_mismatch');});
test('unit code mismatch blocks the plan',()=>{const p=analyze(({calendar})=>calendar.values[0][5]='U2');assert.equal(p.ok,false);assert.equal(p.calendarSourceIntegrity.issues[0].reason,'source_unit_code_mismatch');});
test('schedule type mismatch blocks the plan',()=>{const p=analyze(({calendar})=>calendar.values[0][4]='假日');assert.equal(p.ok,false);assert.equal(p.calendarSourceIntegrity.issues[0].reason,'source_schedule_type_mismatch');});
test('missing source id has first priority',()=>{const p=analyze(({calendar})=>{calendar.values[0][11]='';calendar.values[0][2]='115';});assert.equal(p.calendarSourceIntegrity.issues[0].reason,'missing_source_hour_setting_id');});
test('positive calendar wage cannot bypass source integrity',()=>{const p=analyze(({calendar})=>{calendar.values[0][10]=999;calendar.values[0][5]='U2';});assert.equal(p.calendarRows.positiveWageRows,1);assert.equal(p.ok,false);});
test('source issue diagnostics contain only safe fields',()=>{const p=analyze(({calendar})=>calendar.values[0][5]='U2');assert.deepEqual([...Object.keys(p.calendarSourceIntegrity.issues[0])].sort(),['reason','rowNumber','sourceHourSettingId']);});
test('valid fixture keeps plan ok',()=>{const p=analyze();assert.equal(p.ok,true);assert.equal(p.calendarSourceIntegrity.valid,true);assert.equal(p.calendarSourceIntegrity.issueCount,0);});
test('same source may preserve different positive calendar wage snapshots',()=>{const p=analyze(({calendar})=>calendar.values.push(['row-2','2026-01-05','114','一','平日','U1','測試單位','08:00','09:00',1,200,'hs-1','']));assert.equal(p.ok,true);assert.equal(p.calendarRows.positiveWageRows,2);});
test('source integrity analysis is deterministic and plan token remains stable',()=>{const data=fixture(),rt=runtime(),a=rt.analyzePtb160Migration_(data.hour,data.calendar).plan,b=rt.analyzePtb160Migration_(data.hour,data.calendar).plan;assert.equal(a.planToken,b.planToken);assert.equal(JSON.stringify(a.calendarSourceIntegrity),JSON.stringify(b.calendarSourceIntegrity));});
test('missing required integrity header blocks without guessing',()=>{const p=analyze(({calendar})=>calendar.headers.splice(calendar.headers.indexOf('unitCode'),1));assert.equal(p.ok,false);assert.equal(p.calendarSourceIntegrity.valid,false);assert.equal(p.calendarSourceIntegrity.issueCount,0);});

function migrationHarness(plan){
  const calls={backup:0,rewrite:0};
  const sandbox=runtime();
  Object.assign(sandbox,{createRequestContext_:()=>({}),assertAnonymousSchemaMigrationAllowed_:()=>{},withWriteLock_:(_ctx,fn)=>fn(),buildPtb160SchemaMigrationPlan_:()=>({plan}),ptbError_:(code,message,details)=>Object.assign(new Error(message),{code,details})});
  sandbox.backupMigrationSheet_=()=>{calls.backup++;return {};};sandbox.rewriteSheetSchema_=()=>{calls.rewrite++;};
  return {sandbox,calls};
}
test('source blocker rejects before backup and rewrite',()=>{const plan=analyze(({calendar})=>calendar.values[0][5]='U2'),h=migrationHarness(plan);assert.throws(()=>h.sandbox.migratePtb160Schema(plan.planToken),e=>e.code==='MIGRATION_BLOCKED');assert.deepEqual(h.calls,{backup:0,rewrite:0});});
test('already-target-schema cannot bypass source blocker',()=>{const data=fixture();data.hour.headers=hourTarget;data.hour.values[0]=data.hour.values[0].slice(0,12);data.calendar.values[0][5]='U2';const plan=runtime().analyzePtb160Migration_(data.hour,data.calendar).plan,h=migrationHarness(plan);assert.equal(plan.migrationRequired,false);assert.throws(()=>h.sandbox.migratePtb160Schema(plan.planToken),e=>e.code==='MIGRATION_BLOCKED');assert.equal(h.calls.backup,0);});
test('stale token rejection remains before source blocker processing',()=>{const plan=analyze(({calendar})=>calendar.values[0][5]='U2'),h=migrationHarness(plan);assert.throws(()=>h.sandbox.migratePtb160Schema('stale'),e=>e.code==='MIGRATION_PLAN_STALE');assert.equal(h.calls.backup,0);});
test('post-verify source mismatch fails migration verification',()=>{const data=fixture(),rt=runtime(),changed=structuredClone(data.calendar);changed.values[0][5]='U2';const integrity=rt.analyzeCalendarSourceIntegrity_(data.hour,changed),v=rt.verifyMigrationData_(data.hour,data.calendar,data.hour,changed,{salaryEntries:'a'},{salaryEntries:'a'},{status:'PASS'});assert.equal(integrity.issueCount,1);assert.equal(v.calendarSourceIntegrityValid,false);assert.equal(v.calendarSourceIntegrityIssueCount,1);assert.equal(rt.migrationVerificationPassed_(v),false);});
