#Requires -Version 7
<#
.SYNOPSIS
  Edge の Cookies DB から line_session / line_cb 診断 cookie の有無を確認する。
  exit 0 = OK (line_session あり / has_value=1)
  exit 1 = 実行エラー (sqlite3 未検出 / DB 見つからず)
  exit 2 = NG  (line_session なし)

.PARAMETER AllLine
  デフォルトの検索対象に加えて name LIKE 'line_%' の全 cookie を表示する。

.NOTES
  診断 cookie (line_cb_*) について
  ─────────────────────────────────────────────────────────────
  callback/route.ts が全 return 経路で line_cb_<step>=1 という cookie を
  セットする。Chromium は cookie value を DPAPI 暗号化して格納するが、
  cookie の name 列は平文で SQLite に保存されるため、name を読むだけで
  どのステップで止まったかが分かる。

  有効なステップ名（line_cb_ の後に続く文字列）:
    ok_done            → ログイン成功（line_session がセットされているはず）
    ok_debug           → debug=1 モード（実際の cookie はセットされない）
    ng_missing_code    → code/state パラメータ欠落
    ng_bad_state       → state の Base64/JSON 解析失敗
    ng_exchange_failed → LINE token exchange 失敗 → LINE_LOGIN_CHANNEL_SECRET を確認
    ng_unauthorized    → userId が allowedAdminLineUserIds に未登録
    ng_secret_missing  → LINE_SESSION_SECRET が Pages 環境変数に未設定
    ng_exception       → callback で予期しない例外が発生
  ─────────────────────────────────────────────────────────────
#>
param(
    [switch]$AllLine
)

Set-StrictMode -Off
$ErrorActionPreference = "Stop"

# 診断ステップの説明テーブル
$cbStepMap = @{
    "ok_done"            = "✅ ログイン成功（line_session がセットされているはず）"
    "ok_debug"           = "⚠ debug=1 モード（実際の session cookie はセットされない）"
    "ng_missing_code"    = "❌ code/state パラメータ欠落（LINE→callback リダイレクト失敗）"
    "ng_bad_state"       = "❌ state の Base64/JSON 解析失敗"
    "ng_exchange_failed" = "❌ LINE token exchange 失敗 → LINE_LOGIN_CHANNEL_SECRET を確認"
    "ng_unauthorized"    = "❌ userId が allowedAdminLineUserIds に未登録"
    "ng_secret_missing"  = "❌ LINE_SESSION_SECRET が Pages 環境変数に未設定"
    "ng_exception"       = "❌ callback で予期しない例外が発生"
}

# ─────────────────────────────────────────────────────────────────────────────
# 0. ヘッダー
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       LINE Session Cookie Verifier  (verify-line-session)    ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
if ($AllLine) {
    Write-Host "  モード: -AllLine (name LIKE 'line_%' を全表示)" -ForegroundColor DarkYellow
}
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# 1. Edge プロセスを終了（DB ロック回避）
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "► [1/4] Stopping Edge processes..." -ForegroundColor Yellow
$edgeProcs = Get-Process -Name "msedge" -ErrorAction SilentlyContinue
if ($edgeProcs) {
    $edgeProcs | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 1800
    Write-Host "  Stopped $($edgeProcs.Count) Edge process(es)." -ForegroundColor Gray
} else {
    Write-Host "  Edge was not running." -ForegroundColor Gray
}

# ─────────────────────────────────────────────────────────────────────────────
# 2. sqlite3 を探す
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "► [2/4] Locating sqlite3..." -ForegroundColor Yellow

function Find-Sqlite3 {
    $cmd = Get-Command sqlite3 -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $machinePath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") -split ";"
    $userPath    = [System.Environment]::GetEnvironmentVariable("PATH", "User")    -split ";"
    foreach ($dir in ($machinePath + $userPath | Where-Object { $_ -ne "" })) {
        $exe = Join-Path $dir "sqlite3.exe"
        if (Test-Path $exe) { return $exe }
    }

    $wingetBase = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages"
    if (Test-Path $wingetBase) {
        $hit = Get-ChildItem -Path $wingetBase -Filter "sqlite3.exe" -Recurse -Depth 5 `
               -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($hit) { return $hit.FullName }
    }

    foreach ($root in @("$env:ProgramFiles", "${env:ProgramFiles(x86)}", "$env:LOCALAPPDATA\Programs")) {
        if (-not $root) { continue }
        $hit = Get-ChildItem -Path $root -Filter "sqlite3.exe" -Recurse -Depth 4 `
               -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($hit) { return $hit.FullName }
    }

    return $null
}

$sqlite3 = Find-Sqlite3
if (-not $sqlite3) {
    Write-Host "  ✗ sqlite3.exe not found." -ForegroundColor Red
    Write-Host "  → Install with: winget install SQLite.SQLite" -ForegroundColor Cyan
    Write-Host "    Then open a new PowerShell window and retry." -ForegroundColor Cyan
    exit 1
}
Write-Host "  ✓ sqlite3: $sqlite3" -ForegroundColor Green

# ─────────────────────────────────────────────────────────────────────────────
# 3. Edge Cookies DB の候補を収集
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "► [3/4] Locating Edge Cookies database..." -ForegroundColor Yellow

$edgeBase = "$env:LOCALAPPDATA\Microsoft\Edge\User Data"

$candidates = [System.Collections.Generic.List[string]]::new()
@(
    "$edgeBase\Default\Network\Cookies",
    "$edgeBase\Default\Cookies"
) | Where-Object { Test-Path $_ } | ForEach-Object { $candidates.Add($_) }

Get-ChildItem -Path $edgeBase -Filter "Profile *" -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name |
    ForEach-Object {
        $nw = Join-Path $_.FullName "Network\Cookies"
        $pl = Join-Path $_.FullName "Cookies"
        if (Test-Path $nw) { $candidates.Add($nw) }
        elseif (Test-Path $pl) { $candidates.Add($pl) }
    }

if ($candidates.Count -eq 0) {
    Write-Host "  ✗ No Edge Cookies DB found under: $edgeBase" -ForegroundColor Red
    Write-Host "  → Edge may never have been used, or profile path differs." -ForegroundColor Cyan
    exit 1
}
Write-Host "  Found $($candidates.Count) DB candidate(s):" -ForegroundColor Gray
$candidates | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }

# ─────────────────────────────────────────────────────────────────────────────
# 4. 全候補 DB を走査（打ち切りなし）
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "► [4/4] Searching ALL DBs for line cookies..." -ForegroundColor Yellow

# SQL columns: host_key | name | path | expires_utc | value_len | enc_len | has_value
# ORDER BY expires_utc DESC: 直近のログイン試行の cookie が先頭に来る
if ($AllLine) {
    $whereClause = "name LIKE 'line_%'"
} else {
    # line_cb  = 診断 cookie (value 暗号化)
    # line_cb% = 診断 cookie (name にステップ名を含む、平文で読める)
    $whereClause = "name IN ('line_session', 'line_uid', 'line_return_to', 'line_cb') OR name LIKE 'line_cb_%'"
}
$sqlQuery = "SELECT host_key, name, path, expires_utc, LENGTH(value) AS value_len, LENGTH(encrypted_value) AS enc_len, CASE WHEN LENGTH(value) > 0 OR LENGTH(encrypted_value) > 0 THEN 1 ELSE 0 END AS has_value FROM cookies WHERE $whereClause ORDER BY expires_utc DESC;"

$tmpDb              = Join-Path $env:TEMP "edge_cookies_verify_tmp.db"
$lineSessionFoundDb = $null
$lineSessionRow     = $null
$cbStepCookies      = [System.Collections.Generic.List[string]]::new()
$allDbResults       = [System.Collections.Generic.List[object]]::new()

foreach ($dbPath in $candidates) {
    Write-Host ""
    Write-Host "  ── $dbPath" -ForegroundColor DarkCyan

    try {
        Copy-Item -Path $dbPath -Destination $tmpDb -Force
    } catch {
        Write-Host "    ⚠ Copy failed (locked or permission denied): $_" -ForegroundColor Yellow
        continue
    }

    $tables = & $sqlite3 $tmpDb ".tables" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    ⚠ sqlite3 error: $tables" -ForegroundColor Yellow
        Remove-Item $tmpDb -Force -ErrorAction SilentlyContinue
        continue
    }
    if ($tables -notmatch "\bcookies\b") {
        Write-Host "    ⚠ No 'cookies' table. (tables: $tables)" -ForegroundColor Yellow
        Remove-Item $tmpDb -Force -ErrorAction SilentlyContinue
        continue
    }

    $rows = & $sqlite3 "-separator" "|" $tmpDb $sqlQuery 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    ⚠ Query error: $rows" -ForegroundColor Yellow
        Remove-Item $tmpDb -Force -ErrorAction SilentlyContinue
        continue
    }

    $dbRows = @($rows | Where-Object { $_ -ne "" })

    Write-Host "    host_key | name | path | expires_utc | value_len | enc_len | has_value" -ForegroundColor DarkGray

    $dbHasSession = $false

    if ($dbRows.Count -gt 0) {
        foreach ($row in $dbRows) {
            $p        = $row -split "\|"
            $name     = if ($p.Count -gt 1) { $p[1] } else { "" }
            $hasValue = if ($p.Count -gt 6) { $p[6] } else { "0" }

            # 表示色の決定
            if ($name -eq "line_session") {
                $color = if ($hasValue -eq "1") { "Green" } else { "DarkYellow" }
            } elseif ($name -like "line_cb_ok_*") {
                $color = "Green"
            } elseif ($name -like "line_cb_ng_*") {
                $color = "Red"
            } elseif ($name -eq "line_cb") {
                $color = "Magenta"
            } elseif ($name -eq "line_uid") {
                $color = "Cyan"
            } elseif ($name -eq "line_return_to") {
                $color = "Yellow"
            } else {
                $color = "Gray"
            }
            Write-Host "    $row" -ForegroundColor $color

            # line_session 検出
            if ($name -eq "line_session" -and $hasValue -eq "1") {
                $dbHasSession = $true
                if ($null -eq $lineSessionFoundDb) {
                    $lineSessionFoundDb = $dbPath
                    $lineSessionRow     = $row
                }
            }

            # line_cb_* 診断 cookie 収集（has_value=1 のもの）
            if ($name -like "line_cb_*" -and $hasValue -eq "1") {
                if ($cbStepCookies -notcontains $name) {
                    $cbStepCookies.Add($name)
                }
            }
        }
    } else {
        Write-Host "    (no cookies matched)" -ForegroundColor DarkYellow
    }

    $allDbResults.Add([pscustomobject]@{
        DbPath     = $dbPath
        Rows       = $dbRows
        HasSession = $dbHasSession
    })

    Remove-Item $tmpDb -Force -ErrorAction SilentlyContinue
    # ★ break なし：全 DB を走査する
}

# ─────────────────────────────────────────────────────────────────────────────
# 5. 診断 cookie (line_cb_*) の解析・表示
# ─────────────────────────────────────────────────────────────────────────────
if ($cbStepCookies.Count -gt 0) {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Host " 診断 cookie (line_cb_*) が見つかりました" -ForegroundColor Magenta
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    foreach ($cbName in $cbStepCookies) {
        $cbStep = $cbName -replace "^line_cb_", ""
        $cbDesc = if ($cbStepMap.ContainsKey($cbStep)) { $cbStepMap[$cbStep] } else { "(不明なステップ: $cbStep)" }
        $cbColor = if ($cbName -like "line_cb_ok_*") { "Green" } else { "Red" }
        Write-Host ""
        Write-Host "  cookie : $cbName" -ForegroundColor $cbColor
        Write-Host "  step   : $cbStep" -ForegroundColor $cbColor
        Write-Host "  meaning: $cbDesc" -ForegroundColor White
    }
    Write-Host ""
}

# ─────────────────────────────────────────────────────────────────────────────
# 6. 最終判定
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""

if ($null -ne $lineSessionFoundDb) {
    Write-Host "✅  OK: line_session found (has_value=1)" -ForegroundColor Green
    Write-Host ""
    Write-Host "  DB  : $lineSessionFoundDb" -ForegroundColor Cyan
    if ($lineSessionRow) {
        $p = $lineSessionRow -split "\|"
        Write-Host "  host_key  : $($p[0])" -ForegroundColor Cyan
        Write-Host "  name      : $($p[1])" -ForegroundColor Cyan
        Write-Host "  path      : $($p[2])" -ForegroundColor Cyan
        Write-Host "  expires   : $($p[3])" -ForegroundColor Cyan
        Write-Host "  value_len : $($p[4])" -ForegroundColor Cyan
        Write-Host "  enc_len   : $($p[5])" -ForegroundColor Cyan
        Write-Host "  has_value : $($p[6])" -ForegroundColor Cyan
    }
    Write-Host ""
    Write-Host "  → enable-require-line-auth.ps1 を実行して認証ゲートを有効化できます。" -ForegroundColor Cyan
    exit 0

} else {
    # line_cb_* で原因が特定できているか？
    $diagAvailable = $cbStepCookies.Count -gt 0

    if ($diagAvailable) {
        Write-Host "❌  NG: line_session missing" -ForegroundColor Red
        Write-Host "    ただし line_cb_* 診断 cookie から原因が特定されています。" -ForegroundColor Yellow
        Write-Host "    上の「診断 cookie」セクションを参照してください。" -ForegroundColor Yellow
    } else {
        # 全 DB で見つかった cookie 名を集約
        $allNames = @()
        foreach ($r in $allDbResults) {
            foreach ($row in $r.Rows) {
                $n = ($row -split "\|")[1]
                if ($n -and $allNames -notcontains $n) { $allNames += $n }
            }
        }
        $others = if ($allNames.Count -gt 0) { $allNames -join ", " } else { "none" }

        Write-Host "❌  NG: line_session missing (診断 cookie も見つかりません)" -ForegroundColor Red
        Write-Host "    Scanned $($candidates.Count) DB(s)  |  found: $others" -ForegroundColor DarkYellow
        Write-Host ""
        Write-Host "  考えられる原因：" -ForegroundColor Yellow
        Write-Host "  1. LINE ログインがまだ完了していない → open-line-login.ps1 を再実行。" -ForegroundColor Yellow
        Write-Host "  2. line_cb_* が別プロファイルにある → -AllLine で全 line_% を確認。" -ForegroundColor Yellow
        Write-Host "     .\scripts\ops\verify-line-session.ps1 -AllLine" -ForegroundColor DarkGray
        Write-Host "  3. callback route が古い（applyDiag 未反映） → Pages を再デプロイ。" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "  debug=1 でコールバックステップを確認:" -ForegroundColor DarkGray
    $state64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes('{"tenantId":"default","returnTo":"/admin/settings"}'))
    Write-Host "  curl.exe -sS `"https://saas-factory-web-v2.pages.dev/api/auth/line/callback?debug=1&code=dummy&state=$state64`" | ConvertFrom-Json | Format-List" -ForegroundColor DarkGray
    Write-Host ""
    exit 2
}
