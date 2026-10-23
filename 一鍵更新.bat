@echo off
chcp 65001 >nul
title 動物戰棋 一鍵更新
cd /d "%~dp0"

rem ===== 動物戰棋 一鍵更新 =====
rem 做的事：收集這個資料夾的變更 → 先拿 GitHub 上最新的合併 → 上傳 → 等網站和伺服器都換成新版才說完成
rem 可調：WAIT_MAX（最多等幾次，每次 10 秒）
set "WAIT_MAX=24"
set "SITE=https://willy110611-collab.github.io/animal-chess/sw.js"
set "SERVER=https://zoochess.willy110611.workers.dev/api/ping"

rem ---- 找 git：先找系統安裝的，再找 GitHub Desktop 內建的 ----
set "GIT=git"
where git >nul 2>nul
if errorlevel 1 (
  set "GIT="
  for /d %%D in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do (
    if exist "%%D\resources\app\git\cmd\git.exe" set "GIT=%%D\resources\app\git\cmd\git.exe"
  )
)
if "%GIT%"=="" (
  echo [錯誤] 找不到 git。請安裝 Git for Windows：https://git-scm.com/download/win
  pause
  exit /b 1
)

rem ---- 這次的版本號（從 sw.js 讀）----
set "VER="
for /f "tokens=2 delims='" %%v in ('findstr /c:"const CACHE" sw.js') do set "VER=%%v"
set "VNUM=%VER:zoo-v=%"

echo.
echo ===== 動物戰棋 一鍵更新（%VER%）=====
echo.

echo [1/4] 收集變更...
"%GIT%" add -A
"%GIT%" diff --cached --quiet
if errorlevel 1 (
  for /f "tokens=1-3 delims=/ " %%a in ("%date%") do set "D=%%a-%%b-%%c"
  "%GIT%" commit -q -m "更新 %VNUM% %D% %time:~0,5%"
  if errorlevel 1 ( echo [錯誤] Commit 失敗。 & pause & exit /b 1 )
) else (
  echo     沒有新的檔案變更，檢查是否有還沒上傳的版本...
)

echo [2/4] 先合併 GitHub 上最新的內容...
"%GIT%" pull -q --rebase origin main
if errorlevel 1 (
  "%GIT%" rebase --abort >nul 2>nul
  echo [錯誤] 和 GitHub 上的版本衝突，已還原，沒有上傳任何東西。請把這個畫面截圖給 Claude。
  pause
  exit /b 1
)

echo [3/4] 上傳到 GitHub...
"%GIT%" push -q origin main
if errorlevel 1 (
  echo.
  echo [錯誤] 上傳失敗。第一次使用可能需要登入 GitHub：
  echo   1. 安裝 Git for Windows：https://git-scm.com/download/win （安裝時全部按下一步）
  echo   2. 重新執行這個檔案，跳出瀏覽器時登入 GitHub 一次即可
  echo 或者改用 GitHub Desktop 按 Push origin。
  pause
  exit /b 1
)

echo [4/4] 等網站與伺服器換成 %VNUM%（通常 1～2 分鐘）...
set /a N=0
set "SITE_OK="
set "SRV_OK="
:wait
set /a N+=1
if not defined SITE_OK (
  curl -s "%SITE%?t=%random%%random%" | findstr /c:"%VER%" >nul && ( set "SITE_OK=1" & echo     網站已是新版 )
)
if not defined SRV_OK (
  curl -s "%SERVER%?t=%random%" | findstr /c:"%VNUM%" >nul && ( set "SRV_OK=1" & echo     伺服器已是新版 )
)
if defined SITE_OK if defined SRV_OK goto done
if %N% geq %WAIT_MAX% goto slow
timeout /t 10 /nobreak >nul
goto wait

:slow
echo.
if not defined SITE_OK echo [注意] 等了 4 分鐘網站還不是新版：到 GitHub 的 Actions 頁看看 Pages 有沒有失敗。
if not defined SRV_OK echo [注意] 等了 4 分鐘伺服器還不是新版：到 Cloudflare 的 zoochess 專案看部署紀錄。
pause
exit /b 1

:done
echo.
echo 完成！大家把遊戲關掉重開就是新版：
echo https://willy110611-collab.github.io/animal-chess/
echo.
pause
