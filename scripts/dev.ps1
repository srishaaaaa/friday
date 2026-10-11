. "$PSScriptRoot\_common.ps1"
if (-not (Test-Path $VenvPy)) { throw 'Backend venv missing. Run: npm run setup' }
if (-not (Test-Path (Join-Path $Desktop 'node_modules'))) { throw 'Frontend dependencies missing. Run: npm run setup' }
$env:FRIDAY_PYTHON = $VenvPy   # Electron starts (and later stops) the backend itself
Run 'npm' @('run', 'dev') $Desktop
