#Requires -Version 7
<#
.SYNOPSIS
  REQUIRE_LINE_AUTH=1 を Pages production + preview に設定する。
  verify-line-session.ps1 が exit 0 でない限り実行を拒否する（安全ガード）。

.NOTES
  - wrangler の OAuth トークン（~\.wrangler\config\default.toml）を使用。
  - CLOUDFLARE_API_TOKEN を一時退避して除去することで CI トークンの権限不足を回避。
  - 設定後はシークレットウィンドウで /admin が要ログインになることを確認する。
#>

Set-StrictMode -Off
$ErrorActionPreference = "Stop"

$ScriptDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$PagesProject = "saas-factory-web-v2"
$WranglerHome = "C:\Users\$env:USERNAME\.wrangler"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║        Enable REQUIRE_LINE_AUTH  (enable-require-line-auth)  ║" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# 安全ガード: verify-line-session が exit 0 でなければ中断
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "► [ガード] verify-line-session.ps1 を実行します..." -ForegroundColor Yellow
Write-Host ""

$verifyScript = Join-Path $ScriptDir "verify-line-session.ps1"
if (-not (Test-Path $verifyScript)) {
    Write-Host "  ✗ verify-line-session.ps1 が見つかりません: $verifyScript" -ForegroundColor Red
    exit 1
}

& $verifyScript
$verifyExit = $LASTEXITCODE

if ($verifyExit -ne 0) {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "🚫 BLOCKED: line_session が未確認です (verify exit=$verifyExit)" -ForegroundColor Red
    Write-Host "   REQUIRE_LINE_AUTH=1 を設定すると /admin に入れなくなります。" -ForegroundColor Red
    Write-Host ""
    Write-Host "   先に open-line-login.ps1 → LINE ログイン → verify-line-session.ps1 を完了してください。" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "✅ line_session 確認済み。REQUIRE_LINE_AUTH=1 を設定します..." -ForegroundColor Green
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# wrangler 実行用: CLOUDFLARE_API_TOKEN を退避して除去（OAuth トークンを使う）
# ─────────────────────────────────────────────────────────────────────────────
$savedToken = $env:CLOUDFLARE_API_TOKEN
try { Remove-Item Env:\CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue } catch {}
$env:WRANGLER_HOME = $WranglerHome

function Set-PagesSecret {
    param(
        [string]$SecretName,
        [string]$SecretValue,
        [string]$Environment  # "production" or "preview"
    )
    Write-Host "  → $($Environment): setting $SecretName..." -ForegroundColor Cyan
    # --env preview は production 以外にのみ付与（スプラッティングで安全に渡す）
    $wranglerArgs = @(
        "pages", "secret", "put", $SecretName,
        "--project-name", $PagesProject
    )
    if ($Environment -ne "production") {
        $wranglerArgs += @("--env", $Environment)
    }
    $result = $SecretValue | npx wrangler@4.54.0 @wranglerArgs 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "    ✅ $($Environment): $SecretName = (set)" -ForegroundColor Green
    } else {
        Write-Host "    ✗ $Environment failed:" -ForegroundColor Red
        $result | Where-Object { $_ -notmatch "LeadsTools|ProfilePS1" } |
                  ForEach-Object { Write-Host "      $_" -ForegroundColor DarkRed }
        throw "wrangler pages secret put failed for $Environment"
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# production + preview に REQUIRE_LINE_AUTH=1 をセット
# ─────────────────────────────────────────────────────────────────────────────
try {
    Set-PagesSecret -SecretName "REQUIRE_LINE_AUTH" -SecretValue "1" -Environment "production"
    Set-PagesSecret -SecretName "REQUIRE_LINE_AUTH" -SecretValue "1" -Environment "preview"
} catch {
    Write-Host ""
    Write-Host "  ✗ 設定に失敗しました: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "  トラブルシューティング:" -ForegroundColor Yellow
    Write-Host "    1. wrangler の OAuth ログインが必要な場合:" -ForegroundColor Yellow
    Write-Host "       cd C:\dev\saas-factory\apps\api" -ForegroundColor DarkGray
    Write-Host "       npx wrangler login" -ForegroundColor DarkGray
    Write-Host "    2. Pages 権限が不足している場合は CF ダッシュボードから手動で設定:" -ForegroundColor Yellow
    Write-Host "       https://dash.cloudflare.com → Pages → saas-factory-web-v2" -ForegroundColor DarkGray
    Write-Host "       → Settings → Environment variables → Add variable" -ForegroundColor DarkGray
    Write-Host "       Name: REQUIRE_LINE_AUTH  Value: 1  (Encrypt: OFF)" -ForegroundColor DarkGray
    # トークンを復元
    if ($savedToken) { $env:CLOUDFLARE_API_TOKEN = $savedToken }
    exit 1
} finally {
    # トークンを必ず復元
    if ($savedToken) { $env:CLOUDFLARE_API_TOKEN = $savedToken }
}

# ─────────────────────────────────────────────────────────────────────────────
# 完了メッセージ
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""
Write-Host "🎉 REQUIRE_LINE_AUTH=1 が production + preview に設定されました！" -ForegroundColor Green
Write-Host ""
Write-Host "  次の確認を行ってください：" -ForegroundColor White
Write-Host ""
Write-Host "  ① シークレットウィンドウで以下を開く：" -ForegroundColor White
Write-Host "     https://saas-factory-web-v2.pages.dev/admin" -ForegroundColor DarkCyan
Write-Host "     → /admin/line-setup?reason=not_logged_in にリダイレクト されれば OK" -ForegroundColor Gray
Write-Host ""
Write-Host "  ② 通常ウィンドウ（cookie あり）で /admin を開く：" -ForegroundColor White
Write-Host "     → そのまま管理画面が表示されれば OK" -ForegroundColor Gray
Write-Host ""
Write-Host "  ③ curl で確認：" -ForegroundColor White
Write-Host '     curl.exe -sD - "https://saas-factory-web-v2.pages.dev/admin" | Select-String "location|line-setup"' -ForegroundColor DarkGray
Write-Host ""
Write-Host "  ⚠ cookie なしで /admin がそのまま開く場合は" -ForegroundColor Yellow
Write-Host "    Pages の Secret が新しいデプロイに反映されるまで数分待ってください。" -ForegroundColor Yellow
Write-Host ""
