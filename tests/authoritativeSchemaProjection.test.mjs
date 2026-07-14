import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const source=['gas/00_Config.gs','gas/02_SheetRepository.gs','gas/03_Validation.gs'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n');
const gas=new Function(`${source}; return {normalizeCandidateRows_,projectRecordToSchema_,serializeRecordForSheet_,normalizeRecordForClient_,tables:PTB_TABLES};`)();

for(const key of ['calendarPeriods','calendarRows']){
  test(`${key} authoritative rows contain schema fields only and survive mock Sheet reread`,()=>{
    const headers=gas.tables[key].headers;
    const base=key==='calendarPeriods'
      ? {id:'CALENDAR_abcdefgh',date:'2026-02-28',weekday:'星期六',createdAt:'2026-01-01T00:00:00.000Z'}
      : {id:'CALENDAR_abcdefgh',date:'2026-02-28',academicYear:'115',weekday:'星期六',scheduleType:'平日',unitCode:'U1',unitName:'單位',startTime:'08:00',endTime:'09:00',hours:1,hourlyWage:200,sourceHourSettingId:'HOURSET_abcdefgh',createdAt:'2026-01-01T00:00:00.000Z'};
    const ctx={collections:{[key]:[]}};
    const authoritative=gas.normalizeCandidateRows_(ctx,key,[{...base,updatedAt:'phantom',unknownField:'drop-me'}]);
    assert.deepEqual(Object.keys(authoritative[0]),headers);
    assert.equal(Object.hasOwn(authoritative[0],'updatedAt'),false);
    const sheetValues=gas.serializeRecordForSheet_(authoritative[0],headers,key);
    const reread=gas.normalizeRecordForClient_(Object.fromEntries(headers.map((header,index)=>[header,sheetValues[index]])));
    assert.deepEqual(authoritative,[reread]);
  });
}
