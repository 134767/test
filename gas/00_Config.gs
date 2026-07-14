var PTB_VERSION = '1.6.0';
var PTB_PROPERTY_KEYS = Object.freeze({ spreadsheetId: 'PTB_SPREADSHEET_ID', githubBaseUrl: 'PTB_GITHUB_PAGES_BASE_URL', appVersion: 'PTB_APP_VERSION', assetVersion: 'PTB_STATIC_ASSET_VERSION', writeMode: 'PTB_WRITE_MODE' });
var PTB_TABLES = Object.freeze({
  budgets:{sheet:'01_budgets',headers:['id','academicYear','budgetAmount','note','createdAt','updatedAt','budgetName','unitCodes']},
  units:{sheet:'02_units',headers:['id','unitCode','unitName','colorKey','note','createdAt','updatedAt']},
  hourSettings:{sheet:'03_hour_settings',headers:['id','academicYear','scheduleType','unitCode','unitName','weekdays','startTime','endTime','hours','hourlyWage','note','createdAt','updatedAt']},
  calendarPeriods:{sheet:'04_calendar_periods',headers:['id','date','weekday','createdAt']},
  calendarRows:{sheet:'05_calendar_rows',headers:['id','date','academicYear','weekday','scheduleType','unitCode','unitName','startTime','endTime','hours','hourlyWage','sourceHourSettingId','createdAt']},
  calendarHolidays:{sheet:'06_calendar_holidays',headers:['id','date','name','type','note','createdAt','updatedAt']},
  salaryEntries:{sheet:'07_salary_entries',headers:['id','academicYear','year','month','unitCode','unitName','actualHours','hourlyWage','actualAmount','note','createdAt','updatedAt']},
  forecastEvaluations:{sheet:'08_forecast_evaluations',headers:['id','name','budget','baseHourlyWage','intervals','createdAt','updatedAt']},
  scheduleTypes:{sheet:'09_schedule_types',headers:['id','name','note','createdAt','updatedAt']},
  holidayNames:{sheet:'10_holiday_names',headers:['id','name','note','createdAt','updatedAt']}
});
var PTB_JSON_FIELDS = Object.freeze({unitCodes:true, intervals:true});
var PTB_NUMERIC_FIELDS = Object.freeze({budgetAmount:true,hours:true,hourlyWage:true,actualHours:true,actualAmount:true,budget:true,baseHourlyWage:true});

function getAppConfig_() {
  var p=PropertiesService.getScriptProperties();
  return {spreadsheetId:(p.getProperty(PTB_PROPERTY_KEYS.spreadsheetId)||'').trim(),githubPagesBaseUrl:(p.getProperty(PTB_PROPERTY_KEYS.githubBaseUrl)||'').trim().replace(/\/+$/,''),appVersion:(p.getProperty(PTB_PROPERTY_KEYS.appVersion)||PTB_VERSION).trim(),staticAssetVersion:(p.getProperty(PTB_PROPERTY_KEYS.assetVersion)||PTB_VERSION).trim(),writeMode:(p.getProperty(PTB_PROPERTY_KEYS.writeMode)||'enabled').trim(),allowLocalFallback:false};
}
function requireSpreadsheetId_(){var id=getAppConfig_().spreadsheetId;if(!id)throw ptbError_('SHEET_NOT_CONFIGURED','尚未設定 PTB_SPREADSHEET_ID');return id;}
function getGithubPagesBaseUrl_(){var u=getAppConfig_().githubPagesBaseUrl;if(!u)throw ptbError_('ASSET_URL_NOT_CONFIGURED','尚未設定 PTB_GITHUB_PAGES_BASE_URL');return u;}
function isWriteEnabled_(){return getAppConfig_().writeMode==='enabled';}
function ptbError_(code,message,details){var e=new Error(message);e.code=code;e.details=details||{};return e;}
function publicError_(e){return {ok:false,code:e.code||'SERVER_ERROR',message:e.message||'GAS 執行失敗',details:e.details||{}};}
function assertWriteEnabled_(){if(!isWriteEnabled_())throw ptbError_('WRITE_DISABLED','目前未開放寫入');}
