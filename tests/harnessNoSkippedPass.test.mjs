import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source=fs.readFileSync(path.resolve(import.meta.dirname,'../gas/90_TestHarness.gs'),'utf8');

test('Salary harness cannot report a skipped PASS and requires or creates a fixture',()=>{
  assert.doesNotMatch(source,/ok\s*:\s*true\s*,\s*skipped/);
  assert.match(source,/TEST_FIXTURE_REQUIRED/);
  assert.match(source,/actualRejectionVerified\s*:\s*true/);
});

test('create, update, and delete harnesses assert counts, identity, and exact response reread',()=>{
  assert.match(source,/reread\.length===rows\.length\+1/);
  assert.match(source,/reread\.filter\(function\(r\)\{return r\.id===id;\}\)\.length===1/);
  assert.match(source,/reread\.length===created\.length/);
  assert.match(source,/JSON\.stringify\(beforeIds\)===JSON\.stringify\(afterIds\)/);
  assert.equal((source.match(/JSON\.stringify\(response\.rows\)===JSON\.stringify\(reread\)/g)||[]).length,3);
});
