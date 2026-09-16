$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
    throw 'Run .\scripts\setup.ps1 first.'
}
& $python (Join-Path $PSScriptRoot 'login.py')
