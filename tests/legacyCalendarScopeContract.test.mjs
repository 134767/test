import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source=fs.readFileSync(path.resolve(import.meta.dirname,'../gas/04_Api.gs'),'utf8');
function makeApi(initial){
  const state=structuredClone(initial),error=(code,message)=>Object.assign(new Error(message),{code});
  const factory=new Function('getAppConfig_','withWriteLock_','cleanString_','validDate_','ptbError_','readTable_','normalizeAndValidateCollections_','replaceTableRows_',`${source}; return {deleteCalendarRowsByScope,deleteCalendarPeriods};`);
  const api=factory(()=>({}),(_ctx,fn)=>fn(),value=>String(value??'').trim(),value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value))&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`)),error,key=>state[key],(_ctx,raw)=>raw,(_ctx,key,rows)=>{state[key]=structuredClone(rows);return state[key];});
  return {api,state};
}

test('legacy scoped delete requires budget name and limits year, unit, date, and optional source',()=>{
  const rows=[
    {id:'delete',date:'2026-07-01',academicYear:'115',unitCode:'U1',sourceHourSettingId:'H1'},
    {id:'wrong-source',date:'2026-07-01',academicYear:'115',unitCode:'U1',sourceHourSettingId:'H2'},
    {id:'wrong-unit',date:'2026-07-01',academicYear:'115',unitCode:'U2',sourceHourSettingId:'H1'},
    {id:'wrong-year',date:'2026-07-01',academicYear:'114',unitCode:'U1',sourceHourSettingId:'H1'},
    {id:'outside',date:'2026-08-01',academicYear:'115',unitCode:'U1',sourceHourSettingId:'H1'}
  ];
  const {api,state}=makeApi({budgets:[{academicYear:'115',budgetName:'群組 A',unitCodes:['U1']}],calendarRows:rows,calendarPeriods:[]});
  assert.throws(()=>api.deleteCalendarRowsByScope({startDate:'2026-07-01',endDate:'2026-07-31'},{}),error=>error.code==='VALIDATION_ERROR');
  const result=api.deleteCalendarRowsByScope({selectedBudgetName:'群組 A',startDate:'2026-07-01',endDate:'2026-07-31',sourceHourSettingIds:['H1']},{});
  assert.deepEqual(result.deletedIds,['delete']);
  assert.deepEqual(state.calendarRows.map(row=>row.id),['wrong-source','wrong-unit','wrong-year','outside']);
});

test('legacy scoped delete rejects duplicate same-name budgets in one academic year',()=>{
  const {api}=makeApi({budgets:[{academicYear:'115',budgetName:'A',unitCodes:['U1']},{academicYear:'115',budgetName:'A',unitCodes:['U2']}],calendarRows:[],calendarPeriods:[]});
  assert.throws(()=>api.deleteCalendarRowsByScope({selectedBudgetName:'A',startDate:'2026-07-01',endDate:'2026-07-31'},{}),error=>error.code==='BUDGET_SCOPE_ANOMALY');
});

test('legacy period delete also removes calendar rows in the requested range',()=>{
  const {api,state}=makeApi({budgets:[],calendarPeriods:[{id:'P1',date:'2026-07-01'},{id:'P2',date:'2026-08-01'}],calendarRows:[{id:'R1',date:'2026-07-15'},{id:'R2',date:'2026-08-01'}]});
  const result=api.deleteCalendarPeriods({ids:['P1'],startDate:'2026-07-01',endDate:'2026-07-31'},{});
  assert.deepEqual(result.deletedIds,['P1']);
  assert.deepEqual(result.deletedCalendarRowIds,['R1']);
  assert.deepEqual(state.calendarPeriods.map(row=>row.id),['P2']);
  assert.deepEqual(state.calendarRows.map(row=>row.id),['R2']);
});
