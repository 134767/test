# PTB_2 工讀金 1.6.0

目前 source build 為 `1.6.0-batch-search-style-hotfix-10`。GAS runtime 使用 collection replace mutation engine；同一 collection 以 250ms debounce 合併，Server 回傳完整 authoritative collection，失敗時前端回復最近一次 confirmed snapshot。

本 build 的時薪 source of truth 是 `05_calendar_rows.hourlyWage`：工時設定不含時薪，新增日曆作息區間時輸入的時薪會逐列快照。實際薪資金額維持人工輸入，未來預估則使用 forecast interval 時薪。正式 Sheet migration、真實 Sheet round-trip 與 production deployment 尚未執行。

Schema migration 的唯讀 plan 現在會驗證每筆 Calendar row 的 source Hour Setting 關聯，包括 source ID、academic year、unit code 與 schedule type。正值 Calendar wage 或已符合 target schema 都不能繞過 blocker；migration 只拒絕錯配，不會自動改寫歷史來源關係，且 post-verify 會再次執行同一 gate。目前匿名候選 XLSX 因 19 筆 unit code mismatch 維持 `REJECTED`；Google sandbox、migration 與 real Sheet round-trip 仍為 `NOT_RUN`。

- `local.html`：localhost-only localStorage / CSV seed 開發模式。
- GAS `/exec`：Google Sheet 模式，禁止 business collection localStorage mirror 與 local fallback。
- GitHub Pages `/`：靜態 public-root guard，不啟動業務 runtime。

本 commit 未執行 migration、未寫入正式 Sheet、未建立或更新 production deployment。GAS deployment version 8 不包含本輪程式，直到另行部署。真實 Sheet round-trip 未執行前，不得宣稱 CRUD 正式驗收通過。

測試：`node --test tests/*.test.mjs`
