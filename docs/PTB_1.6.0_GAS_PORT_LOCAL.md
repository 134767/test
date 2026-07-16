# PTB 1.6.0 GAS / GitHub Pages 架構移植

狀態：`code_ready=true`、`runtime_verified=false`、`ready_for_test_deployment=true`、`ready_for_production_deployment=false`。

## 架構

`GAS Web App /exec → GitHub Pages 版本化 CSS/JS → google.script.run → GAS 驗證/LockService → Google Sheet DB`

正式操作入口僅為 GAS Web App `/exec`。GitHub Pages 根網址只提供靜態資產說明，不提供業務操作；Local Runtime 僅能由 localhost 的 `/local.html` 啟動，`DATA_MODE=localStorage`，首次讀取 `db/*.csv`。GitHub Pages 不保存業務資料；正式資料僅由 GAS backend 讀寫 Google Sheet。

`localhost/local.html → localStorage（開發測試）`

`GAS /exec → GitHub Pages JS/CSS → google.script.run → GAS → Sheet DB`

`GitHub Pages / → 靜態說明頁，不啟動 App`

## Script Properties 與秘密

必要：`PTB_SPREADSHEET_ID`（匿名測試 Sheet 複本 ID）、`PTB_GITHUB_PAGES_BASE_URL`、`PTB_APP_VERSION=1.6.0`、`PTB_STATIC_ASSET_VERSION=1.6.0-hour-filter-holiday-salary-layout-hotfix-9`、`PTB_WRITE_MODE=enabled`。值須由使用者在正確的 Apps Script 專案 UI 設定，不得提交 Spreadsheet ID、deployment URL、token、API key、帳密、cookie 或 email 白名單。目前 `/exec` 的 asset-base 錯誤必須由正確專案的 Script Property 修正，不可硬編碼掩蓋。

## Sheet schema

- `01_budgets`: id, academicYear, budgetAmount, note, createdAt, updatedAt, budgetName, unitCodes
- `02_units`: id, unitCode, unitName, colorKey, note, createdAt, updatedAt
- `03_hour_settings`: id, academicYear, scheduleType, unitCode, unitName, weekdays, startTime, endTime, hours, note, createdAt, updatedAt
- `04_calendar_periods`: id, date, weekday, createdAt
- `05_calendar_rows`: id, date, academicYear, weekday, scheduleType, unitCode, unitName, startTime, endTime, hours, hourlyWage, sourceHourSettingId, createdAt
- `06_calendar_holidays`: id, date, name, type, note, createdAt, updatedAt
- `07_salary_entries`: id, academicYear, year, month, unitCode, unitName, actualHours, hourlyWage, actualAmount, note, createdAt, updatedAt
- `08_forecast_evaluations`: id, name, budget, baseHourlyWage, intervals, createdAt, updatedAt
- `09_schedule_types`: id, name, note, createdAt, updatedAt
- `10_holiday_names`: id, name, note, createdAt, updatedAt

所有欄位依 header 名稱映射。`unitCodes`、`intervals` 在 Sheet 為 JSON 字串、client 為 array。

## Migration 與部署順序

先建立 Sheet 複本及人工備份，依序執行 `inspectPtb160Schema`、檢視報告、`migratePtb160Schema`、`verifyPtb160Schema`。Migration 僅建立缺表、在表尾補 header，不刪表、不刪未知欄、不排序、不虛構 legacy budget mapping。本次未執行。

GitHub Pages 設定 repo/branch 的靜態根目錄後，把 HTTPS base URL 寫入 Script Properties。再以測試身分部署 GAS Web App，建議只允許授權帳號，從 `/exec` 完成人工驗收後才考慮正式部署。

本地驗證：`node --test tests/*.test.mjs`、`python -m http.server 5500 --bind 127.0.0.1`。

Rollback：停止/換版 GAS deployment；還原 migration 前 Sheet 複本；將 GitHub Pages asset version 指回上一版；不可直接覆寫正式 Sheet。

## 已知限制

`08_forecast_evaluations` 無 `budgetName`，方案本身不按群組隔離；migration fixture 尚未用真實複本驗證；GAS Runtime、權限與 Sheet 寫入均未執行。

## Promise mutation contract

Bootstrap 後讀取仍為同步 cache。所有 create/update/delete public API 在 local 與 GAS mode 都回傳 Promise。GAS draft 不會先進 cache；只有 server 回傳的 normalized record、`addedRecords` 或 `deletedIds` 才能更新 cache。錯誤回應會 reject，並保留原 cache、表單與選取狀態。Client 與 server 均有 action whitelist。

`runWithMutationUiLock` 是共用處理鎖：保存並停用按鈕、顯示「處理中…」、await 寫入、finally 還原。Modal 只在成功 rerender 後關閉，不自動重試寫入。

## Page mutation matrix

| Page | Active mutations | Authoritative handler |
|---|---|---|
| Budget | save/update/delete | `budgetPage.js` awaited handlers |
| Unit | save/update/delete | `unitPage.js` awaited handlers |
| Hour | save/update/delete/batch, schedule type | `ptb156HourFormPatch.js` is final save replacement; page owns delete/batch |
| Calendar | periods, holidays, batch interval, scoped delete, holiday names | `ptb156Enhancements.js` owns enhanced holiday modal; page owns period/interval |
| Salary | multi-row save | `salaryEntryPage.js` awaited handler |
| Forecast | evaluation save/delete | `differenceForecastPage.js` awaited handlers |

Hour copy uses one `saveHourSettingsBatch` GAS execution. Calendar rows use one `saveCalendarRowsBatch`; scoped delete sends budget name/date/source filters and server resolves per-year unit codes.

Validation commands: `node --test tests/*.test.mjs`、`node --check` for all frontend modules，以及五支 `tools/browser_*_check.py`（四支既有 Runtime 驗證加 public root guard）。Both GAS batch endpoints preload master data, validate in memory, and use one contiguous `Range.setValues()` call. `09_schedule_types` is optional at bootstrap and becomes `[]` when its Sheet is absent.
