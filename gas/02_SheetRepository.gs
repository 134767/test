function getSpreadsheet_(ctx){
  if(ctx&&ctx.spreadsheet){markCacheHit_(ctx,'spreadsheet');return ctx.spreadsheet;}
  var started=Date.now(),ss=SpreadsheetApp.openById(requireSpreadsheetId_(ctx));
  addTiming_(ctx,'spreadsheetOpenMs',Date.now()-started);
  if(ctx)ctx.spreadsheet=ss;
  return ss;
}
function getContextSpreadsheet_(ctx){return getSpreadsheet_(ctx);}
function getTableDef_(key){var d=PTB_TABLES[key];if(!d)throw ptbError_('INVALID_TABLE','不允許的資料表',{tableKey:key});return d;}
function getSheetByTableKey_(key,ctx){
  if(ctx&&ctx.sheets[key]){markCacheHit_(ctx,'sheets');return ctx.sheets[key];}
  var d=getTableDef_(key),s=getSpreadsheet_(ctx).getSheetByName(d.sheet);
  if(!s)throw ptbError_('TABLE_NOT_FOUND','找不到資料表：'+d.sheet,{table:d.sheet});
  if(ctx)ctx.sheets[key]=s;
  return s;
}
function getContextSheet_(ctx,key){return getSheetByTableKey_(key,ctx);}
function getHeaderMap_(sheet,key,ctx){
  if(ctx&&ctx.headers[key]){markCacheHit_(ctx,'headers');return ctx.headers[key];}
  var started=Date.now(),last=sheet.getLastColumn();
  if(!last)throw ptbError_('MISSING_HEADERS','資料表缺少標題列',{table:getTableDef_(key).sheet});
  var h=sheet.getRange(1,1,1,last).getDisplayValues()[0].map(String),map={};
  h.forEach(function(v,i){map[v.trim()]=i;});
  var d=getTableDef_(key),missing=d.headers.filter(function(x){return map[x]===undefined;}),extra=h.filter(function(x){return d.headers.indexOf(String(x).trim())<0;});
  if(missing.length)throw ptbError_('MISSING_HEADERS','資料表缺少欄位：'+missing.join(', '),{table:d.sheet,missingHeaders:missing});
  if(extra.length)throw ptbError_('UNSUPPORTED_EXTRA_HEADERS','資料表含未知欄位，為避免清除資料已拒絕 replace',{table:d.sheet,extraHeaders:extra});
  var out={headers:h,map:map};
  addTiming_(ctx,'headerReadMs',Date.now()-started);
  if(ctx)ctx.headers[key]=out;
  return out;
}
function getContextHeaderMap_(ctx,key){var s=getSheetByTableKey_(key,ctx);return getHeaderMap_(s,key,ctx);}
function projectRecordToSchema_(key,record){var out={};getTableDef_(key).headers.forEach(function(header){if(Object.prototype.hasOwnProperty.call(record||{},header))out[header]=record[header];else out[header]='';});return out;}
function normalizeRecordForClient_(row){var out={};Object.keys(row).forEach(function(k){var v=row[k];if(PTB_JSON_FIELDS[k]){try{v=Array.isArray(v)?v:JSON.parse(v||'[]');if(!Array.isArray(v))v=[];}catch(e){v=[];}}else if(PTB_NUMERIC_FIELDS[k]){v=v===''?0:Number(v);if(!isFinite(v))v=0;}else if(v instanceof Date){v=(k==='date'?Utilities.formatDate(v,'Asia/Taipei','yyyy-MM-dd'):Utilities.formatDate(v,'Asia/Taipei',k.indexOf('Time')>=0?'HH:mm':"yyyy-MM-dd'T'HH:mm:ssXXX"));}else if(v===null||v===undefined){v='';}else{v=String(v);}out[k]=v;});return out;}
function serializeRecordForSheet_(record,headers,key){var projected=key?projectRecordToSchema_(key,record):record;return headers.map(function(k){var v=projected[k];if(PTB_JSON_FIELDS[k])return JSON.stringify(Array.isArray(v)?v:[]);if(v===null||v===undefined)return '';return v;});}
function readTable_(key,ctx){
  if(ctx&&ctx.collections[key]){markCacheHit_(ctx,'collections');return ctx.collections[key];}
  var started=Date.now(),s=getSheetByTableKey_(key,ctx),hm=getHeaderMap_(s,key,ctx),n=s.getLastRow();
  var rows=n<2?[]:s.getRange(2,1,n-1,hm.headers.length).getValues().filter(function(r){return r.some(function(v){return v!=='';});}).map(function(r){var o={};hm.headers.forEach(function(h,i){o[h]=r[i];});return normalizeRecordForClient_(o);});
  var elapsed=Date.now()-started;
  addTiming_(ctx,'sheetReadMs',elapsed);
  addTableTiming_(ctx,'read',key,elapsed,rows.length);
  if(ctx)ctx.collections[key]=rows;
  return rows;
}
function readTableWithContext_(ctx,key){return readTable_(key,ctx);}
function readOptionalTable_(key,ctx){try{return readTable_(key,ctx);}catch(e){if(e&&e.code==='TABLE_NOT_FOUND')return [];throw e;}}
function readOptionalTableWithContext_(ctx,key){return readOptionalTable_(key,ctx);}
function findRowById_(key,id,ctx){var rows=readTable_(key,ctx);for(var i=0;i<rows.length;i++)if(rows[i].id===id)return {row:i+2,record:rows[i]};return null;}
function createId_(key){return key.toUpperCase().replace(/[^A-Z]/g,'').slice(0,8)+'_'+Utilities.getUuid();}
function nowIso_(){return new Date().toISOString();}
function replaceTableRows_(ctx,key,authoritativeRows){
  var started=Date.now(),s=getSheetByTableKey_(key,ctx),hm=getHeaderMap_(s,key,ctx),oldCount=Math.max(0,s.getLastRow()-1),projected=authoritativeRows.map(function(r){return projectRecordToSchema_(key,r);}),values=projected.map(function(r){return serializeRecordForSheet_(r,hm.headers,key);});
  if(values.length)s.getRange(2,1,values.length,hm.headers.length).setValues(values);
  if(oldCount>values.length)s.getRange(values.length+2,1,oldCount-values.length,hm.headers.length).clearContent();
  var clientRows=projected.map(normalizeRecordForClient_),elapsed=Date.now()-started;
  addTiming_(ctx,'sheetWriteMs',elapsed);
  addTableTiming_(ctx,'write',key,elapsed,clientRows.length);
  ctx.collections[key]=clientRows;
  return clientRows;
}
function appendRecord_(key,record,ctx){var rows=readTable_(key,ctx).slice();rows.push(record);return replaceTableRows_(ctx||createRequestContext_(),key,rows).slice(-1)[0];}
function appendRecords_(key,records,ctx){if(!records.length)return [];var c=ctx||createRequestContext_(),before=readTable_(key,c),rows=before.slice().concat(records),written=replaceTableRows_(c,key,rows);return written.slice(before.length);}
function updateRecordAtResolvedRow_(ctx,key,existing,patch){var started=Date.now(),headers=getTableDef_(key).headers,saved=Object.assign({},existing.record,patch,{id:existing.record.id});if(headers.indexOf('createdAt')>=0)saved.createdAt=existing.record.createdAt;if(headers.indexOf('updatedAt')>=0)saved.updatedAt=nowIso_();saved=projectRecordToSchema_(key,saved);var s=getSheetByTableKey_(key,ctx),hm=getHeaderMap_(s,key,ctx);s.getRange(existing.row,1,1,hm.headers.length).setValues([serializeRecordForSheet_(saved,hm.headers,key)]);ctx.collections[key]=null;var elapsed=Date.now()-started;addTiming_(ctx,'sheetWriteMs',elapsed);addTableTiming_(ctx,'write',key,elapsed,1);return normalizeRecordForClient_(saved);}
function updateRecordById_(key,id,patch,ctx,existing){var c=ctx||createRequestContext_(),found=existing||findRowById_(key,id,c);if(!found)throw ptbError_('NOT_FOUND','找不到資料',{tableKey:key,id:id});return updateRecordAtResolvedRow_(c,key,found,patch);}
function deleteRowsByIds_(key,ids,ctx){var c=ctx||createRequestContext_(),set={};(ids||[]).forEach(function(id){set[String(id)]=true;});var before=readTable_(key,c),rows=before.filter(function(r){return !set[r.id];}),deleted=before.filter(function(r){return set[r.id];}).map(function(r){return r.id;});replaceTableRows_(c,key,rows);return {deleted:deleted.length,deletedCount:deleted.length,deletedIds:deleted};}
function withWriteLock_(ctx,fn){
  if(typeof ctx==='function'){fn=ctx;ctx=createRequestContext_();}
  assertWriteEnabled_(ctx);
  var lock=LockService.getScriptLock(),waitStarted=Date.now();
  if(!lock.tryLock(30000)){addTiming_(ctx,'lockWaitMs',Date.now()-waitStarted);throw ptbError_('LOCK_TIMEOUT','寫入鎖逾時');}
  addTiming_(ctx,'lockWaitMs',Date.now()-waitStarted);
  var holdStarted=Date.now();
  try{return fn(ctx);}finally{lock.releaseLock();addTiming_(ctx,'lockHoldMs',Date.now()-holdStarted);}
}
