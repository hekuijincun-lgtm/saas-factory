#Requires -Version 7
<#
.SYNOPSIS
  LINEログイン用 URL をブラウザで開き、ログイン完了後に Edge を終了して
  verify-line-session.ps1 を自動実行する。

.PARAMETER Profile
  Edge のプロファイルディレクトリ名（例: "Default", "Profile 1", "Profile 2"）。
  指定すると msedge.exe --profile-directory で起動する。
  省略すると既定ブラウザで開く。

.EXAMPLE
  .\open-line-login.ps1
  .\open-line-login.ps1 -Profile "Profile 1"
#>
param(
    [string]$Profile = ""
)

$PagesOrigin = "https://saas-factory-web-v2.pages.dev"
$LoginUrl    = "$PagesOrigin/api/auth/line/start"
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║              LINE Login Launcher  (open-line-login)          ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "🔑 LINE ログイン URL:" -ForegroundColor Yellow
Write-Host "   $LoginUrl" -ForegroundColor DarkCyan
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# ブラウザを起動
# ─────────────────────────────────────────────────────────────────────────────
if ($Profile) {
    Write-Host "► Edge (--profile-directory=`"$Profile`") を起動します..." -ForegroundColor Yellow
    Start-Process "msedge.exe" -ArgumentList "--profile-directory=`"$Profile`"", $LoginUrl
} else {
    Write-Host "► 既定ブラウザを起動します..." -ForegroundColor Yellow
    Start-Process $LoginUrl
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  手順：" -ForegroundColor White
Write-Host "  1. ブラウザで LINE のログイン画面が開きます。" -ForegroundColor White
Write-Host "  2. LINE でログインしてください。" -ForegroundColor White
Write-Host "  3. /admin/settings または /admin/unauthorized にリダイレクト" -ForegroundColor White
Write-Host "     されたらログイン完了です。" -ForegroundColor White
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# ステップ 1: ログイン完了の一次確認（Edge はまだ終了しない）
# ─────────────────────────────────────────────────────────────────────────────
$null = Read-Host "LINE ログイン完了後、Enter を押してください"

# ─────────────────────────────────────────────────────────────────────────────
# ステップ 2: /admin/ ページ到達の二次確認（cookie flush 前の最終チェック）
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "┌──────────────────────────────────────────────────────────────┐" -ForegroundColor Magenta
Write-Host "│  ⚠ 確認：URLバーが以下になっていることを確認してください。   │" -ForegroundColor Magenta
Write-Host "│                                                               │" -ForegroundColor Magenta
Write-Host "│    /admin/settings    または    /admin/unauthorized           │" -ForegroundColor Magenta
Write-Host "│                                                               │" -ForegroundColor Magenta
Write-Host "│  まだ LINE の画面やログイン画面の場合は                        │" -ForegroundColor Magenta
Write-Host "│  Ctrl+C でキャンセルしてログインをやり直してください。        │" -ForegroundColor Magenta
Write-Host "└──────────────────────────────────────────────────────────────┘" -ForegroundColor Magenta
Write-Host ""
$null = Read-Host "/admin/ に到達していることを確認したら Enter を押してください"

# ─────────────────────────────────────────────────────────────────────────────
# ステップ 3: 3 秒待機（cookie flush 対策）
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "► 3 秒待機中（cookie flush 対策）..." -ForegroundColor DarkGray
Start-Sleep -Seconds 3

# ─────────────────────────────────────────────────────────────────────────────
# ステップ 4: Edge を終了（Cookies DB のロック解除）
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "► Edge を終了して Cookies DB のロックを解除します..." -ForegroundColor Yellow
$edgeProcs = Get-Process -Name "msedge" -ErrorAction SilentlyContinue
if ($edgeProcs) {
    $edgeProcs | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 1800
    Write-Host "  Stopped $($edgeProcs.Count) Edge process(es)." -ForegroundColor Gray
} else {
    Write-Host "  Edge was not running." -ForegroundColor Gray
}

# ─────────────────────────────────────────────────────────────────────────────
# ステップ 5: verify-line-session.ps1 を実行
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "► verify-line-session.ps1 を自動実行します..." -ForegroundColor Cyan
Write-Host ""

$verifyScript = Join-Path $ScriptDir "verify-line-session.ps1"
if (-not (Test-Path $verifyScript)) {
    Write-Host "⚠ verify-line-session.ps1 が見つかりません: $verifyScript" -ForegroundColor Red
    Write-Host "  手動で実行してください: .\scripts\ops\verify-line-session.ps1" -ForegroundColor Yellow
    exit 1
}

& $verifyScript
$verifyExit = $LASTEXITCODE

Write-Host ""
if ($verifyExit -eq 0) {
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "🎉 line_session を確認しました！次のコマンドで認証ゲートを有効化できます：" -ForegroundColor Green
    Write-Host ""
    Write-Host "   .\scripts\ops\enable-require-line-auth.ps1" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "⚠ line_session が確認できませんでした (exit $verifyExit)" -ForegroundColor Red
    Write-Host ""
    Write-Host "  verify の出力に line_cb_* 診断 cookie が表示されているはずです。" -ForegroundColor Yellow
    Write-Host "  そこに原因（ng_exchange_failed / ng_secret_missing 等）が記載されています。" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  診断 cookie が出ない場合は callback route が古い可能性があります。" -ForegroundColor Yellow
    Write-Host "  Pages の最新デプロイを確認して再試行してください。" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  再試行:" -ForegroundColor White
    Write-Host "  .\scripts\ops\open-line-login.ps1" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  全 line_% cookie を確認:" -ForegroundColor White
    Write-Host "  .\scripts\ops\verify-line-session.ps1 -AllLine" -ForegroundColor DarkGray
}

exit $verifyExit
