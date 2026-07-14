# PTB 1.6.0 GAS 人工驗收

1. 建立正式 Sheet 的測試複本並另建備份；確認全程未使用正式 Sheet。
2. 設定 `PTB_SPREADSHEET_ID`、`PTB_GITHUB_PAGES_BASE_URL`，必要時設定版本與 write mode。
3. 執行 `inspectPtb160Schema`，保存報告；確認 legacy budget group warning。
4. 執行 `migratePtb160Schema`，再執行 `verifyPtb160Schema`；逐表核對新增欄在尾端且資料未被改寫。
5. 設定 GitHub Pages 靜態 asset URL，部署僅授權帳號可用的測試 GAS Web App。
6. 開啟 `/exec`，驗證 bootstrap 十表、版本、loading、錯誤訊息與無 CSV/localStorage 業務資料 fallback。
7. 驗證 budgets 新增/編輯/重複名稱/單位重疊；驗證時數設定新增、編輯、note、批次新增及部分成功摘要。
8. 驗證行事曆初始空白、明確查詢、新增作息、跨年度群組範圍刪除及不影響其他群組。
9. 驗證薪資登記 server 重算、差額與預估群組 scope、評估方案，以及重整後 Sheet 讀回。
10. 用未授權帳號確認拒絕；檢查 browser console 與 Apps Script execution log 不含秘密或 stack trace。
11. 驗收失敗時停用測試 deployment、還原備份，記錄輸入、錯誤 code、execution id 與可重現步驟。
12. 快速連點每個儲存/刪除按鈕，確認處理期間按鈕停用且只有一次 Apps Script execution。
13. 模擬 server validation/權限失敗，確認 modal 與輸入保留、按鈕恢復、client 列表沒有新增或刪除。
14. 成功寫入後重新整理 `/exec`，確認資料由 Sheet bootstrap 讀回且 server normalized 金額/名稱/時間戳一致。
15. 確認 hour batch 與 calendar interval batch 各只有一次 Apps Script execution；確認 scoped delete 不影響另一預算群組。
16. 檢查 Apps Script log 沒有重複 write call，且錯誤與 browser console 不含 Spreadsheet ID 或 stack trace。
