@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Pocket Town needs Node.js 20.19 or newer to start its local preview.
  echo Install the LTS version from https://nodejs.org/ and open this file again.
  pause
  exit /b 1
)
node scripts\serve.mjs --open
if errorlevel 1 pause
