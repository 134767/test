import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source=fs.readFileSync(path.resolve(import.meta.dirname,'../gas/03_Validation.gs'),'utf8');
const validDate=new Function(`${source}; return validDate_;`)();

test('validDate_ accepts real ISO dates and rejects normalized overflow dates',()=>{
  assert.equal(validDate('2026-02-28'),true);
  assert.equal(validDate('2024-02-29'),true);
  for(const value of ['2026-02-29','2026-02-30','2026-13-01','2026-00-10'])assert.equal(validDate(value),false,value);
});
