# PTB_2 工讀金 1.6.0

目前 source build 為 `1.6.0-mutation-hotfix-1`。GAS runtime 使用 collection replace mutation engine；同一 collection 以 250ms debounce 合併，Server 回傳完整 authoritative collection，失敗時前端回復最近一次 confirmed snapshot。

- `local.html`：localhost-only localStorage / CSV seed 開發模式。
- GAS `/exec`：Google Sheet 模式，禁止 business collection localStorage mirror 與 local fallback。
- GitHub Pages `/`：靜態 public-root guard，不啟動業務 runtime。

本 commit 未執行 migration、未寫入正式 Sheet、未建立或更新 production deployment。GAS deployment version 8 不包含本輪程式，直到另行部署。真實 Sheet round-trip 未執行前，不得宣稱 CRUD 正式驗收通過。

測試：`node --test tests/*.test.mjs`
