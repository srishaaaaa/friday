. "$PSScriptRoot\_common.ps1"
Require 'node' 'Install Node.js 20+ from nodejs.org.'
Require 'npm' 'Install Node.js 20+ from nodejs.org.'
Ensure-Venv
Run $VenvPy @('-m', 'pip', 'install', '--upgrade', 'pip') $Backend
Run $VenvPy @('-m', 'pip', 'install', '-e', '.[dev]') $Backend
Run 'npm' @('install') $Desktop
Write-Host 'Setup complete. Run: npm run dev' -ForegroundColor Green
