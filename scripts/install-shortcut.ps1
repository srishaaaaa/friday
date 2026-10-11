. "$PSScriptRoot\_common.ps1"
# Builds the renderer + Electron main, then adds "FRIDAY" to the Start menu and desktop so it launches like an app
# (no terminal, no dev server). Re-run after changing the UI to refresh the built files.
if (-not (Test-Path $VenvPy)) { throw 'Backend venv missing. Run: npm run setup' }
$Electron = Join-Path $Desktop 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $Electron)) { throw 'Electron missing. Run: npm run setup' }
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Run 'npx' @('vite', 'build') $Desktop
Run 'npm' @('run', 'build:electron') $Desktop

$shell = New-Object -ComObject WScript.Shell
$targets = @(
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'FRIDAY.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'FRIDAY.lnk')
)
foreach ($lnk in $targets) {
  $s = $shell.CreateShortcut($lnk)
  $s.TargetPath = $Electron
  $s.Arguments = "`"$Desktop`""
  $s.WorkingDirectory = $Desktop
  $s.IconLocation = (Join-Path $Desktop 'build\icon.ico')
  $s.Description = 'FRIDAY personal AI assistant'
  $s.Save()
  Write-Host "Created $lnk"
}
Write-Host 'Done. Search "FRIDAY" in the Start menu; right-click it to pin to the taskbar.' -ForegroundColor Green
