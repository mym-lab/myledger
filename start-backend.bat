@echo off
title MyLedger Backend (port 5000)
echo.
echo  ==============================
echo   MyLedger Backend - Starting
echo  ==============================
echo.
cd /d "%~dp0backend"
if not exist node_modules (
  echo  Installing dependencies...
  npm install
  echo.
)
echo  Backend running at http://localhost:5000
echo  Press Ctrl+C to stop.
echo.
if exist .env goto with_env
node app.js
goto done
:with_env
node --env-file=.env app.js
:done
pause
