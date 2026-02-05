# SaaS Factory API セットアップガイド

## ローカル開発環境のセットアップ

### 1. 依存関係のインストール

```bash
cd apps/api
pnpm install
```

### 2. CONFIG_ENC_KEY の設定

`CONFIG_ENC_KEY` は LINE 設定の暗号化に使用される 32 バイト（256 ビット）のマスターキーです。

#### ローカル開発環境（.dev.vars）

`apps/api/.dev.vars` ファイルに以下を追加：

```bash
CONFIG_ENC_KEY=<base64エンコードされた32バイトのキー>
```

**キー生成方法（PowerShell）:**

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }))
```

**キー生成方法（Node.js）:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

#### 本番環境（Wrangler Secrets）

```bash
cd apps/api

# トップレベル（デフォルト環境）
pnpm wrangler secret put CONFIG_ENC_KEY --config ./wrangler.toml --env ""

# staging 環境
pnpm wrangler secret put CONFIG_ENC_KEY --config ./wrangler.toml --env staging

# production 環境
pnpm wrangler secret put CONFIG_ENC_KEY --config ./wrangler.toml --env production
```

**注意:** `CONFIG_ENC_KEY` は base64 デコードして 32 バイト（256 ビット）である必要があります。

### 3. ローカル開発サーバーの起動

```bash
cd apps/api
pnpm wrangler dev --config ./wrangler.toml --env "" --ip 127.0.0.1 --port 8787 --persist-to .wrangler/state --log-level debug
```

### 4. 動作確認

#### 疎通確認

```powershell
# PowerShell
iwr "http://127.0.0.1:8787/ping" | % Content
# 期待結果: pong
```

#### スロット取得API（プロキシ経由）

```powershell
# PowerShell
iwr "http://localhost:3000/api/proxy/slots?date=2026-01-05&tenantId=default" -SkipHttpErrorCheck | % StatusCode
# 期待結果: 200

# レスポンス内容を確認
iwr "http://localhost:3000/api/proxy/slots?date=2026-01-05&tenantId=default" -SkipHttpErrorCheck | % Content
```

## トラブルシューティング

### CONFIG_ENC_KEY エラー

**エラー:** `CONFIG_ENC_KEY must be exactly 32 bytes (256 bits) when base64 decoded`

**原因:** キーが 32 バイトではない、または base64 エンコードが不正

**解決方法:**
1. 新しいキーを生成（上記のコマンドを使用）
2. `.dev.vars` または `wrangler secret put` で再設定
3. 開発サーバーを再起動

### タイムアウトエラー

**エラー:** `Request timeout after 30000ms`

**原因:** Worker API への接続がタイムアウト

**解決方法:**
1. Worker 開発サーバーが起動しているか確認
2. `BOOKING_API_BASE` 環境変数が正しく設定されているか確認
3. `/api/proxy/slots` が正しく動作しているか確認

### Invalid time value エラー

**エラー:** `RangeError: Invalid time value`

**原因:** 日付処理で Invalid Date が発生

**解決方法:**
- `CustomerBookingApp.tsx` の `safeDate()` と `formatYmdLocal()` 関数を使用
- `toISOString()` の代わりに `formatYmdLocal()` を使用

## 環境変数

### ローカル開発

- `.dev.vars` ファイルに設定（自動的に読み込まれる）

### 本番環境

- `wrangler secret put` コマンドで設定
- 環境ごとに個別に設定が必要

## 関連ファイル

- `wrangler.toml`: Wrangler 設定ファイル
- `.dev.vars`: ローカル開発用環境変数（gitignore に追加推奨）
- `src/crypto.ts`: 暗号化ユーティリティ
- `src/line/config.ts`: LINE 設定管理

