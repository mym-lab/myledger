# ============================================================
# MyLedger v10-clean - Setup Script
# Run once to install all dependencies
# Usage: .\setup.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  MyLedger v10-clean - Setup" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
try {
    $nodeVersion = node -v
    Write-Host "[OK]  Node.js $nodeVersion detected" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Check npm
try {
    $npmVersion = npm -v
    Write-Host "[OK]  npm v$npmVersion detected" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] npm not found. Reinstall Node.js." -ForegroundColor Red
    exit 1
}

Write-Host ""

# Install backend dependencies
Write-Host "[1/2] Installing backend dependencies..." -ForegroundColor Yellow
Set-Location "$root\backend"
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Backend npm install failed." -ForegroundColor Red
    exit 1
}
Write-Host "[OK]  Backend ready" -ForegroundColor Green

Write-Host ""

# Install frontend dependencies
Write-Host "[2/2] Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location "$root\frontend"
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Frontend npm install failed." -ForegroundColor Red
    exit 1
}
Write-Host "[OK]  Frontend ready" -ForegroundColor Green

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Setup complete! Run .\start.ps1 to launch MyLedger." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Set-Location $root
