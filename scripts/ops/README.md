# scripts/ops — LINE 認証セットアップ ツール集

LINE ログインによる管理者認証（`REQUIRE_LINE_AUTH=1`）を安全に設定するための
PowerShell 7 スクリプト群です。

---

## 通常フロー（3 ステップ）

```
1. .\scripts\ops\open-line-login.ps1
   └─ Edge (Default プロファイル) で LINE ログイン URL を開く
   └─ Enter x2 → Edge 終了 → verify を自動実行

2. verify-line-session.ps1 が自動実行される
   └─ Edge + Chrome の全プロファイル Cookies DB を走査
   └─ line_session または line_cb_* 診断 cookie を確認
   └─ exit 0 → 手順 3 へ / exit 2 → 原因を確認して再試行

3. .\scripts\ops\enable-require-line-auth.ps1
   └─ verify exit 0 を確認後に REQUIRE_LINE_AUTH=1 を Pages に設定
   └─ 以降すべての /admin/* アクセスに LINE ログインが必要になる
```

---

## スクリプト一覧

| スクリプト | 役割 |
|---|---|
| `open-line-login.ps1` | Edge 起動 → LINE ログイン → verify 自動実行 |
| `verify-line-session.ps1` | Edge/Chrome 全プロファイル DB で line_session を確認 |
| `enable-require-line-auth.ps1` | REQUIRE_LINE_AUTH=1 を Cloudflare Pages 環境変数に設定 |
| `diag-line-callback.ps1` | (補助) callback URL を手動 curl してヘッダーを確認 |

---

## 診断 cookie (line_cb_*) の仕組み

`callback/route.ts` はすべての return 経路で 2 種類の診断信号を設定します。

```
x-line-cb-step: <stepLabel>          # HTTP レスポンスヘッダー（curl で確認可）
Set-Cookie: line_cb=<value>          # cookie value（DPAPI 暗号化される）
Set-Cookie: line_cb_<step>=1         # cookie name に step を埋め込む（SQLite の name 列 = 平文）
```

Chromium は cookie の **value** を DPAPI で暗号化しますが、**name** 列は SQLite に平文保存されます。
`verify-line-session.ps1` は name 列を読むだけで原因を特定できます。

| cookie name | 意味 |
|---|---|
| `line_cb_ok_done` | ログイン成功（line_session もセットされているはず）|
| `line_cb_ok_debug` | debug=1 モード（session cookie はセットされない）|
| `line_cb_ng_missing_code` | code/state パラメータ欠落 |
| `line_cb_ng_bad_state` | state の Base64/JSON 解析失敗 |
| `line_cb_ng_exchange_failed` | LINE token exchange 失敗 → LINE_LOGIN_CHANNEL_SECRET を確認 |
| `line_cb_ng_unauthorized` | userId が allowedAdminLineUserIds に未登録 |
| `line_cb_ng_secret_missing` | LINE_SESSION_SECRET が Pages 環境変数に未設定 |
| `line_cb_ng_exception` | callback で予期しない例外 |

---

## 実行例

### ケース 1: 正常 (OK)

LINE ログインが成功し、`line_session` が Edge Default プロファイルに保存された場合。

```
PS C:\dev\saas-factory> .\scripts\ops\open-line-login.ps1

╔══════════════════════════════════════════════════════════════╗
║              LINE Login Launcher  (open-line-login)          ║
╚══════════════════════════════════════════════════════════════╝

  Profile: Default

  LINE ログイン URL:
  https://saas-factory-web-v2.pages.dev/api/auth/line/start

  Edge: C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe

► Edge を起動します (--profile-directory="Default")...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  手順：
  1. Edge で LINE のログイン画面が開きます。
  2. LINE でログインしてください。
  3. /admin/settings または /admin/unauthorized にリダイレクト
     されたらログイン完了です。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

LINE ログイン完了後、Enter を押してください: [Enter]

┌──────────────────────────────────────────────────────────────┐
│  ⚠ 確認：URLバーが以下になっていることを確認してください。   │
│                                                               │
│    /admin/settings    または    /admin/unauthorized           │
│                                                               │
│  まだ LINE の画面やログイン画面の場合は                        │
│  Ctrl+C でキャンセルしてログインをやり直してください。        │
└──────────────────────────────────────────────────────────────┘

/admin/ に到達していることを確認したら Enter を押してください: [Enter]

► 3 秒待機中（cookie flush 対策）...
► Edge を終了して Cookies DB のロックを解除します...
  Stopped 8 Edge process(es).
► verify-line-session.ps1 を自動実行します...

╔══════════════════════════════════════════════════════════════╗
║       LINE Session Cookie Verifier  (verify-line-session)    ║
╚══════════════════════════════════════════════════════════════╝
  ヒント: Edge / Default を優先検索

► [1/4] Stopping Edge processes...
  Edge was not running.
► [2/4] Locating sqlite3...
  ✓ sqlite3: C:\Users\me\AppData\Local\Microsoft\WinGet\Packages\...\sqlite3.exe
► [3/4] Enumerating Edge + Chrome Cookies databases...
  Found 3 DB candidate(s):
    [Edge / Default]  C:\Users\me\AppData\Local\Microsoft\Edge\User Data\Default\Network\Cookies
    [Edge / Profile 1]  ...
    [Chrome / Default]  ...
► [4/4] Searching ALL DBs for line cookies...

  ── [Edge / Default]
     C:\Users\me\AppData\Local\Microsoft\Edge\User Data\Default\Network\Cookies
    host_key | name | path | expires_utc | value_len | enc_len | has_value
    .pages.dev|line_cb_ok_done|/|...|0|131|1
    .pages.dev|line_session|/|...|0|779|1

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 診断 cookie (line_cb_*) 解析結果
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  cookie : line_cb_ok_done
  step   : ok_done
  meaning: ✅ ログイン成功（line_session がセットされているはず）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅  OK: line_session found (has_value=1)

  Browser : Edge
  Profile : Default
  DB      : C:\Users\me\AppData\Local\Microsoft\Edge\User Data\Default\Network\Cookies
  host_key  : .pages.dev
  name      : line_session
  path      : /
  expires   : 13...
  value_len : 0
  enc_len   : 779
  has_value : 1

  → enable-require-line-auth.ps1 を実行して認証ゲートを有効化できます。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

LINE セッションを確認しました！次のコマンドで認証ゲートを有効化できます：

   .\scripts\ops\enable-require-line-auth.ps1
```

---

### ケース 2: NG — ng_exchange_failed (LINE_LOGIN_CHANNEL_SECRET 未設定)

LINE token exchange が失敗した場合。`line_cb_ng_exchange_failed` が検出されます。

```
► [4/4] Searching ALL DBs for line cookies...

  ── [Edge / Default]
     ...
    host_key | name | path | expires_utc | value_len | enc_len | has_value
    .pages.dev|line_cb_ng_exchange_failed|/|...|0|131|1
    .pages.dev|line_cb|/|...|0|131|1

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 診断 cookie (line_cb_*) 解析結果
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  cookie : line_cb_ng_exchange_failed
  step   : ng_exchange_failed
  meaning: ❌ LINE token exchange 失敗 → LINE_LOGIN_CHANNEL_SECRET を確認

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌  NG: line_session missing
    上の「診断 cookie 解析結果」セクションに原因が表示されています。
    そこに記載の対処を行ってから open-line-login.ps1 を再実行してください。

  debug=1 で詳細確認:
  curl.exe -sS "https://saas-factory-web-v2.pages.dev/api/auth/line/callback?debug=1&code=dummy&state=..." | ConvertFrom-Json | Format-List
```

**対処**: `LINE_LOGIN_CHANNEL_SECRET` を Workers に設定する。

```powershell
cd C:\dev\saas-factory\apps\api
node_modules\.bin\wrangler secret put LINE_LOGIN_CHANNEL_SECRET --env production
# → LINE Developers コンソールの Channel secret を入力
```

---

### ケース 3: 何も見つからない (wrong browser / ログイン未完了)

`line_session` も `line_cb_*` も見つからない場合。ログインが別プロファイルで行われた
可能性があります。

```
► [4/4] Searching ALL DBs for line cookies...

  ── [Edge / Default]
     ...
    (no cookies matched)

  ── [Edge / Profile 1]
     ...
    (no cookies matched)

  ── [Chrome / Default]
     ...
    (no cookies matched)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌  NG: line_session も line_cb_* も見つかりません
    検索した DB 数: 3

  考えられる原因：
  1. LINE ログインがまだ完了していない。
     → open-line-login.ps1 を実行してログインしてください。

  2. ログインに使ったプロファイルが違う。
     → -AllLine で全 line_% cookie を表示して手がかりを探す。
       .\scripts\ops\verify-line-session.ps1 -AllLine

  3. callback route が診断 cookie 未対応（古いデプロイ）。
     → Pages の最新デプロイを確認して再試行。

  4. Edge の別プロファイルを指定して再試行：
     .\scripts\ops\open-line-login.ps1 -ProfileDir "Profile 1"
```

**対処**: `-AllLine` で手がかりを探し、正しいプロファイルを特定して再実行。

```powershell
# 手がかりを探す
.\scripts\ops\verify-line-session.ps1 -AllLine

# 特定のプロファイルで再試行
.\scripts\ops\open-line-login.ps1 -ProfileDir "Profile 1"
```

---

## オプション一覧

### open-line-login.ps1

| パラメータ | 既定 | 説明 |
|---|---|---|
| `-ProfileDir` | `"Default"` | Edge プロファイルディレクトリ名 |

### verify-line-session.ps1

| パラメータ | 既定 | 説明 |
|---|---|---|
| `-AllLine` | (なし) | `name LIKE 'line_%'` で全 line_* cookie を表示 |
| `-EdgeProfileDir` | `""` | 優先検索する Edge プロファイル名（open-line-login から自動渡し）|

---

## 前提条件

- PowerShell 7 (`pwsh`) — PS5.1 では UTF-8 の日本語が化ける場合がある
- `sqlite3.exe` — `winget install SQLite.SQLite` でインストール可
- Microsoft Edge がインストールされていること
- LINE Developers にチャネル設定済みであること
