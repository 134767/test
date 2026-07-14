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
gas_localStorage_policy: forbidden for business collections
asset_version: 1.6.0-mutation-hotfix-1
deployment_status: NOT_DEPLOYED
real_roundtrip_status: NOT_RUN
known_limits:
  - Google Sheets is not a database transaction; batch replace validates every candidate before the first write.
  - scheduleTypes and holidayNames remain on their explicit legacy endpoints and are not in the replace whitelist.
  - Unknown Sheet headers cause an explicit UNSUPPORTED_EXTRA_HEADERS rejection to avoid erasing unknown data.
```

前端每個 collection 保存 confirmed rows、generation、timer、in-flight request 與 waiters。同 collection 250ms 內的 mutation 共用一次 request；飛行期間的新 generation 保留 optimistic cache，舊 response 只更新 confirmed baseline。Server failure 會還原 confirmed snapshot，且 GAS 模式不呼叫 `_saveLocal()`。

GAS `runServerFunction()` 建立唯一 request context。Write action 先讀設定與檢查 `PTB_WRITE_MODE`，只取得一次 Script Lock，再 lazy-open Spreadsheet。`replaceCollectionsBatch` 會先正規化並驗證所有 candidate collections，全部通過後才逐 collection bulk `setValues()`。

既有 single-record GAS actions 僅保留相容性並標記 deprecated；主要 UI business mutations 不再依賴它們。`scheduleTypes` 與 `holidayNames` 維持既有明確 endpoint，未擴大 collection-replace 權限。

Salary 的 `actualAmount` 是使用者直接輸入的實際金額，Server 只驗證 finite non-negative，不以 `actualHours * hourlyWage` 覆寫。`inspectSalaryEntryDuplicates` / `inspectSalaryEntryDuplicateKeys` 只讀取並回報重複鍵，不自動修正資料。

部署測試環境時設定 `PTB_STATIC_ASSET_VERSION=1.6.0-mutation-hotfix-1`。真實 harness 另需匿名測試 Sheet 副本與 `PTB_TEST_MODE=enabled`。

本 commit 未執行 migration。本 commit 未寫入正式 Sheet。本 commit 未建立或更新 production deployment。GAS deployment version 8 不包含本輪程式，直到另行部署。真實 Sheet round-trip 未執行前，不得宣稱 CRUD 正式驗收通過。
