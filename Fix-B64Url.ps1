# Fix-B64Url.ps1
$path = "C:\Users\mesom\src\index.ts"

if (-not (Test-Path $path)) { Write-Error "not found: $path"; exit 1 }

# backup
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bak = "C:\Users\mesom\Backups\b64url-fix-$stamp-index.ts"
New-Item -ItemType Directory -Force -Path (Split-Path $bak) | Out-Null
Copy-Item $path $bak
Write-Host "Backup -> $bak"

# replace the whole b64url function body
$code = Get-Content $path -Raw
$pattern = '(?s)function\s+b64url\s*\(\s*s:\s*string\s*\)\s*:\s*string\s*\{.*?\}'
$replacement = @'
function b64url(s: string): string {
  // URL-safe Base64: + => -, / => _, strip trailing =
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
'@
$code2 = [regex]::Replace($code, $pattern, $replacement)

if ($code2 -eq $code) {
  Write-Host "Note: b64url() block pattern not found; inserting a known-good version."

  # 最低限、壊れてる2行だけでも強制修正（行62近辺の崩れを想定）
  $code2 = $code -replace 'return\s+s\.replace\(/\\\+\/g,\s*"-"\)\.replace\(/\\\s*$', 'return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");'
}

Set-Content -Path $path -Value $code2 -Encoding UTF8
Write-Host "Patched b64url() in $path"
