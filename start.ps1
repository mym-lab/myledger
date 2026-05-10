# ============================================================
# MyLedger v10-clean - Start Script
# Launches backend (port 5000) + frontend (port 3000)
# Usage: .\start.ps1
# ============================================================

$root = $PSScriptRoot

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  MyLedger v10-clean - Starting" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Verify node_modules exist
if (-not (Test-Path "$root\backend\node_modules")) {
    Write-Host "[ERROR] Backend node_modules missing. Run .\setup.ps1 first." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path "$root\frontend\node_modules")) {
    Write-Host "[ERROR] Frontend node_modules missing. Run .\setup.ps1 first." -ForegroundColor Red
    exit 1
}

Write-Host "  Starting backend  → http://localhost:5000" -ForegroundColor Green
Write-Host "  Starting frontend → http://localhost:3000" -ForegroundColor Green
Write-Host "  Admin dashboard   → http://localhost:3000/admin" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Close this window or press Ctrl+C to stop both servers." -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Launch backend in a new PowerShell window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'MyLedger Backend' -ForegroundColor Cyan; Set-Location '$root\backend'; npm start"

# Small delay so backend starts first
Start-Sleep -Seconds 2

# Launch frontend in a new PowerShell window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'MyLedger Frontend' -ForegroundColor Green; Set-Location '$root\frontend'; npm run dev"

Write-Host "Both servers launched in separate windows." -ForegroundColor Green
Write-Host "Open http://localhost:3000 in your browser." -ForegroundColor Yellow
Write-Host ""
