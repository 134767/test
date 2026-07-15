# PTB 1.6.0 Collection Mutation Engine

```yaml
task_id: PTB-1.6.0-RESTORE-155-MUTATION-ENGINE
architecture: optimistic full-collection replace with authoritative server response
frontend_state_machine: confirmed -> optimistic/debouncing -> in-flight -> authoritative | rollback
gas_request_context: one config, spreadsheet, sheet, header, and collection cache per runServerFunction request
collection_whitelist:
  - budgets
  - units
  - hourSettings
  - calendarPeriods
  - calendarRows
  - calendarHolidays
  - salaryEntries
  - forecastEvaluations
salary_unique_key: academicYear + year + month + unitCode
rollback_behavior: restore confirmedRows, emit rollback, reject covered promises, never use local fallback
write_permission_preflight: before every GAS optimistic cache mutation
batch_coordination: sorted per-collection reservations shared with single mutation state
authoritative_projection: schema fields only
date_validation: strict ISO date with UTC component equality
legacy_calendar_delete: budget-name and academic-year/unit scoped compatibility retained
gas_localStorage_policy: forbidden for business collections
asset_version: 1.6.0-calendar-wage-hotfix-1
deployment_status: NOT_DEPLOYED
real_roundtrip_status: NOT_RUN
known_limits:
  - Google Sheets is not a database transaction; batch replace validates every candidate before the first write.
  - scheduleTypes and holidayNames remain on their explicit legacy endpoints and are not in the replace whitelist.
  - Unknown Sheet headers cause an explicit UNSUPPORTED_EXTRA_HEADERS rejection to avoid erasing unknown data.
```

前端每個 collection 保存 confirmed rows、generation、timer、in-flight request 與 waiters。同 collection 250ms 內的 mutation 共用一次 request；飛行期間的新 generation 保留 optimistic cache，舊 response 只更新 confirmed baseline。Server failure 會還原 confirmed snapshot，且 GAS 模式不呼叫 `_saveLocal()`。

Pre-roundtrip hardening 在任何 GAS optimistic mutation 前先檢查 write mode；`WRITE_DISABLED` 不改 cache、不送 request、不建立 waiter 或 UI token。Multi-collection mutation 以去重排序後的 collection reservation 協調 single request、debounce timer 與 batch request，candidate 僅在 reservation 完成並排空既有 single mutation 後，從最新 cache 建立。Batch failure 對所有涵蓋 collection 還原各自的 `confirmedRows`。

GAS `runServerFunction()` 建立唯一 request context。Write action 先讀設定與檢查 `PTB_WRITE_MODE`，只取得一次 Script Lock，再 lazy-open Spreadsheet。`replaceCollectionsBatch` 會先正規化並驗證所有 candidate collections，全部通過後才逐 collection bulk `setValues()`。

Server normalization、Sheet serialization、request context cache 與 authoritative response 都投影到 `PTB_TABLES` headers；`calendarPeriods`、`calendarRows` 不會產生 schema 外的 `updatedAt`。Calendar 與 holiday 日期使用嚴格 UTC component 驗證，拒絕不存在的日期。Deprecated Calendar scoped-delete endpoint 保留舊契約：依 budget name、academic year、unit code、日期與 optional source IDs 限定刪除範圍；period delete 仍同步刪除區間 calendar rows。

既有 single-record GAS actions 僅保留相容性並標記 deprecated；主要 UI business mutations 不再依賴它們。`scheduleTypes` 與 `holidayNames` 維持既有明確 endpoint，未擴大 collection-replace 權限。

Salary 的 `actualAmount` 是使用者直接輸入的實際金額，Server 只驗證 finite non-negative，不以 `actualHours * hourlyWage` 覆寫。`inspectSalaryEntryDuplicates` / `inspectSalaryEntryDuplicateKeys` 只讀取並回報重複鍵，不自動修正資料。

時薪來源已改為日期區間快照：`03_hour_settings` 不再保存時薪；新增作息區間時必須輸入大於 0 的時薪，並寫入每筆 `05_calendar_rows.hourlyWage`。同一個 `sourceHourSettingId` 可在不同日期區間保留不同時薪。薪資的 `hourlyWage` 僅供 audit 顯示，`actualAmount` 仍是人工輸入；當期與過去差額逐列以 `calendarRows.hours * calendarRows.hourlyWage` 計算，未來預估只讀取 forecast interval 的 `hourlyWage`。

若 `inspectPtb160Schema()` 回報 `03_hour_settings.hourlyWage` 為 deprecated column，必須先審查再於匿名測試 Sheet 執行 `migratePtb160Schema()`。migration 會先建立 `03_hour_settings` 與 `05_calendar_rows` 隱藏備份、補齊缺少的日曆時薪，確認無 unresolved rows 後才移除舊欄位。正式 Sheet migration、真實 round-trip 與 deployment 均不在本次執行範圍。

部署測試環境時設定 `PTB_STATIC_ASSET_VERSION=1.6.0-calendar-wage-hotfix-1`。真實 harness 另需匿名測試 Sheet 副本與 `PTB_TEST_MODE=enabled`。

Real-Sheet harness 的 Salary duplicate 測試會從匿名資料建立可還原的受控 fixture；找不到唯一 unit/budget fixture 時明確回報 `TEST_FIXTURE_REQUIRED`，不再把 skipped 記為 PASS。Create/update/delete harness 皆驗證 row count、ID 唯一性／保留性，以及 response 與重新讀取結果完整 deep-equal。

本 commit 未執行 migration。本 commit 未寫入正式 Sheet。本 commit 未建立或更新 production deployment。GAS deployment version 8 不包含本輪程式，直到另行部署。真實 Sheet round-trip 未執行前，不得宣稱 CRUD 正式驗收通過。

## Schema migration control boundary

Schema migration 不屬於一般 collection mutation，也不得透過 optimistic queue 或 replace endpoints 觸發。它採三階段受控流程：

```yaml
phase_1:
  action: planPtb160SchemaMigration
  write: false
phase_2:
  action: migratePtb160Schema(planToken)
  requirements:
    - PTB_TEST_MODE=enabled
    - PTB_WRITE_MODE=enabled
    - PTB_SCHEMA_MIGRATION_APPROVAL=ANONYMOUS_TEST_ONLY
phase_3:
  action: verifyPtb160Schema
  write: false
current_status:
  anonymous_sheet_migration: NOT_RUN
  official_sheet_migration: NOT_RUN
```

Plan token 是兩張來源表 raw headers/values 與兩組 target headers 的 SHA-256。執行時重新讀取並重算，token stale 或存在 unresolved wage rows 時，在建立備份或寫入前拒絕。已符合 target schema 時回傳 `writesPerformed:false`。真正寫入前先備份 `03_hour_settings` 與 `05_calendar_rows`，之後只改這兩張表；post-verify 必須確認 Calendar row count/IDs/source IDs、全部有效時薪、既有正值時薪、Hour Setting row count、Salary 與其餘資料表均保持不變。備份完成後的任何失敗都要嘗試還原兩張表，並以 migration failure 與 rollback failure 的不同錯誤碼回報。

此變更只提供安全閘門與合約；沒有執行 plan、migration、Sheet round-trip，沒有修改 Script Properties 或 deployment。受控匿名測試完成後，操作人員必須立即把 migration approval property 重設為 `disabled`，且所有證據與 log 均不得包含 Spreadsheet ID。
