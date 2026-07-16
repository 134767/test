# PTB 1.6.0 Data Performance Instrumentation

```yaml
task_id: PTB-1.6.0-DATA-PERFORMANCE-INSTRUMENTATION
asset_version: 1.6.0-data-performance-instrumentation-1
behavior_change: none
sheet_schema_change: none
sheet_write_during_development: none
```

本階段只加入效能證據，不更動 CRUD、資料 schema、整表 replace、驗證或鎖的既有行為。目的在正式 GAS 測試環境中量測「載入慢」與「單筆寫入慢」的實際時間分布，再決定增量寫入與範圍載入的優先順序。

## 瀏覽器紀錄

開啟瀏覽器開發者工具 Console，可看到：

```text
[PTB Performance]
```

最近 200 筆紀錄保存在：

```js
window.PTB_PERFORMANCE_LOG
```

唯讀取得副本：

```js
getPtbPerformanceLog()
```

清除紀錄：

```js
clearPtbPerformanceLog()
```

瀏覽器紀錄分為：

- `instrumentation`：探針安裝狀態。
- `gas-request`：單次 `google.script.run` 往返，包含 action、總往返時間、request bytes、response bytes、GAS 回傳的 server timing。
- `db-operation`：使用者看到「資料載入中／同步中」到解除操作的總時間，包含 debounce、前端排隊與 GAS 往返。

若 GAS runtime 不允許替換 `google.script.run`，`gasRequest` 會是 `false`，但 `db-operation` 計時仍會運作，不影響系統功能。

## GAS 回傳 performance

所有 `runServerFunction` 回應會新增頂層 `performance`，不改動原本 `ok`、`result`、`data` 或錯誤欄位。

```yaml
performance:
  action: replaceCollection
  totalMs: 0
  requestPayloadChars: 0
  timings:
    spreadsheetOpenMs: 0
    headerReadMs: 0
    sheetReadMs: 0
    sheetWriteMs: 0
    lockWaitMs: 0
    lockHoldMs: 0
  tableTimings:
    read: {}
    write: {}
  rowCounts:
    read: {}
    write: {}
  cacheHits:
    collections: 0
    headers: 0
    sheets: 0
    spreadsheet: 0
  responsePayloadChars: 0
```

## 建議正式測試案例

每個案例先執行 `clearPtbPerformanceLog()`，完成操作後執行 `getPtbPerformanceLog()`，保存 Console 輸出即可。紀錄不得包含 Spreadsheet ID 或個資。

1. 系統首次載入。
2. 新增一筆單位。
3. 編輯一筆預算。
4. 新增一筆時數設定。
5. 新增一小段作息區間。
6. 新增一整年度、多單位作息區間。
7. 修改一筆時薪登記。
8. 連續快速修改同一 collection 兩次。

## 判讀方式

- `db-operation.durationMs - gas-request.durationMs` 很大：前端 debounce、排隊或前一個 in-flight request 是主要問題。
- `lockWaitMs` 很大：多人或重疊請求被全域 Script Lock 阻塞。
- `sheetReadMs` 很大：完整 bootstrap 或每次 mutation 讀取過多 Sheet。
- `validationMs` 很大：每次 mutation 的全資料庫驗證是主要問題。
- `sheetWriteMs` 很大：整張 Sheet replace 是主要問題。
- request／response bytes 很大：完整 collection 上傳與 authoritative 全量回傳造成網路與序列化成本。

## 後續決策

完成一輪正式量測後，依證據進入：

```yaml
phase_2:
  task: PTB-1.6.0-DELTA-MUTATION-ENGINE
  target:
    - single-row create/update/delete
    - scoped batch append/delete
    - compact authoritative delta response
    - record or collection revision conflict check
    - operation-specific server validation
phase_3:
  task: PTB-1.6.0-LAZY-SCOPED-LOADING
  target:
    - small master bootstrap
    - calendar query by budget and date scope
    - salary query by budget and month scope
```
