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
- **改了 data.js 的動物數值，Excel 也要跟著改**，不然下次跑 xlsx2sheet.py 會把 Excel 裡的舊數字蓋回去。2026-10-25 已把兩個 Excel（遊戲數據.xlsx、遊戲數據_v0.13.xlsx）的數值與技能說明對齊到 v0.13.21，舊檔備份成 .bak-20261025。data2xlsx.py 需要 node 和 openpyxl，這台電腦都沒有。
- 平衡報告（真人對局統計）：https://zoochess.willy110611.workers.dev/report

## 在 Claude Code（使用者電腦）上工作
- 這個資料夾就是 repo，改完照上面流程測試後，直接 `git add -A && git commit && git push`，不用再寫 上傳.flag。
- 版本號：`source/src/ui.js` 的 `dataset.v` 與 `sw.js` 的 CACHE 要一致；伺服器版本由 build.py 自動帶入。
- 上線確認：`https://willy110611-collab.github.io/animal-chess/sw.js` 與 `https://zoochess.willy110611.workers.dev/api/ping` 都顯示新版本號。
- 平衡模擬：`node test/trait_sim.js 40`（羈絆）、`node test/td_sim.js 10`（塔防）、`node test/smoke.js`（必跑）。
- 2026-10-25：v0.13.12 上線＝技能規則照聯盟戰棋＋「普通攻擊重做」（models.js 的 ATK_V2、features.js 技能展示的普攻模式、units3d.js）。v0.13.14 技能動作重做第一批（models.js 的 SKILL_V2：企鵝、河馬、犀牛、臭鼬、大猩猩；units3d.js 的 AIR_CFG 一起調低）；v0.13.15 第二批：斑馬、長頸鹿、鯊魚、變色龍、蜜蜂；v0.13.16 第三批：電鰻、鸚鵡、小鹿、紅鶴、蝙蝠、松鼠；v0.13.17 第四批：野狼、青蛙、小熊貓、無尾熊、獵豹、狐狸；v0.13.18 第五批：章魚、貓頭鷹、大象、獅子、老鷹、孔雀；v0.13.19 第六批：鯨魚、科摩多、刺蝟、鱷魚、熊貓＝33 隻全部重做完。v0.13.35 修正 v0.13.34：eggs.js 不小心定義了同名 mergeStatic 蓋掉 scene3d.js 的版本（會把棋盤格、會動的場景物件合併掉），已刪除改用原本的；**所有檔案打包在同一個範圍，build.py 會檢查函式／變數名稱重複，重複就不打包**。南瓜裝飾一樣合併成 3 次繪製；v0.13.33 效能：主要球體 22×16→18×13（三角形少約 30%）、太小的部位不描邊（MODEL_CFG.OUTLINE_MIN_R）；v0.13.32 除錯：index.html?zoodebug 時有 window.__zdbg.step(n) 手動跑幀、__zdbg.shot() 截遊戲畫面（視窗沒開也能看實際戰鬥畫面）；v0.13.31 待機偶爾左右張望（models.js poseRig）；v0.13.30 小鹿長頸鹿立體長臉、大象淺色腳趾甲（頭像 p6）；v0.13.29 頭像快取版本 p5（模型外觀改了要把 ui.js 的 PORT_VER 加一，不然玩家看到舊頭像）；v0.13.28 章魚吸盤、鯊魚鰓裂、科摩多背刺改沿背弧線；v0.13.27 青蛙斑點與眼睛反光、鱷魚黃眼直瞳＋尾巴鱗脊、斑馬黑白鬃毛與立體馬嘴、變色龍斑點；v0.13.26 逐隻細修：野狼狐狸立體吻部（snout）、大猩猩臉與眼睛（bigEyes）、科摩多黃眼＋背刺＋鱗斑、鯨魚微笑、鸚鵡彎喙、長頸鹿獵豹斑點貼表面（surfSpots）、蓬鬆尾巴補間；v0.13.25 共用身體加腳趾、鼻頭反光、臉頰蓬毛（plush，約 20 隻受惠，不增加繪製次數）；v0.13.24 角色精緻化第一步（models.js 的 MODEL_CFG：角色專用明亮色階、邊緣光、描邊、眼睛第二顆反光；描邊在自動畫質降到 OUTLINE_MIN_Q 以下時自動關掉）。模型總覽截圖工具：source/dist/gallery.html（.claude/launch.json 的 shots 伺服器 8766，可 POST 截圖到 scratchpad，視窗沒開也能看模型）；v0.13.23 多段技能每一下都有特效（SKILL_V2 的 beats＋beatFx，特效在 units3d.js 的 beatImpact/beatPound/beatSlam/beatDust）；v0.13.22 鎖能量時能量條變灰色斜紋（template.html .hb-mp.lock）；v0.13.20 技能說明顯示各星級數值（ui.js 的 skillDesc，150/225/438，目前星級加粗）。之後要改某隻：預覽頁 source/dist/make_preview.py（skill_v2_preview.js 寫 SKILL_NEXT），進遊戲用 source/dist/integrate.py，上線用 source/dist/release.sh（三個都在 dist，不進 repo）。
- **v0.14.0 雙人默契（2v2 招牌機制，只有一隊兩人時生效，1對1／單人不受影響）**：數值在 data.js 的 `DUO_CFG`。① 連攜：開場緊鄰隊友棋子的兩隻配成一組（engine.js findLinks），攻速 +10%，一隻倒下另一隻報仇（攻擊 +30%、回 15%）；腳下一塊金色橢圓光圈（units3d.js s3Links／LINK_FX，準備階段也預覽，ui.js prepLinkPairs）；電腦擺位會主動站到隊友旁（game.js AI_CFG.LINK_PULL）。② 擊掌合擊：隊友下戰鬥指令後 3 秒內也下 → 全隊攻速攻擊 +20%（engine.js battleCommand），電腦隊友 1 秒後跟上你的指令，電腦隊兩人也會互相配合。檢查工具：source/dist/duo_check.js。
- 專案文件（claude.ai 專案「遊戲」）：完成與待辦清單、音樂音效與羈絆改版企劃、塔防模式企劃。
- v0.13.21 平衡：蝙蝠攻擊 56＋技能 210、電鰻能量 70＋技能 280、企鵝技能 180、長頸鹿生命 900＋技能 180、科摩多生命 1360 攻擊 94 毒傷每秒 5%。
- v0.13.13 平衡：野狼攻擊 62、青蛙生命 600 能量 60、蝙蝠生命 540、變色龍生命 720、河馬能量 100、科摩多技能回血 15%。
- v0.13.12 技能規則照聯盟戰棋：`engine.js` 的 `SKILL_CFG`（射程內才放、施法與持續型技能鎖能量、受傷回能 1%減傷前＋3%減傷後、物理技能吃攻擊加成、4/5 費 3 星技能倍率、控制秒數隨星級、技能不挑寶箱與隱身敵人）。技能比較：`node test/skill_sim.js 600`（加第二個參數可指定舊 engine 檔比較）。
- 這台電腦沒裝 node：測試用瀏覽器跑。`source/dist/run.html`＋`nodeshim.js`（不進 repo）模擬 node 的 require/fs/vm；`.claude/launch.json` 的 static（`py -m http.server 8765`）開起來後到 `http://localhost:8765/source/dist/run.html` 呼叫 `runTest('test/smoke.js')`。`source/node_modules/three` 是從舊 index.html 抽出來的 three.js（給 build.py 用）。

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
