@echo off
title MyLedger Frontend (port 3000)
echo.
echo  ================================
echo   MyLedger Frontend - Starting
echo  ================================
echo.
cd /d "%~dp0frontend"
if not exist node_modules (
  echo  Installing dependencies...
  npm install
  echo.
)
echo  Frontend running at http://localhost:3000
echo  Press Ctrl+C to stop.
echo.
npm run dev
pause
