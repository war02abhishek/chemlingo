# ChemLingo -- single-command local dev startup
# Usage:  .\start.ps1

$ROOT = $PSScriptRoot

Write-Host "=== ChemLingo Dev Stack ===" -ForegroundColor Cyan

# 1. Infrastructure (Postgres + Redis)
Write-Host "[1/4] Starting Docker infra (Postgres + Redis)..." -ForegroundColor Yellow
Push-Location "$ROOT\infra"
docker compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: docker compose failed. Is Docker Desktop running?" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "      Postgres :5432, Redis :6379 -- OK" -ForegroundColor Green

# 2. Go backend
# Build the command string with $ROOT already expanded so the child shell gets a literal path
Write-Host "[2/4] Starting Go backend on port 8080..." -ForegroundColor Yellow
$backendPath = "$ROOT\backend"
$backendCmd  = "Write-Host 'Go Backend' -ForegroundColor Cyan; Set-Location '$backendPath'; go run main.go"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

# 3. Python AI service
Write-Host "[3/4] Starting Python AI service on port 8000..." -ForegroundColor Yellow
$aiPath = "$ROOT\ai_service"
$aiCmd  = "Write-Host 'AI Service' -ForegroundColor Cyan; Set-Location '$aiPath'; .\.venv\Scripts\Activate.ps1; uvicorn main:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $aiCmd

# 4. Expo / React Native
Write-Host "[4/4] Starting Expo dev server..." -ForegroundColor Yellow
$expoPath = "$ROOT\rn_app"
$expoCmd  = "Write-Host 'Expo' -ForegroundColor Cyan; Set-Location '$expoPath'; npx expo start --web"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $expoCmd

Write-Host ""
Write-Host "All services launched in separate windows." -ForegroundColor Green
Write-Host "  Backend health : http://localhost:8080/health"
Write-Host "  AI service     : http://localhost:8000/health"
Write-Host "  Expo           : scan QR with Expo Go, or press 'a' for Android emulator"
Write-Host ""
Write-Host "To stop: run 'docker compose down' in infra/ and close the three terminal windows." -ForegroundColor DarkGray
