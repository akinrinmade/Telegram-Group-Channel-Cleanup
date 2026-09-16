$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$venv = Join-Path $backend '.venv'
$python = Join-Path $venv 'Scripts\python.exe'

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'Python 3.11 or 3.12 is required. Install it from https://www.python.org/downloads/ and rerun this script.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'Node.js 18 or newer is required. Install it from https://nodejs.org/ and rerun this script.'
}

if (-not (Test-Path $python)) {
    python -m venv $venv
}
& $python -m pip install --upgrade pip
& $python -m pip install -r (Join-Path $backend 'requirements.txt')
Push-Location $frontend
npm install
Pop-Location

$envPath = Join-Path $backend '.env'
if (-not (Test-Path $envPath)) {
    Copy-Item (Join-Path $backend '.env.example') $envPath
}

$existing = Get-Content $envPath -Raw
$apiId = Read-Host 'Telegram API ID (from https://my.telegram.org)'
$apiHash = Read-Host 'Telegram API hash (stored only in backend/.env)'
$session = Read-Host 'Telethon session path or name (default: telegram_cleanup)'
if ([string]::IsNullOrWhiteSpace($session)) { $session = 'telegram_cleanup' }

@(
    "TELEGRAM_API_ID=$apiId"
    "TELEGRAM_API_HASH=$apiHash"
    "TELEGRAM_SESSION=$session"
) | Set-Content $envPath -Encoding utf8

Write-Host ''
Write-Host 'Setup complete.' -ForegroundColor Green
Write-Host 'If the session is not already authenticated, run: .\scripts\login.ps1'
Write-Host 'Then start the app with: .\scripts\start.ps1'
