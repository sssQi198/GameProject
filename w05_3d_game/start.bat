@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "USE_NODE="
where node >nul 2>nul
if not errorlevel 1 (
  for /f "delims=." %%v in ('node -p "process.versions.node" 2^>nul') do (
    if %%v GEQ 18 set "USE_NODE=1"
  )
)

if defined USE_NODE (
  node server.js --open
) else (
  echo Node.js 18 was not found. Starting with Windows PowerShell instead.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Open
)

echo.
echo The game server has stopped.
pause
endlocal
