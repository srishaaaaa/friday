$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'backend'
$Desktop = Join-Path $Root 'apps\desktop'
$VenvPy = Join-Path $Backend '.venv\Scripts\python.exe'

function Require($cmd, $hint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "Missing prerequisite '$cmd'. $hint" }
}
function Run($exe, [string[]]$arguments, $cwd) {
  Push-Location $cwd
  try { & $exe @arguments; if ($LASTEXITCODE -ne 0) { throw "'$exe $($arguments -join ' ')' failed with exit code $LASTEXITCODE" } }
  finally { Pop-Location }
}
function Ensure-Venv {
  Require 'python' 'Install Python 3.11+ from python.org.'
  if (-not (Test-Path $VenvPy)) { Run 'python' @('-m', 'venv', '.venv') $Backend }
}
