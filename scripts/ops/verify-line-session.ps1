#Requires -Version 7
<#
.SYNOPSIS
  Edge / Chrome の全プロファイル Cookies DB から
  line_session / line_cb_* 診断 cookie を検索して診断する。
  exit 0 = OK (line_session または line_cb_ok_done あり)
  exit 1 = 実行エラー (sqlite3 未検出 / DB 見つからず)
  exit 2 = NG  (line_session なし)

.PARAMETER AllLine
  検索対象を name LIKE 'line_%' に拡張して全 line_* cookie を表示する。

.PARAMETER EdgeProfileDir
  open-line-login.ps1 から渡されるプロファイルヒント（例: "Default", "Profile 1"）。
  指定したプロファイルの DB を先頭に並べて優先探索する。

.NOTES
  診断 cookie (line_cb_*) の仕組み:
    callback/route.ts が全 return 経路で line_cb_<step>=1 をセットする。
    Chromium は cookie value を DPAPI で暗号化するが、cookie の name 列は
    平文で SQLite に保存される。verify は name を読むだけで原因が分かる。

    step 名一覧:
      ok_done            -> ログイン成功
      ok_debug           -> debug=1 モード（session cookie はセットされない）
      ng_missing_code    -> code/state パラメータ欠落
      ng_bad_state       -> state の Base64/JSON 解析失敗
      ng_exchange_failed -> LINE token exchange 失敗 (LINE_LOGIN_CHANNEL_SECRET 確認)
      ng_unauthorized    -> userId が allowedAdminLineUserIds に未登録
      ng_secret_missing  -> LINE_SESSION_SECRET が Pages に未設定
      ng_exception       -> callback で予期しない例外
#>
param(
    [switch]$AllLine,
    [string]$EdgeProfileDir = ""
)

Set-StrictMode -Off
$ErrorActionPreference = "Stop"

# 診断ステップの説明テーブル
$cbStepMap = @{
    "ok_done"            = "✅ ログイン成功（line_session がセットされているはず）"
    "ok_debug"           = "⚠  debug=1 モード（実際の session cookie はセットされない）"
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
if ($AllLine)       { Write-Host "  モード: -AllLine (name LIKE 'line_%')" -ForegroundColor DarkYellow }
if ($EdgeProfileDir){ Write-Host "  ヒント: Edge / $EdgeProfileDir を優先検索" -ForegroundColor DarkCyan }
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
# 3. Edge + Chrome の全プロファイル Cookies DB を列挙
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "► [3/4] Enumerating Edge + Chrome Cookies databases..." -ForegroundColor Yellow

$allCandidates = [System.Collections.Generic.List[object]]::new()

# ブラウザルートと表示名のテーブル
$browsers = @(
    [pscustomobject]@{ Name = "Edge";   Root = "$env:LOCALAPPDATA\Microsoft\Edge\User Data" },
    [pscustomobject]@{ Name = "Chrome"; Root = "$env:LOCALAPPDATA\Google\Chrome\User Data"  }
)

foreach ($browser in $browsers) {
    $bRoot = $browser.Root
    if (-not (Test-Path $bRoot)) {
        Write-Host "  (skip) $($browser.Name): $bRoot not found" -ForegroundColor DarkGray
        continue
    }

    # プロファイルディレクトリを収集
    $profileDirs = [System.Collections.Generic.List[string]]::new()
    $profileDirs.Add("Default")

    Get-ChildItem -Path $bRoot -Filter "Profile *" -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name |
        ForEach-Object { $profileDirs.Add($_.Name) }

    $guestPath = Join-Path $bRoot "Guest Profile"
    if (Test-Path $guestPath) { $profileDirs.Add("Guest Profile") }

    foreach ($pName in $profileDirs) {
        $pPath = Join-Path $bRoot $pName
        if (-not (Test-Path $pPath)) { continue }

        # Network\Cookies を優先、次に Cookies
        foreach ($cookieRel in @("Network\Cookies", "Cookies")) {
            $fullPath = Join-Path $pPath $cookieRel
            if (Test-Path $fullPath) {
                $allCandidates.Add([pscustomobject]@{
                    Browser = $browser.Name
                    Profile = $pName
                    DbPath  = $fullPath
                })
            }
        }
    }
}

if ($allCandidates.Count -eq 0) {
    Write-Host "  ✗ Cookies DB が一つも見つかりません。" -ForegroundColor Red
    Write-Host "  Edge または Chrome がインストールされているか確認してください。" -ForegroundColor Yellow
    exit 1
}

# EdgeProfileDir が指定されている場合、そのプロファイルを先頭に並べ替え
$priorityCandidates = [System.Collections.Generic.List[object]]::new()
$otherCandidates    = [System.Collections.Generic.List[object]]::new()

foreach ($c in $allCandidates) {
    if ($EdgeProfileDir -and $c.Browser -eq "Edge" -and $c.Profile -eq $EdgeProfileDir) {
        $priorityCandidates.Add($c)
    } else {
        $otherCandidates.Add($c)
    }
}

if ($EdgeProfileDir -and $priorityCandidates.Count -eq 0) {
    Write-Host "  ⚠ Edge / $EdgeProfileDir の DB が見つかりません。全プロファイルを検索します。" -ForegroundColor Yellow
}

$candidates = [System.Collections.Generic.List[object]]::new()
foreach ($c in $priorityCandidates) { $candidates.Add($c) }
foreach ($c in $otherCandidates)    { $candidates.Add($c) }

Write-Host "  Found $($candidates.Count) DB candidate(s):" -ForegroundColor Gray
foreach ($c in $candidates) {
    Write-Host "    [$($c.Browser) / $($c.Profile)]  $($c.DbPath)" -ForegroundColor DarkGray
}

# ─────────────────────────────────────────────────────────────────────────────
# 4. 全 DB を走査して line_* cookies を検索（打ち切りなし）
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "► [4/4] Searching ALL DBs for line cookies..." -ForegroundColor Yellow

# WHERE 句: デフォルトは session + cb 系。-AllLine で全 line_*
if ($AllLine) {
    $whereClause = "name LIKE 'line_%'"
} else {
    $whereClause = "name IN ('line_session', 'line_uid', 'line_return_to') OR name LIKE 'line_cb%'"
}
# host_key|name|path|expires_utc|value_len|enc_len|has_value
$sqlQuery = "SELECT host_key, name, path, expires_utc, LENGTH(value) AS value_len, LENGTH(encrypted_value) AS enc_len, CASE WHEN LENGTH(value) > 0 OR LENGTH(encrypted_value) > 0 THEN 1 ELSE 0 END AS has_value FROM cookies WHERE $whereClause ORDER BY expires_utc DESC;"

$tmpDb                   = Join-Path $env:TEMP "edge_cookies_verify_tmp.db"
$lineSessionFoundDb      = $null
$lineSessionFoundBrowser = $null
$lineSessionFoundProfile = $null
$lineSessionRow          = $null
$lineCbOkDoneDb          = $null
$lineCbOkDoneBrowser     = $null
$lineCbOkDoneProfile     = $null
$cbStepCookies           = [System.Collections.Generic.List[string]]::new()

foreach ($candidate in $candidates) {
    Write-Host ""
    Write-Host "  ── [$($candidate.Browser) / $($candidate.Profile)]" -ForegroundColor DarkCyan
    Write-Host "     $($candidate.DbPath)" -ForegroundColor DarkGray

    try {
        Copy-Item -Path $candidate.DbPath -Destination $tmpDb -Force
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

    if ($dbRows.Count -eq 0) {
        Write-Host "    (no cookies matched)" -ForegroundColor DarkYellow
    } else {
        foreach ($row in $dbRows) {
            $p        = $row -split "\|"
            $name     = if ($p.Count -gt 1) { $p[1] } else { "" }
            $hasValue = if ($p.Count -gt 6) { $p[6] } else { "0" }

            # 表示色
            if     ($name -eq "line_session")         { $color = if ($hasValue -eq "1") { "Green" } else { "DarkYellow" } }
            elseif ($name -like "line_cb_ok_*")       { $color = "Green"   }
            elseif ($name -like "line_cb_ng_*")       { $color = "Red"     }
            elseif ($name -eq "line_cb")              { $color = "Magenta" }
            elseif ($name -eq "line_uid")             { $color = "Cyan"    }
            elseif ($name -eq "line_return_to")       { $color = "Yellow"  }
            else                                      { $color = "Gray"    }

            Write-Host "    $row" -ForegroundColor $color

            # line_session 検出
            if ($name -eq "line_session" -and $hasValue -eq "1") {
                if ($null -eq $lineSessionFoundDb) {
                    $lineSessionFoundDb      = $candidate.DbPath
                    $lineSessionFoundBrowser = $candidate.Browser
                    $lineSessionFoundProfile = $candidate.Profile
                    $lineSessionRow          = $row
                }
            }

            # line_cb_* 診断 cookie 収集
            if ($name -like "line_cb_*" -and $hasValue -eq "1") {
                if ($cbStepCookies -notcontains $name) {
                    $cbStepCookies.Add($name)
                }
                # line_cb_ok_done を別途記録
                if ($name -eq "line_cb_ok_done" -and $null -eq $lineCbOkDoneDb) {
                    $lineCbOkDoneDb      = $candidate.DbPath
                    $lineCbOkDoneBrowser = $candidate.Browser
                    $lineCbOkDoneProfile = $candidate.Profile
                }
            }
        }
    }

    Remove-Item $tmpDb -Force -ErrorAction SilentlyContinue
    # ★ break なし：全 DB を走査し続ける
}

# ─────────────────────────────────────────────────────────────────────────────
# 5. 診断 cookie (line_cb_*) の解析・表示
# ─────────────────────────────────────────────────────────────────────────────
if ($cbStepCookies.Count -gt 0) {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Host " 診断 cookie (line_cb_*) 解析結果" -ForegroundColor Magenta
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    foreach ($cbName in $cbStepCookies) {
        $cbStep  = $cbName -replace "^line_cb_", ""
        $cbDesc  = if ($cbStepMap.ContainsKey($cbStep)) { $cbStepMap[$cbStep] } else { "(不明なステップ: $cbStep)" }
        $cbColor = if ($cbName -like "line_cb_ok_*") { "Green" } else { "Red" }
        Write-Host ""
        Write-Host "  cookie : $cbName" -ForegroundColor $cbColor
        Write-Host "  step   : $cbStep" -ForegroundColor $cbColor
        Write-Host "  meaning: $cbDesc" -ForegroundColor White
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# 6. 最終判定
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""

$hasOkDoneCb = $cbStepCookies -contains "line_cb_ok_done"
$hasNgCb     = @($cbStepCookies | Where-Object { $_ -like "line_cb_ng_*" }).Count -gt 0

if ($null -ne $lineSessionFoundDb) {
    # ─── OK: line_session 発見 ───────────────────────────────────────────
    Write-Host "✅  OK: line_session found (has_value=1)" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Browser : $lineSessionFoundBrowser" -ForegroundColor Cyan
    Write-Host "  Profile : $lineSessionFoundProfile" -ForegroundColor Cyan
    Write-Host "  DB      : $lineSessionFoundDb" -ForegroundColor Cyan
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

} elseif ($hasOkDoneCb) {
    # ─── OK (via line_cb_ok_done): callback 成功の確認 ──────────────────
    Write-Host "✅  OK (line_cb_ok_done): callback が成功しています。" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Browser : $lineCbOkDoneBrowser" -ForegroundColor Cyan
    Write-Host "  Profile : $lineCbOkDoneProfile" -ForegroundColor Cyan
    Write-Host "  DB      : $lineCbOkDoneDb" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  line_session の enc_len が 0 の可能性があります。" -ForegroundColor Yellow
    Write-Host "  実際の /admin アクセスで動作確認してください。" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  → enable-require-line-auth.ps1 を実行して認証ゲートを有効化できます。" -ForegroundColor Cyan
    exit 0

} elseif ($hasNgCb) {
    # ─── NG: 診断 cookie から原因特定済み ────────────────────────────────
    Write-Host "❌  NG: line_session missing" -ForegroundColor Red
    Write-Host "    上の「診断 cookie 解析結果」セクションに原因が表示されています。" -ForegroundColor Yellow
    Write-Host "    そこに記載の対処を行ってから open-line-login.ps1 を再実行してください。" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  debug=1 で詳細確認:" -ForegroundColor DarkGray
    $state64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes('{"tenantId":"default","returnTo":"/admin/settings"}'))
    Write-Host "  curl.exe -sS `"https://saas-factory-web-v2.pages.dev/api/auth/line/callback?debug=1&code=dummy&state=$state64`" | ConvertFrom-Json | Format-List" -ForegroundColor DarkGray
    Write-Host ""
    exit 2

} else {
    # ─── NG: 何も見つからない ────────────────────────────────────────────
    $totalDbs = $candidates.Count
    Write-Host "❌  NG: line_session も line_cb_* も見つかりません" -ForegroundColor Red
    Write-Host "    検索した DB 数: $totalDbs" -ForegroundColor DarkYellow
    Write-Host ""
    Write-Host "  考えられる原因：" -ForegroundColor Yellow
    Write-Host "  1. LINE ログインがまだ完了していない。" -ForegroundColor Yellow
    Write-Host "     → open-line-login.ps1 を実行してログインしてください。" -ForegroundColor White
    Write-Host ""
    Write-Host "  2. ログインに使ったプロファイルが違う。" -ForegroundColor Yellow
    Write-Host "     → -AllLine で全 line_% cookie を表示して手がかりを探す。" -ForegroundColor White
    Write-Host "       .\scripts\ops\verify-line-session.ps1 -AllLine" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  3. callback route が診断 cookie 未対応（古いデプロイ）。" -ForegroundColor Yellow
    Write-Host "     → Pages の最新デプロイを確認して再試行。" -ForegroundColor White
    Write-Host ""
    Write-Host "  4. Edge の別プロファイルを指定して再試行：" -ForegroundColor Yellow
    Write-Host "     .\scripts\ops\open-line-login.ps1 -ProfileDir `"Profile 1`"" -ForegroundColor DarkGray
    Write-Host ""
    exit 2
}
