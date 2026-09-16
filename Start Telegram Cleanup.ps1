$root = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $root 'scripts\start.ps1')
