@echo off
title MyLedger - Setup
echo.
echo  ============================================
echo   MyLedger Setup (node:sqlite - no install!)
echo  ============================================
echo.
echo  SQLite is built into Node 22.5+ / Node 24.
echo  No npm install needed for the database layer.
echo.

cd /d "%~dp0backend"

echo  [1/3] Installing npm dependencies...
call npm install
if %errorlevel% neq 0 (
  echo.
  echo  ERROR: npm install failed.
  echo  Try: npm cache clean --force  then re-run this script.
  pause
  exit /b 1
)
echo  Done.
echo.

echo  [2/3] Checking for existing data to migrate...
if exist myledger.json (
  echo  Found myledger.json — migrating data to SQLite...
  node migrate-from-lowdb.js
  if %errorlevel% neq 0 (
    echo  WARNING: Migration reported errors — check output above.
    echo  You can re-run: node migrate-from-lowdb.js
  ) else (
    echo  Migration complete! myledger.db created.
    echo  TIP: Keep myledger.json as a backup — it is no longer read.
  )
) else (
  echo  No myledger.json found — starting fresh (new empty database).
  echo  A new myledger.db will be created on first server start.
)
echo.

echo  [3/3] Quick startup test...
node -e "import('./db.js').then(() => { console.log('  Database OK'); process.exit(0); }).catch(e => { console.error('  DB ERROR:', e.message); process.exit(1); })"
if %errorlevel% neq 0 (
  echo.
  echo  ERROR: Database failed to initialize.
  echo  Ensure you are running Node 22.5 or later (you have Node 24, so this should work).
  pause
  exit /b 1
)
echo.

echo  ============================================
echo   Setup complete!
echo  ============================================
echo.
echo  To start the server:
echo    start-backend.bat
echo.
echo  Health check after start:
echo    http://localhost:5000/api/health
echo.
pause
