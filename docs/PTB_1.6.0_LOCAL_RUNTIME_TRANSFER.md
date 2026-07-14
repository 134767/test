# PTB 1.6.0 Local CSV Runtime Transfer

## 專案狀態

- **狀態**：PTB 1.6.0 local CSV Runtime（本地驗收完成、跨電腦轉移用）
- **版本**：`1.6.0`
- **資料模式**：`db/*.csv` 作為首次 seed；CRUD 寫入瀏覽器 `localStorage`
- **ready_to_port_to_gas**：`false`
- **分支性質**：僅供轉移的 checkpoint 分支，**不可直接視為正式 `main`**

## 自動測試基準

- `node --test tests/*.test.mjs`
- 基準結果：**55 passed / 0 failed**

## 本地 Runtime

| 項目 | 值 |
|------|-----|
| Runtime URL | http://127.0.0.1:5500/ |
| 啟動命令 | `python -m http.server 5500 --bind 127.0.0.1` |
| CSV reset | 瀏覽器主控台執行 `reloadWorkStudyCsvDb()` |
| CSV snapshot export | 瀏覽器主控台執行 `exportWorkStudyCsvDb()` |

## 已完成功能

- 預算群組化
- 時數設定備註顯示
- 行事曆來源備註
- 差額與預估預算群組範圍
- 時數設定批次新增
- 時數設定單位 → 實際單位選擇
- 行事曆預算單位明確查詢

## 已知限制

- GAS／Google Sheet 尚未重新驗收
- 未來評估 `budgetName` schema 尚未隔離
- migration fixture 尚未測試
- `ready_to_port_to_gas=false`
- 此分支為轉移用 checkpoint，**禁止直接合併為正式 main 而不經 review**

## 新電腦接手流程

```bash
git clone https://github.com/134767/test.git PTB_2-160-pages-test
cd PTB_2-160-pages-test
git fetch origin
git switch transfer/ptb-1.6.0-local-runtime-stable
node --test tests/*.test.mjs
python -m http.server 5500 --bind 127.0.0.1
```

瀏覽器開啟：http://127.0.0.1:5500/

### 重要警告

- **localStorage 不會跟著 GitHub 轉移。**
- 新電腦第一次啟動會從 `db/*.csv` 建立乾淨資料。
- 舊電腦尚未匯出的 localStorage 人工修改**不會**存在於 Git commit。
- 若要保留目前 localStorage 修改：先在瀏覽器執行 `exportWorkStudyCsvDb()`，再由人工決定是否替換 `db` seed；**不要自動替換 seed。**

## 公開倉庫安全注意

本倉庫為 **public**。以下內容**不得**提交到 Git：

- 任何 `*.xlsx` / `*.xls`（含匿名測試檔）
- 原始工作簿、正式 Google Sheet 匯出
- token、API key、Spreadsheet ID、GAS deployment URL
- 真實學號、職編、姓名、未匿名單位

跨電腦 Runtime seed 已包含於 `db/*.csv`。XLSX 原始資料請使用私人儲存媒介另行轉移。

## 禁止事項

- 勿將 `transfer/ptb-1.6.0-local-runtime-stable` 直接當成正式 `main`
- 勿在未審查前 `merge` / `rebase` 到 `main`
- 勿把本機 XLSX、截圖、venv、node_modules 推上 public remote
