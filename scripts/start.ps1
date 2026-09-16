$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$python = Join-Path $backend '.venv\Scripts\python.exe'

if (-not (Test-Path $python)) {
    throw 'Run .\scripts\setup.ps1 first.'
}

$backendPort = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if (-not $backendPort) {
    Start-Process -FilePath $python -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000') -WorkingDirectory $backend -WindowStyle Hidden
}

$frontendPort = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if (-not $frontendPort) {
    Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev') -WorkingDirectory $frontend -WindowStyle Hidden
}

Start-Process 'http://localhost:5173'
