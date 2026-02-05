param(
  [string]$SearchRoot = $HOME
)

Write-Host "=== SlotLock auto-fix start ==="

function Find-WranglerToml {
  param([string]$root)
  $candidates = Get-ChildItem -Path $root -Recurse -File -Filter wrangler.toml -ErrorAction SilentlyContinue
  if (-not $candidates) { return $null }
  $saas = $candidates | Where-Object { (Get-Content $_.FullName -Raw) -match 'name\s*=\s*"saas-api"' }
  if ($saas) { return $saas[0].FullName }
  return $candidates[0].FullName
}

function Find-DoSourceFile {
  param([string]$rootDir)
  $files = Get-ChildItem -Path $rootDir -Recurse -File -Include *.ts,*.tsx,*.js,*.mjs -ErrorAction SilentlyContinue
  $hit = $files | Where-Object { Select-String -Path $_.FullName -Pattern 'class\s+SlotLockV2' -Quiet }
  if ($hit) { return $hit[0].FullName }
  $hit2 = $files | Where-Object { Select-String -Path $_.FullName -Pattern 'class\s+SlotLock' -Quiet }
  if ($hit2) { return $hit2[0].FullName }
  return $null
}

# 1) locate wrangler.toml
$tomlPath = Find-WranglerToml -root $SearchRoot
if (-not $tomlPath) {
  Write-Error "wrangler.toml not found. Specify -SearchRoot and retry."
  exit 1
}
$projectRoot = Split-Path $tomlPath -Parent
Write-Host "ProjectRoot: $projectRoot"
Write-Host "wrangler.toml: $tomlPath"

# 2) locate DO source
$doFile = Find-DoSourceFile -rootDir $projectRoot
if (-not $doFile) {
  Write-Error "Could not find a file that defines SlotLock/SlotLockV2."
  exit 1
}
Write-Host "DO Source: $doFile"

# 3) backup
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $projectRoot "Backups\$stamp"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
Copy-Item $tomlPath "$backupDir\wrangler.toml"
Copy-Item $doFile "$backupDir\$(Split-Path $doFile -Leaf)"
Write-Host "Backup: $backupDir"

# 4) rollback class name to SlotLock
$code = Get-Content $doFile -Raw
$origCode = $code
$code = $code -replace '\bclass\s+SlotLockV2\b', 'class SlotLock'
$code = $code -replace '\bexport\s+class\s+SlotLockV2\b', 'export class SlotLock'
$code = $code -replace '\bexport\s+default\s+class\s+SlotLockV2\b', 'export default class SlotLock'
$code = $code -replace '\bSlotLockV2\b', 'SlotLock'
if ($code -ne $origCode) {
  Set-Content -Path $doFile -Value $code -Encoding UTF8
  Write-Host "Replaced SlotLockV2 -> SlotLock"
} else {
  Write-Host "No SlotLockV2 markers found; continuing."
}

# 5) remove migrations with renamed_classes
$toml = Get-Content $tomlPath -Raw
$origToml = $toml
$toml = [regex]::Replace($toml, '(?s)\[\[migrations\]\].*?(?=(\[\[migrations\]\]|$\Z))', {
  param($m)
  if ($m.Value -match 'renamed_classes') { return '' } else { return $m.Value }
})
if ($toml -ne $origToml) {
  Set-Content -Path $tomlPath -Value $toml -Encoding UTF8
  Write-Host "Removed migrations containing renamed_classes."
} else {
  Write-Host "No renamed_classes migrations found."
}

# 6) deploy top-level env
Push-Location $projectRoot
try {
  Write-Host "Running: wrangler deploy --env="""
  wrangler deploy --env="" | Tee-Object -Variable DeployOut | Out-Host
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Deploy failed."
    exit 1
  }
  Write-Host "Deploy succeeded."
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "=== Test steps (send on LINE) ==="
Write-Host "/set-slots (YYYY-MM-DD today) 16:00-18:00 30"
Write-Host "/slots today"
Write-Host "/reserve (today) 16:30 test"
Write-Host "/my"
Write-Host "=== Done ==="
