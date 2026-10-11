. "$PSScriptRoot\_common.ps1"
if (-not (Test-Path $VenvPy)) { throw 'Backend venv missing. Run: npm run setup' }
Run $VenvPy @('-m', 'pytest', '-q') $Backend
Run 'npm' @('run', 'typecheck') $Desktop
Run 'npm' @('test') $Desktop
Write-Host 'All tests passed.' -ForegroundColor Green
