@echo off
:: ─────────────────────────────────────────────────────────────────
:: MyLedger — Backup source code to Google Drive (H:)
:: Run this any time you want a local backup copy.
:: Skips node_modules (large, not needed — npm install regenerates it).
:: ─────────────────────────────────────────────────────────────────

set SOURCE=C:\Users\Kurt\Desktop\MyLedger\v10-clean
set DEST=H:\MyLedger-Backup

echo.
echo ╔══════════════════════════════════════════╗
echo ║   MyLedger — Backup to Google Drive H:  ║
echo ╚══════════════════════════════════════════╝
echo.

:: Check Google Drive is mounted
if not exist "H:\" (
  echo ❌  Drive H: not found. Make sure Google Drive is running.
  echo     Open Google Drive app and try again.
  pause
  exit /b 1
)

echo ✅  Drive H: found. Starting backup...
echo     From : %SOURCE%
echo     To   : %DEST%
echo.

:: Sync files, excluding node_modules and .git (git history already on GitHub)
robocopy "%SOURCE%" "%DEST%" /E /XD node_modules .git /XF *.db /NFL /NDL /NJH /NJS

echo.
echo ✅  Backup complete!
echo     Your code is now saved to H:\MyLedger-Backup
echo.
echo 📌  Remember: run "git push" to also save to GitHub.
echo.
pause
