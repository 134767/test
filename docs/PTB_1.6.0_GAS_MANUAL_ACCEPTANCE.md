# PTB 1.6.0 GAS 人工驗收

正式操作入口僅為 GAS Web App `/exec`。GitHub Pages `/` 是不啟動 App 的靜態說明頁；localhost `/local.html` 才是 localStorage 開發入口。GitHub Pages 不保存業務資料，正式資料僅由 GAS backend 讀寫 Google Sheet。

`localhost/local.html → localStorage（開發測試）`

`GAS /exec → GitHub Pages JS/CSS → google.script.run → GAS → Sheet DB`

`GitHub Pages / → 靜態說明頁，不啟動 App`

1. 建立正式 Sheet 的測試複本並另建備份；確認全程未使用正式 Sheet。
2. 在正確 Apps Script 專案設定 `PTB_SPREADSHEET_ID`（匿名測試 Sheet 複本）、`PTB_GITHUB_PAGES_BASE_URL`、`PTB_APP_VERSION=1.6.0`、`PTB_STATIC_ASSET_VERSION=1.6.0-calendar-wage-hotfix-1`、`PTB_WRITE_MODE=enabled`、`PTB_TEST_MODE=enabled`；不得把 ID 寫入 source 或 log。
3. 執行 `inspectPtb160Schema` 並保存報告；若 `03_hour_settings` 仍含 `hourlyWage`，確認報告為 `migrationRequired: true` 且 deprecated column 為 `hourlyWage`。
4. 本次 source handoff 不執行 migration。另行核准後，只能在匿名測試 Sheet 複本執行 `migratePtb160Schema`；plan 必須先確認 Calendar source ID 存在且唯一，並與來源 Hour Setting 的 academic year、unit code、schedule type 一致。已有正時薪也不得略過此 gate；任何 blocker 都必須在 no-op return、備份及寫入前拒絕，且不得自動修復來源關係。通過後才確認已建立 `03_hour_settings`、`05_calendar_rows` 隱藏備份，所有 calendar rows 均有正時薪，且再次 inspect/verify 通過。不得對正式 Sheet 執行。
5. 確認 Pages 根頁只顯示靜態說明、`/local.html` 在公開 host 顯示 localhost-only 警告，且 CSS/JS asset HTTP 200；部署僅授權帳號可用的測試 GAS Web App。
6. 開啟 `/exec`，驗證 bootstrap 十表、版本、loading、錯誤訊息與無 CSV/localStorage 業務資料 fallback。
7. 驗證 budgets 新增/編輯/重複名稱/單位重疊；驗證時數設定新增、編輯、note、批次新增及部分成功摘要。
8. 驗證行事曆初始空白、明確查詢、新增作息、跨年度群組範圍刪除及不影響其他群組；新增區間必須輸入大於 0 的時薪，日期不得超出所選學年度。
9. 使用同一時數設定分別建立 2025/08–12（190）與 2026/01–07（200）兩段資料；確認 source ID 相同、舊列維持 190、新列為 200。驗證薪資月份顯示混合時薪、保留使用者輸入的 `actualAmount`（不得以 hours × wage 覆寫），並確認當期/過去逐列計算、未來只使用 forecast interval 時薪。
10. 用未授權帳號確認拒絕；檢查 browser console 與 Apps Script execution log 不含秘密或 stack trace。
11. 驗收失敗時停用測試 deployment、還原備份，記錄輸入、錯誤 code、execution id 與可重現步驟。
12. 快速連點每個儲存/刪除按鈕，確認處理期間按鈕停用且只有一次 Apps Script execution。
13. 模擬 server validation/權限失敗，確認 modal 與輸入保留、按鈕恢復、client 列表沒有新增或刪除。
14. 成功寫入後重新整理 `/exec`，確認資料由 Sheet bootstrap 讀回且 server normalized 金額/名稱/時間戳一致。
15. 確認 hour batch 與 calendar interval batch 各只有一次 Apps Script execution；確認 scoped delete 不影響另一預算群組。
16. 檢查 Apps Script log 沒有重複 write call，且錯誤與 browser console 不含 Spreadsheet ID 或 stack trace。

17. 依序執行 `gas/90_TestHarness.gs` 的 create/update/delete、salary duplicate 與 batch harness；保存 Apps Script execution evidence。未實際執行前狀態必須維持 `real_sheet_roundtrip: NOT_RUN`。

本 commit 未執行 migration、未寫入正式 Sheet、未建立或更新 production deployment。GAS deployment version 8 不包含本輪程式，直到另行部署。

## Anonymous Sheet schema migration 安全流程（目前未執行）

此流程僅供已核准的匿名測試 Sheet。不得用於正式 Sheet，也不得在 source handoff、browser gate 或一般驗收期間執行。

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

Phase 1 的 plan 必須先人工確認兩張來源表的 headers/row counts、待補值與 unresolved 數量、既有正值時薪保留數、Calendar source integrity，以及 SHA-256 `planToken`。若有 unresolved rows 或 source issue，不得進入 Phase 2；issue 只可保存 row number、source Hour Setting ID 與 reason。Phase 2 只接受同一份目前資料計算出的 token；資料有任何變動都必須重新產生 plan。執行前會先拒絕所有 blocker，確認 schema no-op 也不能繞過，再建立兩張帶 timestamp 與 UUID suffix 的隱藏備份。寫入後會重新檢查 source integrity，並驗證 schema、row IDs、source IDs、全部有效時薪、既有正值時薪、Salary 與其餘資料表不變；失敗時自動還原兩張表。

目前匿名候選 XLSX 的本機唯讀 regression 有 19 筆 `source_unit_code_mismatch`，維持 `REJECTED`。Google sandbox、migration、real Sheet round-trip 與 deployment 均為 `NOT_RUN`。

證據不得包含 Spreadsheet ID。受控測試完成並保存不含敏感資訊的證據後，應立即將 `PTB_SCHEMA_MIGRATION_APPROVAL` 重設為 `disabled`。本文件只描述流程，未修改任何 Script Properties，亦未執行 plan、migration、verify、Sheet round-trip 或 deployment。
