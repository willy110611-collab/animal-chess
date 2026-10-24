# 動物戰棋（animal-chess）給 Claude 的工作說明

2v2／單人的動物自走棋（類似聯盟戰棋）。網站：https://willy110611-collab.github.io/animal-chess/

## 檔案結構
- `source/`：**原始碼，改這裡**。
  - `src/`：遊戲程式（data 數值、engine 戰鬥、game 流程與電腦 AI、ui／features／net／account 介面與連線、scene3d／units3d 3D 畫面、template.html 版面）。
  - `src/sheet.js`：由 Excel 產生的數值覆蓋，**不要手改**（用 tools/xlsx2sheet.py 產生）。
  - `server/server.js`：Cloudflare 伺服器（帳號、天梯、房間、配對、電腦模仿陣容）。
  - `tools/`：Excel ↔ 數值（data2xlsx.py 匯出、xlsx2sheet.py 匯入）。
  - `test/smoke.js`：自動測試（電腦對打 2v2／1對1／8 人單人，確認能跑完）。
  - `build.py`：打包。
- 根目錄 `index.html`、`server/worker.js`：**打包產物，不要手改**，由 build.py 產生。
- 根目錄 `sw.js`：離線快取，`CACHE = 'zoo-vX.Y.Z'`，每次上線版本號要跟 `source/src/ui.js` 的 `dataset.v` 一致。

## 改完的流程（每次都要做）
1. `cd source && npm install`（第一次）
2. `node test/smoke.js` 必須「全部通過」。平衡改動另跑 `node test/game.js`、`node test/g8.js` 比較前後。
3. 版本號 +1：`source/src/ui.js` 的 `dataset.v` 與根目錄 `sw.js` 的 CACHE。
4. `python3 build.py` → 產生根目錄 index.html 與 server/worker.js。
5. 用無頭瀏覽器開根目錄 index.html，確認沒有 JS 錯誤（smoke.js 只測遊戲邏輯，抓不到介面檔的語法錯），並截圖檢查桌機與 400px 手機版面（注意 three.js 已內嵌，不用網路）。
   - **一定要檢查 iPhone 動態島**：模擬 393×852、上方安全區 59px、下方 34px（把 #game 的 padding-top 設 59px），倒數計時與上方血條不能被擋、下方「準備好了」不能被切掉、遊戲畫面不能上下捲動。
6. commit 原始碼＋產物，**直接推到 main**。推上去後 GitHub Pages 約 1～2 分鐘更新網站；Cloudflare 會自動部署 `server/`（專案 zoochess）。

## Excel 數值流程
- 使用者改「遊戲數據.xlsx」→ `python3 tools/xlsx2sheet.py 遊戲數據.xlsx` 產生 src/sheet.js → **再跑 `python3 tools/simsheet.py 遊戲數據.xlsx`** 把模擬結果寫進「模擬結果」分頁，連同上線一起交回給使用者。
- 平衡報告（真人對局統計）：https://zoochess.willy110611.workers.dev/report

## 上線方式（Cowork 專案的雲端 session 不能直接推 GitHub）
- 用 device_commit_files 把改到的檔案寫進使用者電腦的 animal-chess，最後另外寫入 `D:\##Claude##\Games\動物戰棋\自動上傳\上傳.flag`（內容＝commit 說明），使用者電腦上的自動上傳程式會推上去。細節見專案文件「自動上傳說明」。

## 使用者偏好（必守）
- 回覆用繁體中文，先講結論；每次說明：改了什麼、副作用、使用者可調的參數在哪。
- **新規則／新功能先給預覽**（用最少用量呈現預計的畫面），使用者確認後才做。一次只做被要求的事。
- 玩家介面要乾淨：不放「測試服」、版本號、給管理者的說明文字。
- 登入入口一定要保留（開場登入框、大廳右上「登入」、設定裡「登入／註冊」）。
- 不要建立帳號、不要輸入密碼。
- 新增存檔欄位一律給預設值，舊存檔不能壞。

## 重要參數位置
- 遊戲數值：`src/data.js` 的 CFG（或請使用者改 Excel 後跑 tools/xlsx2sheet.py）。
- 電腦 AI：`src/game.js` 的 `AI_CFG`、模仿玩家陣容 `META_CFG`。
- 伺服器：`server/server.js` 的 `SV`（註冊限制、天梯分數 `SV.LADDER`、陣容紀錄 `SV.META`）。
- 連線：`src/account.js` 的 `SRV_CFG`、網速顯示 `NETQ`；`src/net.js` 的 `NET_CFG`。
