import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const dir=path.resolve(import.meta.dirname,'../gas');
for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.gs'))){test(`GAS syntax: ${name}`,()=>{const src=fs.readFileSync(path.join(dir,name),'utf8');assert.doesNotThrow(()=>new Function(src));});}
