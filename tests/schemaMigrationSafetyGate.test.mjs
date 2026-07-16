import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const configSource=fs.readFileSync(path.join(root,'gas/00_Config.gs'),'utf8');
const migrationSource=fs.readFileSync(path.join(root,'gas/06_Migration160.gs'),'utf8');

function gate(config){
  const sandbox={getAppConfig_:ctx=>ctx.config,ptbError_:(code,message,details)=>Object.assign(new Error(message),{code,details})};
  vm.createContext(sandbox);vm.runInContext(migrationSource,sandbox);
  return ()=>sandbox.assertAnonymousSchemaMigrationAllowed_({config});
}

const allowed={testMode:'enabled',writeMode:'enabled',schemaMigrationApproval:'ANONYMOUS_TEST_ONLY',spreadsheetId:'configured'};

test('1 config declares the explicit migration approval property with disabled default',()=>{
  assert.match(configSource,/schemaMigrationApproval:'PTB_SCHEMA_MIGRATION_APPROVAL'/);
  assert.match(configSource,/schemaMigrationApproval:\(p\.getProperty\(PTB_PROPERTY_KEYS\.schemaMigrationApproval\)\|\|'disabled'\)/);
});
test('2 migration rejects disabled test mode',()=>assert.throws(gate({...allowed,testMode:'disabled'}),e=>e.code==='TEST_MODE_REQUIRED'));
test('3 migration rejects disabled write mode',()=>assert.throws(gate({...allowed,writeMode:'disabled'}),e=>e.code==='WRITE_DISABLED'));
test('4 migration rejects a missing or mismatched approval',()=>assert.throws(gate({...allowed,schemaMigrationApproval:'disabled'}),e=>e.code==='MIGRATION_APPROVAL_REQUIRED'));
test('5 migration rejects a missing spreadsheet configuration',()=>assert.throws(gate({...allowed,spreadsheetId:''}),e=>e.code==='SHEET_NOT_CONFIGURED'));
test('6 the complete gate passes without exposing the spreadsheet id in an error or result',()=>{
  assert.doesNotThrow(gate(allowed));
  assert.doesNotMatch(migrationSource,/spreadsheetId\s*:/);
  assert.doesNotMatch(migrationSource,/Logger\.|console\.|getId\(\)/);
});
