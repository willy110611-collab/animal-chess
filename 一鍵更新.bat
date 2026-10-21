@echo off
chcp 65001 >nul
title 動物戰棋 一鍵更新
cd /d "%~dp0"

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

echo.
echo ===== 動物戰棋 一鍵更新 =====
echo.

"%GIT%" add -A
"%GIT%" diff --cached --quiet
if not errorlevel 1 (
  echo 沒有新的變更，不需要更新。
  pause
  exit /b 0
)

for /f "tokens=1-3 delims=/ " %%a in ("%date%") do set "D=%%a-%%b-%%c"
"%GIT%" commit -m "更新 %D% %time:~0,5%"
if errorlevel 1 (
  echo [錯誤] Commit 失敗。
  pause
  exit /b 1
)

echo.
echo 正在上傳到 GitHub...
"%GIT%" push origin main
if errorlevel 1 (
  echo.
  echo [錯誤] 上傳失敗。第一次使用可能需要登入 GitHub：
  echo   1. 安裝 Git for Windows：https://git-scm.com/download/win （安裝時全部按下一步）
  echo   2. 重新執行這個檔案，跳出瀏覽器時登入 GitHub 一次即可
  echo 或者改用 GitHub Desktop 按 Push origin。
  pause
  exit /b 1
)

echo.
echo 完成！約 1～2 分鐘後網址會變成新版：
echo https://willy110611-collab.github.io/animal-chess/
echo.
pause
