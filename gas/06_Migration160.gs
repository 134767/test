function assertSchemaMigrationPlanAllowed_(ctx){
  var config=getAppConfig_(ctx);
  if(config.testMode!=='enabled')throw ptbError_('TEST_MODE_REQUIRED','PTB_TEST_MODE=enabled 才能建立 schema migration plan');
  if(!config.spreadsheetId)throw ptbError_('SHEET_NOT_CONFIGURED','尚未設定匿名測試 Sheet');
}

function assertAnonymousSchemaMigrationAllowed_(ctx){
  var config=getAppConfig_(ctx);
  if(config.testMode!=='enabled')throw ptbError_('TEST_MODE_REQUIRED','PTB_TEST_MODE=enabled 才能執行 schema migration');
  if(config.writeMode!=='enabled')throw ptbError_('WRITE_DISABLED','PTB_WRITE_MODE=enabled 才能執行 schema migration');
  if(config.schemaMigrationApproval!=='ANONYMOUS_TEST_ONLY')throw ptbError_('MIGRATION_APPROVAL_REQUIRED','尚未取得匿名測試 Sheet migration 授權');
  if(!config.spreadsheetId)throw ptbError_('SHEET_NOT_CONFIGURED','尚未設定匿名測試 Sheet');
}

function inspectPtb160Schema(ctx){
  var c=getAppConfig_(ctx),report={spreadsheetConfigured:!!c.spreadsheetId,tables:[],blockers:[],warnings:[],migrationRequired:false};
  if(!c.spreadsheetId){report.blockers.push('尚未設定 PTB_SPREADSHEET_ID');return report;}
  var ss=getSpreadsheet_(ctx);
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

function cloneRawSheetData_(raw){return {headers:(raw.headers||[]).slice(),values:(raw.values||[]).map(function(row){return row.slice();})};}
function sameJson_(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function columnValues_(raw,name){var index=raw.headers.indexOf(name);return index<0?[]:raw.values.map(function(row){return String(row[index]===undefined||row[index]===null?'':row[index]);});}

function sha256Hex_(material){
  var digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(material),Utilities.Charset.UTF_8);
  return digest.map(function(value){var byte=value<0?value+256:value,hex=byte.toString(16);return hex.length===1?'0'+hex:hex;}).join('');
}

function migrationPlanToken_(hourRaw,calendarRaw){
  return sha256Hex_({hourSettings:{headers:hourRaw.headers,values:hourRaw.values},calendarRows:{headers:calendarRaw.headers,values:calendarRaw.values},targetHeaders:{hourSettings:PTB_TABLES.hourSettings.headers,calendarRows:PTB_TABLES.calendarRows.headers}});
}

function analyzeCalendarSourceIntegrity_(hourRaw,calendarRaw){
  var hourRequired=['id','academicYear','scheduleType','unitCode'],calendarRequired=['sourceHourSettingId','academicYear','scheduleType','unitCode'],blockers=[],issues=[],reasonCounts={},hourIndexes={},calendarIndexes={};
  hourRequired.forEach(function(name){hourIndexes[name]=(hourRaw.headers||[]).indexOf(name);if(hourIndexes[name]<0)blockers.push('03_hour_settings 缺少來源完整性欄位：'+name);});
  calendarRequired.forEach(function(name){calendarIndexes[name]=(calendarRaw.headers||[]).indexOf(name);if(calendarIndexes[name]<0)blockers.push('05_calendar_rows 缺少來源完整性欄位：'+name);});
  if(blockers.length)return {valid:false,issueCount:0,issues:[],reasonCounts:{},blockers:blockers};
  var hourRowsById={},blankHourIds=0,duplicateHourIds=0;
  (hourRaw.values||[]).forEach(function(row){var id=String(row[hourIndexes.id]===undefined||row[hourIndexes.id]===null?'':row[hourIndexes.id]);if(!id){blankHourIds++;return;}if(!hourRowsById[id])hourRowsById[id]=[];hourRowsById[id].push(row);});
  Object.keys(hourRowsById).forEach(function(id){if(hourRowsById[id].length>1)duplicateHourIds++;});
  if(blankHourIds)blockers.push('03_hour_settings 存在空白 id：'+blankHourIds);
  if(duplicateHourIds)blockers.push('03_hour_settings 存在重複 id：'+duplicateHourIds);
  (calendarRaw.values||[]).forEach(function(row,index){
    var sourceId=String(row[calendarIndexes.sourceHourSettingId]===undefined||row[calendarIndexes.sourceHourSettingId]===null?'':row[calendarIndexes.sourceHourSettingId]),sources=hourRowsById[sourceId]||[],reason='';
    if(!sourceId)reason='missing_source_hour_setting_id';
    else if(!sources.length)reason='source_hour_setting_not_found';
    else if(sources.length>1)reason='duplicate_source_hour_setting_id';
    else if(String(row[calendarIndexes.academicYear]||'')!==String(sources[0][hourIndexes.academicYear]||''))reason='source_academic_year_mismatch';
    else if(String(row[calendarIndexes.unitCode]||'')!==String(sources[0][hourIndexes.unitCode]||''))reason='source_unit_code_mismatch';
    else if(String(row[calendarIndexes.scheduleType]||'')!==String(sources[0][hourIndexes.scheduleType]||''))reason='source_schedule_type_mismatch';
    if(reason){issues.push({rowNumber:index+2,sourceHourSettingId:sourceId,reason:reason});reasonCounts[reason]=(reasonCounts[reason]||0)+1;}
  });
  if(issues.length)blockers.push('存在 Calendar source 關聯錯誤：'+issues.length);
  return {valid:blockers.length===0,issueCount:issues.length,issues:issues,reasonCounts:reasonCounts,blockers:blockers};
}

function analyzePtb160Migration_(hourRawInput,calendarRawInput){
  var hourRaw=cloneRawSheetData_(hourRawInput),calendarRaw=cloneRawSheetData_(calendarRawInput),hourTarget=PTB_TABLES.hourSettings.headers.slice(),calendarTarget=PTB_TABLES.calendarRows.headers.slice(),legacyWageIndex=hourRaw.headers.indexOf('hourlyWage'),hourIdIndex=hourRaw.headers.indexOf('id'),sourceIndex=calendarRaw.headers.indexOf('sourceHourSettingId'),calendarWageIndex=calendarRaw.headers.indexOf('hourlyWage'),warnings=[],blockers=[];
  var migrationRequired=!sameJson_(hourRaw.headers,hourTarget)||!sameJson_(calendarRaw.headers,calendarTarget),legacyWages={},sourceIntegrity=analyzeCalendarSourceIntegrity_(hourRawInput,calendarRawInput);
  blockers=blockers.concat(sourceIntegrity.blockers);
  if(legacyWageIndex>=0)warnings.push('03_hour_settings.hourlyWage 為已棄用欄位');
  if(hourIdIndex<0)blockers.push('03_hour_settings 缺少 id');
  if(sourceIndex<0)blockers.push('05_calendar_rows 缺少 sourceHourSettingId');
  if(hourIdIndex>=0&&legacyWageIndex>=0)hourRaw.values.forEach(function(row){var wage=Number(row[legacyWageIndex]);if(isFinite(wage)&&wage>0)legacyWages[String(row[hourIdIndex]||'')]=wage;});
  if(calendarWageIndex<0){calendarRaw.headers.push('hourlyWage');calendarRaw.values.forEach(function(row){row.push('');});calendarWageIndex=calendarRaw.headers.length-1;}
  var positiveWageRows=0,backfillRequiredRows=0,preservedPositiveRows=0,unresolvedRows=[];
  calendarRaw.values.forEach(function(row,index){
    var wage=Number(row[calendarWageIndex]);
    if(isFinite(wage)&&wage>0){positiveWageRows++;preservedPositiveRows++;return;}
    backfillRequiredRows++;
    var sourceId=sourceIndex>=0?String(row[sourceIndex]||''):'',fallback=legacyWages[sourceId];
    if(fallback){row[calendarWageIndex]=fallback;return;}
    var reason=!sourceId?'missing_source_hour_setting_id':legacyWageIndex<0?'legacy_hourly_wage_not_available':'source_hourly_wage_not_positive';
    unresolvedRows.push({rowNumber:index+2,sourceHourSettingId:sourceId,reason:reason});
  });
  if(unresolvedRows.length)blockers.push('存在無法補值的 calendar rows：'+unresolvedRows.length);
  var safePlan={ok:blockers.length===0,migrationRequired:migrationRequired,hourSettings:{currentHeaders:hourRawInput.headers.slice(),targetHeaders:hourTarget,deprecatedHourlyWageDetected:legacyWageIndex>=0,rowCount:hourRawInput.values.length},calendarRows:{currentHeaders:calendarRawInput.headers.slice(),targetHeaders:calendarTarget,rowCount:calendarRawInput.values.length,positiveWageRows:positiveWageRows,backfillRequiredRows:backfillRequiredRows,unresolvedRows:unresolvedRows,preservedPositiveRows:preservedPositiveRows},calendarSourceIntegrity:{valid:sourceIntegrity.valid,issueCount:sourceIntegrity.issueCount,issues:sourceIntegrity.issues,reasonCounts:sourceIntegrity.reasonCounts},planToken:migrationPlanToken_(hourRawInput,calendarRawInput),warnings:warnings,blockers:blockers};
  return {plan:safePlan,hourRaw:hourRaw,calendarPrepared:calendarRaw};
}

function buildPtb160SchemaMigrationPlan_(ctx){
  var ss=getSpreadsheet_(ctx),hourSheet=ss.getSheetByName(PTB_TABLES.hourSettings.sheet),calendarSheet=ss.getSheetByName(PTB_TABLES.calendarRows.sheet);
  if(!hourSheet||!calendarSheet)throw ptbError_('TABLE_NOT_FOUND','hour settings 與 calendar rows Sheet 必須先存在');
  return analyzePtb160Migration_(rawSheetData_(hourSheet),rawSheetData_(calendarSheet));
}

function planPtb160SchemaMigration(){
  var ctx=createRequestContext_();
  assertSchemaMigrationPlanAllowed_(ctx);
  return buildPtb160SchemaMigrationPlan_(ctx).plan;
}

function migrationBackupSuffix_(){return Utilities.formatDate(new Date(),'Asia/Taipei','yyyyMMdd_HHmmss')+'_'+Utilities.getUuid().replace(/-/g,'').slice(0,6);}
function backupMigrationSheet_(ss,sheet,suffix){var copy=sheet.copyTo(ss),name=(sheet.getName()+'_backup_'+suffix).slice(0,99);copy.setName(name);copy.hideSheet();return {name:name,sheet:copy};}

function rewriteSheetSchema_(sheet,current,targetHeaders){
  var rows=current.values.map(function(values){var out={};current.headers.forEach(function(header,index){out[header]=values[index];});return targetHeaders.map(function(header){return Object.prototype.hasOwnProperty.call(out,header)?out[header]:'';});});
  sheet.clearContents();
  if(sheet.getMaxColumns()<targetHeaders.length)sheet.insertColumnsAfter(sheet.getMaxColumns(),targetHeaders.length-sheet.getMaxColumns());
  sheet.getRange(1,1,1,targetHeaders.length).setValues([targetHeaders]);
  if(rows.length)sheet.getRange(2,1,rows.length,targetHeaders.length).setValues(rows);
  if(sheet.getMaxColumns()>targetHeaders.length)sheet.deleteColumns(targetHeaders.length+1,sheet.getMaxColumns()-targetHeaders.length);
}

function resizeSheetForRestore_(sheet,rows,columns){
  if(sheet.getMaxRows()<rows)sheet.insertRowsAfter(sheet.getMaxRows(),rows-sheet.getMaxRows());
  if(sheet.getMaxColumns()<columns)sheet.insertColumnsAfter(sheet.getMaxColumns(),columns-sheet.getMaxColumns());
  if(sheet.getMaxRows()>rows)sheet.deleteRows(rows+1,sheet.getMaxRows()-rows);
  if(sheet.getMaxColumns()>columns)sheet.deleteColumns(columns+1,sheet.getMaxColumns()-columns);
}

function restoreSheetFromBackup_(targetSheet,backupSheet){
  var rows=backupSheet.getMaxRows(),columns=backupSheet.getMaxColumns();
  resizeSheetForRestore_(targetSheet,rows,columns);
  targetSheet.clear();
  backupSheet.getRange(1,1,rows,columns).copyTo(targetSheet.getRange(1,1));
  return true;
}

function captureOtherTableDigests_(ss){
  var out={};Object.keys(PTB_TABLES).forEach(function(key){if(key==='hourSettings'||key==='calendarRows')return;var def=PTB_TABLES[key],sheet=ss.getSheetByName(def.sheet);out[key]=sheet?sha256Hex_(rawSheetData_(sheet)):'MISSING';});return out;
}

function positiveWageMap_(raw){
  var idIndex=raw.headers.indexOf('id'),wageIndex=raw.headers.indexOf('hourlyWage'),out={};
  if(idIndex<0||wageIndex<0)return out;
  raw.values.forEach(function(row){var wage=Number(row[wageIndex]);if(isFinite(wage)&&wage>0)out[String(row[idIndex]||'')]=wage;});return out;
}

function verifyMigrationData_(beforeHour,beforeCalendar,afterHour,afterCalendar,beforeOther,afterOther,schemaResult){
  var beforePositive=positiveWageMap_(beforeCalendar),afterPositive=positiveWageMap_(afterCalendar),positivePreserved=Object.keys(beforePositive).every(function(id){return afterPositive[id]===beforePositive[id];});
  var afterWageIndex=afterCalendar.headers.indexOf('hourlyWage'),allCalendarWagesPositive=afterWageIndex>=0&&afterCalendar.values.every(function(row){var wage=Number(row[afterWageIndex]);return isFinite(wage)&&wage>0;});
  var otherTablesUnchanged=sameJson_(beforeOther,afterOther),salaryEntriesUnchanged=beforeOther.salaryEntries===afterOther.salaryEntries,sourceIntegrity=analyzeCalendarSourceIntegrity_(afterHour,afterCalendar);
  return {schemaVerify:schemaResult&&schemaResult.status==='PASS'?'PASS':'FAIL',calendarRowCountUnchanged:beforeCalendar.values.length===afterCalendar.values.length,calendarRowIdsUnchanged:sameJson_(columnValues_(beforeCalendar,'id'),columnValues_(afterCalendar,'id')),sourceIdsUnchanged:sameJson_(columnValues_(beforeCalendar,'sourceHourSettingId'),columnValues_(afterCalendar,'sourceHourSettingId')),calendarSourceIntegrityValid:sourceIntegrity.valid,calendarSourceIntegrityIssueCount:sourceIntegrity.issueCount,positiveWagesPreserved:positivePreserved,allCalendarWagesPositive:allCalendarWagesPositive,hourSettingRowCountUnchanged:beforeHour.values.length===afterHour.values.length,salaryEntriesUnchanged:salaryEntriesUnchanged,otherTablesUnchanged:otherTablesUnchanged};
}

function migrationVerificationPassed_(verification){return verification.schemaVerify==='PASS'&&verification.calendarRowCountUnchanged&&verification.calendarRowIdsUnchanged&&verification.sourceIdsUnchanged&&verification.calendarSourceIntegrityValid&&verification.positiveWagesPreserved&&verification.allCalendarWagesPositive&&verification.hourSettingRowCountUnchanged&&verification.salaryEntriesUnchanged&&verification.otherTablesUnchanged;}

function rollbackMigration_(hourSheet,calendarSheet,hourBackup,calendarBackup,beforeHour,beforeCalendar,originalError){
  var hourRestored=false,calendarRestored=false,rollbackErrors=[];
  try{restoreSheetFromBackup_(hourSheet,hourBackup.sheet);hourRestored=sha256Hex_(rawSheetData_(hourSheet))===sha256Hex_(beforeHour);}catch(e){rollbackErrors.push(e.code||'HOUR_RESTORE_FAILED');}
  try{restoreSheetFromBackup_(calendarSheet,calendarBackup.sheet);calendarRestored=sha256Hex_(rawSheetData_(calendarSheet))===sha256Hex_(beforeCalendar);}catch(e){rollbackErrors.push(e.code||'CALENDAR_RESTORE_FAILED');}
  var details={hourSettingsRestored:hourRestored,calendarRowsRestored:calendarRestored,backupSheets:{hourSettings:hourBackup.name,calendarRows:calendarBackup.name},originalErrorCode:originalError.code||'SERVER_ERROR'};
  if(hourRestored&&calendarRestored)throw ptbError_('MIGRATION_FAILED_ROLLED_BACK','schema migration 失敗，兩張 Sheet 已還原',details);
  details.rollbackErrors=rollbackErrors;
  throw ptbError_('MIGRATION_ROLLBACK_FAILED','schema migration 與自動還原皆失敗',details);
}

function migratePtb160Schema(expectedPlanToken){
  var ctx=createRequestContext_();
  assertAnonymousSchemaMigrationAllowed_(ctx);
  return withWriteLock_(ctx,function(){
    var analysis=buildPtb160SchemaMigrationPlan_(ctx),plan=analysis.plan,expected=String(expectedPlanToken||'').trim();
    if(!expected||expected!==plan.planToken)throw ptbError_('MIGRATION_PLAN_STALE','migration plan 已失效，請重新建立唯讀 plan');
    if(plan.blockers.length)throw ptbError_('MIGRATION_BLOCKED','schema migration plan 含有阻擋項目',{blockers:plan.blockers,unresolvedRows:plan.calendarRows.unresolvedRows,calendarSourceIntegrity:plan.calendarSourceIntegrity});
    if(!plan.migrationRequired)return {ok:true,alreadyMigrated:true,writesPerformed:false,planToken:plan.planToken,backupSheets:{},changes:{calendarRowsBackfilled:0,calendarRowsPositivePreserved:plan.calendarRows.preservedPositiveRows,hourSettingsDeprecatedColumnRemoved:false}};
    var ss=getSpreadsheet_(ctx),hourSheet=ss.getSheetByName(PTB_TABLES.hourSettings.sheet),calendarSheet=ss.getSheetByName(PTB_TABLES.calendarRows.sheet),beforeHour=rawSheetData_(hourSheet),beforeCalendar=rawSheetData_(calendarSheet),beforeOther=captureOtherTableDigests_(ss),suffix=migrationBackupSuffix_(),hourBackup=backupMigrationSheet_(ss,hourSheet,suffix),calendarBackup;
    try{calendarBackup=backupMigrationSheet_(ss,calendarSheet,suffix);}catch(backupError){throw ptbError_(backupError.code||'BACKUP_FAILED','第二張 migration 備份建立失敗',{hourSettingsBackup:hourBackup.name,originalErrorCode:backupError.code||'SERVER_ERROR'});}
    try{
      if(!hourBackup.sheet||!calendarBackup.sheet)throw ptbError_('BACKUP_FAILED','兩張 migration 備份未完整建立',{backupSheets:{hourSettings:hourBackup.name,calendarRows:calendarBackup.name}});
      rewriteSheetSchema_(calendarSheet,analysis.calendarPrepared,PTB_TABLES.calendarRows.headers);
      rewriteSheetSchema_(hourSheet,analysis.hourRaw,PTB_TABLES.hourSettings.headers);
      var schemaResult=verifyPtb160Schema(ctx),afterHour=rawSheetData_(hourSheet),afterCalendar=rawSheetData_(calendarSheet),afterOther=captureOtherTableDigests_(ss),verification=verifyMigrationData_(beforeHour,beforeCalendar,afterHour,afterCalendar,beforeOther,afterOther,schemaResult);
      if(!migrationVerificationPassed_(verification))throw ptbError_('POST_MIGRATION_VERIFY_FAILED','migration 後資料不變條件驗證失敗',{verification:verification});
      return {ok:true,alreadyMigrated:false,writesPerformed:true,planToken:plan.planToken,backupSheets:{hourSettings:hourBackup.name,calendarRows:calendarBackup.name},changes:{calendarRowsBackfilled:plan.calendarRows.backfillRequiredRows,calendarRowsPositivePreserved:plan.calendarRows.preservedPositiveRows,hourSettingsDeprecatedColumnRemoved:plan.hourSettings.deprecatedHourlyWageDetected},before:{hourSettingRows:beforeHour.values.length,calendarRows:beforeCalendar.values.length,hourSettingHeaders:beforeHour.headers,calendarHeaders:beforeCalendar.headers},after:{hourSettingRows:afterHour.values.length,calendarRows:afterCalendar.values.length,hourSettingHeaders:afterHour.headers,calendarHeaders:afterCalendar.headers},verification:verification};
    }catch(error){return rollbackMigration_(hourSheet,calendarSheet,hourBackup,calendarBackup,beforeHour,beforeCalendar,error);}
  });
}

function verifyPtb160Schema(ctx){var r=inspectPtb160Schema(ctx),fail=r.blockers.length>0||r.migrationRequired||r.tables.some(function(t){return !t.exists||t.missingHeaders.length>0||t.extraHeaders.length>0;});return {ok:!fail,status:fail?'FAIL':'PASS',inspection:r};}
