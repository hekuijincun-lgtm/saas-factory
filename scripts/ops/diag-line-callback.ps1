#Requires -Version 7
<#
.SYNOPSIS
  LINE callback URL の HTTP レスポンスヘッダーを確認する（補助診断ツール）。
  Set-Cookie に line_session が含まれるか、x-line-cb-step が何かを確認する。

.NOTES
  通常フロー（URLコピペ不要）:
    1. .\scripts\ops\open-line-login.ps1  → LINE ログイン → verify 自動実行
    2. .\scripts\ops\verify-line-session.ps1  → line_cb_* 診断 cookie で原因確認

  このスクリプトは以下の場合に使用する補助ツール:
    - verify で line_cb_* が出ない（callback route が古い可能性）
    - x-line-cb-step ヘッダーを直接確認したい
    - callback URL を手動コピペして詳細確認したい

  注意:
    - callback URL の code= は 1 回限り有効。ブラウザが先に処理した場合は
      code が失効しているため再ログインが必要。
    - curl.exe (Windows 同梱) を使用してリダイレクトを追わずにヘッダーのみ取得。
#>

Set-StrictMode -Off
$ErrorActionPreference = "Stop"

# ─────────────────────────────────────────────────────────────────────────────
# 0. ヘッダー
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     LINE Callback Header Diagnoser  (diag-line-callback)     ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  目的：LINE callback が Set-Cookie: line_session を返しているか確認する。" -ForegroundColor White
Write-Host ""
Write-Host "  手順：" -ForegroundColor White
Write-Host "  1. open-line-login.ps1 でブラウザを開き、LINE でログインする。" -ForegroundColor White
Write-Host "  2. ブラウザが callback にリダイレクトされた直後、URLバーに表示される" -ForegroundColor White
Write-Host "     URL をコピーする：" -ForegroundColor White
Write-Host "     https://...pages.dev/api/auth/line/callback?code=xxxx&state=yyyy" -ForegroundColor DarkCyan
Write-Host "  3. そのURLをここに貼り付けて Enter を押す。" -ForegroundColor White
Write-Host ""
Write-Host "  ⚠ 注意：code= は 1 回限り有効。ブラウザが先に使うと再確認できません。" -ForegroundColor Yellow
Write-Host "    その場合は open-line-login.ps1 で再ログインしてください。" -ForegroundColor Yellow
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# 1. callback URL を入力
# ─────────────────────────────────────────────────────────────────────────────
$callbackUrl = Read-Host "callback URL を貼り付けてください"
$callbackUrl = $callbackUrl.Trim()

if ([string]::IsNullOrWhiteSpace($callbackUrl)) {
    Write-Host ""
    Write-Host "  ✗ URL が入力されませんでした。" -ForegroundColor Red
    exit 1
}

if ($callbackUrl -notmatch "code=") {
    Write-Host ""
    Write-Host "  ⚠ URL に code= が含まれていません。callback URL か確認してください。" -ForegroundColor Yellow
}

# ─────────────────────────────────────────────────────────────────────────────
# 2. curl でレスポンスヘッダーを取得（リダイレクト非追跡、ボディは破棄）
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "► curl でレスポンスヘッダーを取得します..." -ForegroundColor Yellow
Write-Host "  URL: $callbackUrl" -ForegroundColor DarkGray
Write-Host ""

# -sS: silent + show errors
# -D -: dump all headers to stdout
# -o NUL: discard body
# curl.exe を明示（PowerShell の curl alias を回避）
$curlOutput = curl.exe -sS -D - -o NUL "$callbackUrl" 2>&1

# ─────────────────────────────────────────────────────────────────────────────
# 3. Set-Cookie / Location / line_ を含む行を抽出
# ─────────────────────────────────────────────────────────────────────────────
$matched = @($curlOutput | Select-String "Set-Cookie|Location|line_")

Write-Host "─────────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host " レスポンスヘッダー（抜粋）" -ForegroundColor DarkGray
Write-Host "─────────────────────────────────────────────────────────────────" -ForegroundColor DarkGray

if ($matched.Count -gt 0) {
    foreach ($m in $matched) {
        $text = $m.Line
        if ($text -match "line_session") {
            Write-Host "  $text" -ForegroundColor Green
        } elseif ($text -match "(?i)set-cookie") {
            Write-Host "  $text" -ForegroundColor Cyan
        } elseif ($text -match "(?i)location") {
            Write-Host "  $text" -ForegroundColor Yellow
        } else {
            Write-Host "  $text" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "  (マッチする行なし。curl 生出力の先頭 15 行:)" -ForegroundColor DarkYellow
    @($curlOutput) | Select-Object -First 15 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
}

Write-Host "─────────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# 4. 判定
# ─────────────────────────────────────────────────────────────────────────────
$sessionInCookie = @($matched | Where-Object { $_.Line -match "line_session" })

if ($sessionInCookie.Count -gt 0) {
    Write-Host "✅  Set-Cookie: line_session を確認しました。" -ForegroundColor Green
    Write-Host "    → ブラウザでログイン後に verify-line-session.ps1 を実行してください。" -ForegroundColor Cyan
    Write-Host "       .\scripts\ops\verify-line-session.ps1" -ForegroundColor DarkGray
    exit 0
} else {
    Write-Host "❌  Set-Cookie: line_session が見つかりません。" -ForegroundColor Red
    Write-Host ""
    Write-Host "  考えられる原因と対処：" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  1. code= が既にブラウザで使用済み（最多原因）" -ForegroundColor Yellow
    Write-Host "     → open-line-login.ps1 で再ログインし、リダイレクト直後の URL をコピー。" -ForegroundColor White
    Write-Host ""
    Write-Host "  2. LINE_SESSION_SECRET が Workers / Pages に未設定" -ForegroundColor Yellow
    $state64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes('{"tenantId":"default","returnTo":"/admin/settings"}'))
    Write-Host "     → debug=1 で確認:" -ForegroundColor White
    Write-Host "       curl.exe -sS `"https://saas-factory-web-v2.pages.dev/api/auth/line/callback?debug=1&code=dummy&state=$state64`" | ConvertFrom-Json | Format-List" -ForegroundColor DarkGray
    Write-Host "       step=sign_session + 'not configured' → LINE_SESSION_SECRET を設定。" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  3. LINE_LOGIN_CHANNEL_SECRET が Workers に未設定" -ForegroundColor Yellow
    Write-Host "     → debug=1 で step=exchange + missing_line_login_config が出たら要設定。" -ForegroundColor White
    Write-Host "       npx wrangler@4.54.0 secret put LINE_LOGIN_CHANNEL_SECRET --env production" -ForegroundColor DarkGray
    Write-Host ""
    exit 2
}
