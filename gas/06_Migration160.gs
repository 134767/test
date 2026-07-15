function inspectPtb160Schema(){
  var c=getAppConfig_(),report={spreadsheetConfigured:!!c.spreadsheetId,tables:[],blockers:[],warnings:[],migrationRequired:false};
  if(!c.spreadsheetId){report.blockers.push('尚未設定 PTB_SPREADSHEET_ID');return report;}
  var ss=getSpreadsheet_();
  Object.keys(PTB_TABLES).forEach(function(k){
    var d=PTB_TABLES[k],s=ss.getSheetByName(d.sheet),headers=s&&s.getLastColumn()?s.getRange(1,1,1,s.getLastColumn()).getDisplayValues()[0].map(String):[],missing=d.headers.filter(function(h){return headers.indexOf(h)<0;}),extra=headers.filter(function(h){return d.headers.indexOf(h)<0;}),deprecated=k==='hourSettings'&&headers.indexOf('hourlyWage')>=0?['hourlyWage']:[];
    if(deprecated.length)report.migrationRequired=true;
    report.tables.push({table:d.sheet,exists:!!s,currentHeaders:headers,missingHeaders:missing,extraHeaders:extra,deprecatedColumns:deprecated,rowCount:s?Math.max(0,s.getLastRow()-1):0,blockers:missing.slice(),warnings:deprecated.length?['偵測到已棄用欄位 hourlyWage，必須執行 schema migration']:extra.length?['保留未知欄位']:[]});
    if(k==='budgets'&&s&&s.getLastRow()>1&&(missing.indexOf('budgetName')>=0||missing.indexOf('unitCodes')>=0))report.warnings.push('legacy 01_budgets 群組欄位將保持空白，不自動虛構 mapping');
  });
  return report;
}

function rawSheetData_(sheet){
  var lastColumn=sheet.getLastColumn(),lastRow=sheet.getLastRow(),headers=lastColumn?sheet.getRange(1,1,1,lastColumn).getDisplayValues()[0].map(String):[],values=lastRow>1?sheet.getRange(2,1,lastRow-1,lastColumn).getValues():[];
  return {headers:headers,values:values};
}

function backupMigrationSheet_(ss,sheet,suffix){
  var name=(sheet.getName()+'_backup_'+suffix).slice(0,99),copy=sheet.copyTo(ss).setName(name);
  copy.hideSheet();
  return name;
}

function rewriteSheetSchema_(sheet,current,targetHeaders){
  var rows=current.values.map(function(values){var out={};current.headers.forEach(function(header,index){out[header]=values[index];});return targetHeaders.map(function(header){return Object.prototype.hasOwnProperty.call(out,header)?out[header]:'';});});
  sheet.clearContents();
  if(sheet.getMaxColumns()<targetHeaders.length)sheet.insertColumnsAfter(sheet.getMaxColumns(),targetHeaders.length-sheet.getMaxColumns());
  sheet.getRange(1,1,1,targetHeaders.length).setValues([targetHeaders]);
  if(rows.length)sheet.getRange(2,1,rows.length,targetHeaders.length).setValues(rows);
  if(sheet.getMaxColumns()>targetHeaders.length)sheet.deleteColumns(targetHeaders.length+1,sheet.getMaxColumns()-targetHeaders.length);
}

function migratePtb160Schema(){
  return withWriteLock_(function(){
    var ss=getSpreadsheet_(),hourDef=PTB_TABLES.hourSettings,calendarDef=PTB_TABLES.calendarRows,hourSheet=ss.getSheetByName(hourDef.sheet),calendarSheet=ss.getSheetByName(calendarDef.sheet),changes=[],backups=[];
    if(!hourSheet||!calendarSheet)throw ptbError_('TABLE_NOT_FOUND','hour settings 與 calendar rows Sheet 必須先存在');
    var hourRaw=rawSheetData_(hourSheet),calendarRaw=rawSheetData_(calendarSheet),legacyWageIndex=hourRaw.headers.indexOf('hourlyWage'),calendarWageIndex=calendarRaw.headers.indexOf('hourlyWage'),sourceIndex=calendarRaw.headers.indexOf('sourceHourSettingId'),hourIdIndex=hourRaw.headers.indexOf('id');
    if(legacyWageIndex<0)return {ok:true,changes:[],backups:[],alreadyMigrated:true,inspection:inspectPtb160Schema()};
    if(hourIdIndex<0||sourceIndex<0)throw ptbError_('MISSING_HEADERS','migration 缺少 id 或 sourceHourSettingId');
    var legacyWages={};
    hourRaw.values.forEach(function(row){var wage=Number(row[legacyWageIndex]);if(isFinite(wage)&&wage>0)legacyWages[String(row[hourIdIndex])]=wage;});
    if(calendarWageIndex<0){calendarRaw.headers.push('hourlyWage');calendarRaw.values.forEach(function(row){row.push('');});calendarWageIndex=calendarRaw.headers.length-1;}
    var unresolved=[];
    calendarRaw.values.forEach(function(row,index){var wage=Number(row[calendarWageIndex]);if(isFinite(wage)&&wage>0)return;var sourceId=String(row[sourceIndex]||''),fallback=legacyWages[sourceId];if(fallback){row[calendarWageIndex]=fallback;}else{unresolved.push({row:index+2,sourceHourSettingId:sourceId});}});
    if(unresolved.length)throw ptbError_('MIGRATION_BLOCKED','部分 calendar rows 無法取得有效時薪',{unresolved:unresolved});
    var suffix=Utilities.formatDate(new Date(),'Asia/Taipei','yyyyMMdd_HHmmss');
    backups.push(backupMigrationSheet_(ss,hourSheet,suffix));
    backups.push(backupMigrationSheet_(ss,calendarSheet,suffix));
    rewriteSheetSchema_(calendarSheet,calendarRaw,calendarDef.headers);
    rewriteSheetSchema_(hourSheet,hourRaw,hourDef.headers);
    changes.push({table:calendarDef.sheet,populatedHourlyWage:true,rowCount:calendarRaw.values.length});
    changes.push({table:hourDef.sheet,removedDeprecatedColumn:'hourlyWage'});
    return {ok:true,changes:changes,backups:backups,alreadyMigrated:false,inspection:inspectPtb160Schema()};
  });
}

function verifyPtb160Schema(){var r=inspectPtb160Schema(),fail=r.blockers.length>0||r.migrationRequired||r.tables.some(function(t){return !t.exists||t.missingHeaders.length>0||t.extraHeaders.length>0;});return {ok:!fail,status:fail?'FAIL':'PASS',inspection:r};}
