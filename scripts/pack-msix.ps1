# Build DataWeave Studio as a signed MSIX for the Microsoft Store.
#
# This is an ADDITIVE third distribution channel - the MSI/NSIS + GitHub-release
# flow (release.yml) is untouched. The Store re-signs the package on submission,
# so the dev cert here is for LOCAL install/testing only.
#
#   Run from anywhere:  pwsh -File scripts/pack-msix.ps1
#   Output:             AshutoshVijay.DataWeaveStudio_<ver>_x64.msix  (repo root)
#
# After it finishes, install for testing in an ELEVATED shell (admin needed once
# to trust the dev cert):
#   winapp cert install .\devcert.pfx
#   Add-AppxPackage .\AshutoshVijay.DataWeaveStudio_<version>_x64.msix
#
# For real submission: replace Identity/Publisher in Package.appxmanifest with the
# Partner Center values, then upload the UNSIGNED package layout (Store signs it).

$ErrorActionPreference = 'Stop'
$env:WINAPP_CLI_TELEMETRY_OPTOUT = '1'   # the app promises offline/no-telemetry; keep the toolchain quiet too

$root  = Split-Path -Parent $PSScriptRoot
$rel   = Join-Path $root 'src-tauri\target\release'
$stage = Join-Path $root 'dist-msix'

# 1. Build frontend + Rust binary in Store mode: VITE_STORE_BUILD disables the
#    self-updater (the Store delivers updates); --no-bundle skips the NSIS/MSI
#    installers we don't need for MSIX. Resources still land next to the exe.
Write-Host '==> Building (Store mode, no installer bundles)...' -ForegroundColor Cyan
$env:VITE_STORE_BUILD = '1'
Push-Location $root
try { npm run tauri -- build --no-bundle } finally { Pop-Location }

if (-not (Test-Path (Join-Path $rel 'app.exe')))   { throw "Build did not produce app.exe in $rel" }
if (-not (Test-Path (Join-Path $rel 'resources'))) { throw "No resources next to the binary in $rel - the engine/JRE would be missing from the package" }

# 2. Stage the exact layout that runs when you double-click target\release\app.exe:
#    the exe, its bundled resources (JRE, dw-server, secure-properties...), the
#    MSIX assets and the manifest.
Write-Host '==> Staging package layout...' -ForegroundColor Cyan
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null
Copy-Item (Join-Path $rel 'app.exe')               $stage
Copy-Item (Join-Path $rel 'resources')             $stage -Recurse
Copy-Item (Join-Path $root 'Assets')               $stage -Recurse
Copy-Item (Join-Path $root 'Package.appxmanifest') $stage

# 3. Dev certificate (its CN must match Publisher in the manifest - winapp reads
#    that from Package.appxmanifest in the repo root).
Push-Location $root
try {
  if (-not (Test-Path (Join-Path $root 'devcert.pfx'))) {
    Write-Host '==> Generating dev certificate...' -ForegroundColor Cyan
    winapp cert generate
  }

  # 4. Pack + sign.
  Write-Host '==> Packing MSIX...' -ForegroundColor Cyan
  winapp package $stage --manifest (Join-Path $stage 'Package.appxmanifest') --exe app.exe --cert (Join-Path $root 'devcert.pfx')
} finally { Pop-Location }

Write-Host '==> Done. .msix is in the repo root.' -ForegroundColor Green
