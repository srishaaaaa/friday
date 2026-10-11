. "$PSScriptRoot\_common.ps1"
if (-not (Test-Path $VenvPy)) { throw 'Backend venv missing. Run: npm run setup' }
Run $VenvPy @('-m', 'pip', 'install', 'pyinstaller') $Backend
if (Test-Path "$Backend\dist") { Remove-Item "$Backend\dist" -Recurse -Force }
Run $VenvPy @('-m', 'PyInstaller', '--noconfirm', '--onedir', '--name', 'friday-backend',
  '--distpath', 'dist', '--workpath', 'build', '--specpath', 'build', '--paths', '.',
  '--collect-submodules', 'uvicorn', '--collect-submodules', 'keyring',
  '--hidden-import', 'sqlalchemy.dialects.sqlite', '--hidden-import', 'keyring.backends.Windows',
  'app\main.py') $Backend
if (-not (Test-Path "$Backend\dist\friday-backend\friday-backend.exe")) { throw 'Backend packaging failed.' }
Run 'npm' @('run', 'dist') $Desktop
$out = Get-ChildItem "$Desktop\release\FRIDAY-Setup-*.exe" | Select-Object -First 1
if (-not $out) { throw 'Installer was not produced.' }
Write-Host "Installer: $($out.FullName)" -ForegroundColor Green
