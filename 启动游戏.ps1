$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$appPath = Join-Path $projectRoot "app"
Set-Location -LiteralPath $appPath

if (-not (Test-Path -LiteralPath (Join-Path $appPath "node_modules"))) {
    npm install
}

npm run dev -- --open
