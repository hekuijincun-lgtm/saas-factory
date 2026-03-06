<#
.SYNOPSIS
  LINE_INTERNAL_TOKEN を Workers (secret) + Pages (secret) の両方に設定する。
  Webhook receipt log の internal endpoint 認証に使用。

.DESCRIPTION
  1. ランダムトークンを生成（または -Token で指定）
  2. Workers: wrangler secret put LINE_INTERNAL_TOKEN --env production
  3. Pages:   wrangler pages secret put LINE_INTERNAL_TOKEN --project-name saas-factory-web-v2
              (production + preview 両方)
  4. 設定確認: debug=1 webhook で logHasToken を確認

.PARAMETER Token
  使用するトークン文字列。省略時はランダム32文字を生成。

.PARAMETER SkipWorkers
  Workers 側の設定をスキップ（既に設定済みの場合）。

.EXAMPLE
  .\set-line-internal-token.ps1
  .\set-line-internal-token.ps1 -Token "my-secret-token-here"
  .\set-line-internal-token.ps1 -SkipWorkers
#>
param(
    [string]$Token = "",
    [switch]$SkipWorkers
)

Set-StrictMode -Off
$ErrorActionPreference = "Stop"

$PagesProject = "saas-factory-web-v2"
$WranglerHome = "C:\Users\$env:USERNAME\.wrangler"
$ApiDir       = "C:\dev\saas-factory\apps\api"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Set LINE_INTERNAL_TOKEN" -ForegroundColor Cyan
Write-Host "  Workers + Pages (prod & preview)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# Token 生成
# ─────────────────────────────────────────────────────────────────────────────
if (-not $Token) {
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    $Token = -join (1..32 | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
    Write-Host "  Generated token: $($Token.Substring(0,8))..." -ForegroundColor Green
} else {
    Write-Host "  Using provided token: $($Token.Substring(0, [Math]::Min(8, $Token.Length)))..." -ForegroundColor Green
}
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# wrangler 実行用: CLOUDFLARE_API_TOKEN を退避して除去（OAuth トークンを使う）
# ─────────────────────────────────────────────────────────────────────────────
$savedToken = $env:CLOUDFLARE_API_TOKEN
try { Remove-Item Env:\CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue } catch {}
$env:WRANGLER_HOME = $WranglerHome

function Invoke-WranglerSecret {
    param(
        [string]$Type,        # "workers" or "pages"
        [string]$Environment, # "production" or "preview"
        [string]$Value
    )
    $label = "$Type ($Environment)"
    Write-Host "  -> $label ..." -ForegroundColor Cyan

    if ($Type -eq "workers") {
        $result = $Value | npx wrangler@4.54.0 secret put LINE_INTERNAL_TOKEN --env $Environment 2>&1
    } else {
        $wranglerArgs = @(
            "pages", "secret", "put", "LINE_INTERNAL_TOKEN",
            "--project-name", $PagesProject
        )
        if ($Environment -ne "production") {
            $wranglerArgs += @("--env", $Environment)
        }
        $result = $Value | npx wrangler@4.54.0 @wranglerArgs 2>&1
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Host "     OK: $label" -ForegroundColor Green
    } else {
        Write-Host "     FAIL: $label" -ForegroundColor Red
        $result | Where-Object { $_ -notmatch "LeadsTools|ProfilePS1" } |
                  ForEach-Object { Write-Host "       $_" -ForegroundColor DarkRed }
        throw "wrangler secret put failed for $label"
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# 実行
# ─────────────────────────────────────────────────────────────────────────────
try {
    Push-Location $ApiDir

    if (-not $SkipWorkers) {
        Write-Host "[1/3] Workers production" -ForegroundColor Yellow
        Invoke-WranglerSecret -Type "workers" -Environment "production" -Value $Token
        Write-Host ""
    } else {
        Write-Host "[1/3] Workers: SKIPPED (-SkipWorkers)" -ForegroundColor DarkGray
        Write-Host ""
    }

    Write-Host "[2/3] Pages production" -ForegroundColor Yellow
    Invoke-WranglerSecret -Type "pages" -Environment "production" -Value $Token
    Write-Host ""

    Write-Host "[3/3] Pages preview" -ForegroundColor Yellow
    Invoke-WranglerSecret -Type "pages" -Environment "preview" -Value $Token
    Write-Host ""

} catch {
    Write-Host ""
    Write-Host "  ERROR: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Troubleshooting:" -ForegroundColor Yellow
    Write-Host "    1. wrangler login が必要な場合:" -ForegroundColor Yellow
    Write-Host "       cd $ApiDir" -ForegroundColor DarkGray
    Write-Host "       npx wrangler login" -ForegroundColor DarkGray
    Write-Host "    2. CF Dashboard から手動設定:" -ForegroundColor Yellow
    Write-Host "       Pages -> $PagesProject -> Settings -> Environment variables" -ForegroundColor DarkGray
    Write-Host "       Name: LINE_INTERNAL_TOKEN  Value: $Token" -ForegroundColor DarkGray
    Write-Host ""
    exit 1
} finally {
    Pop-Location
    if ($savedToken) { $env:CLOUDFLARE_API_TOKEN = $savedToken }
}

# ─────────────────────────────────────────────────────────────────────────────
# 完了 + 検証手順
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "========================================" -ForegroundColor Green
Write-Host "  LINE_INTERNAL_TOKEN set!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host ""
Write-Host "  1. Pages を再デプロイ（新 secret を反映）:" -ForegroundColor White
Write-Host "     cd C:\dev\saas-factory" -ForegroundColor DarkGray
Write-Host '     git commit --allow-empty -m "chore: trigger Pages redeploy for LINE_INTERNAL_TOKEN"' -ForegroundColor DarkGray
Write-Host "     git push origin main" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  2. debug=1 で確認:" -ForegroundColor White
Write-Host '     Invoke-RestMethod -Method POST `' -ForegroundColor DarkGray
Write-Host '       -Uri "https://saas-factory-web-v2.pages.dev/api/line/webhook?debug=1&tenantId=store-aea0" `' -ForegroundColor DarkGray
Write-Host '       -ContentType "application/json" `' -ForegroundColor DarkGray
Write-Host '       -Body ''{"destination":"U_TEST","events":[]}''' -ForegroundColor DarkGray
Write-Host ""
Write-Host "     Expected: logHasToken=True, logPostAttempt=True" -ForegroundColor Gray
Write-Host ""
