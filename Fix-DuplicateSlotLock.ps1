# Fix-DuplicateSlotLock.ps1
$path = "C:\Users\mesom\src\index.ts"
if (-not (Test-Path $path)) { Write-Error "not found: $path"; exit 1 }

# バックアップ
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bak = "C:\Users\mesom\Backups\dup-slotlock-fix-$stamp-index.ts"
New-Item -ItemType Directory -Force -Path (Split-Path $bak) | Out-Null
Copy-Item $path $bak
Write-Host "Backup -> $bak"

# ファイル読み込み
$code = Get-Content $path -Raw

# 1) 典型パターン「export class SlotLock extends SlotLock {}」を削除
$code2 = [regex]::Replace(
  $code,
  '(?m)^\s*export\s+class\s+SlotLock\s+extends\s+SlotLock\s*\{\s*\}\s*\r?$',
  ''
)

# 2) 予防: もしまだ2回以上 "export class SlotLock" がある場合は、先頭だけ残す
if ( ([regex]::Matches($code2, '(?m)^\s*export\s+class\s+SlotLock\b')).Count -gt 1 ) {
  # 2番目以降の行頭 "export class SlotLock" をコメントアウト（本体も空なら後で消す）
  $code2 = [regex]::Replace(
    $code2,
    '(?m)^(?<dup>\s*export\s+class\s+SlotLock\b)',
    '/* DUP_REMOVED */ // ${dup}',
    1,                # 1回だけ置換スキップ = 先頭は残す
    0
  )
}

# 保存
Set-Content -Path $path -Value $code2 -Encoding UTF8
Write-Host "Patched duplicate SlotLock in $path"

# デプロイ
wrangler deploy --env=""
if ($LASTEXITCODE -ne 0) { Write-Error "deploy failed"; exit 1 }
Write-Host "✅ Deploy OK. Run LINE 4-step:"
Write-Host "/set-slots 2025-11-07 16:00-18:00 30"
Write-Host "/slots today"
Write-Host "/reserve 2025-11-07 16:30 test"
Write-Host "/my"
