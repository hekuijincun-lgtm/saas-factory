# Phase 0.6 運用硬化 Runbook

> 対象リポジトリ: saas-factory
> 対象ファイル: `apps/api/src/index.ts`, `apps/api/wrangler.toml`
> 目的: staging から安全に CORS 絞り込みと admin 認証を段階導入し、production へ展開する

---

## 概要

Phase 0.6 で導入した変更:

| 機能 | 内容 |
|------|------|
| CORS | `hono/cors` で動的 allowlist を実装。pages.dev の許可粒度を env var で制御可能 |
| admin 認証 | `/admin/*` に `X-Admin-Token` 認証を追加。`REQUIRE_ADMIN_TOKEN=1` で未設定も強制ブロック |

---

## CORS env var の設計方針（B案: デフォルト安全）

| env var | 役割 | デフォルト挙動 |
|---------|------|--------------|
| `ADMIN_WEB_BASE` | この URL の origin を CORS 許可 | 未設定 → 効果なし |
| `ADMIN_ALLOWED_ORIGINS` | カンマ区切りで追加 origin を許可 | 未設定 → 効果なし |
| `PAGES_DEV_ALLOWED_SUFFIX` | 指定サフィックスに一致する pages.dev のみ許可 | 未設定 → pages.dev を拒否 |
| `ALLOW_PAGES_DEV_WILDCARD` | `"1"` で `*.pages.dev` を全許可（staging 限定） | 未設定 → 拒否 |

**localhost/127.0.0.1:3000 は env 不要で常に許可される。**

---

## staging 導入手順（この順番で実施する）

### Step 1: ADMIN_TOKEN を設定する

```bash
# staging に ADMIN_TOKEN を設定（プロンプトにトークン文字列を入力）
wrangler secret put ADMIN_TOKEN --env staging

# ローカル開発用: apps/api/.dev.vars に以下を追記
# ADMIN_TOKEN=my-local-dev-token
```

動作確認:

```bash
# wrangler dev 起動
cd apps/api
npx wrangler dev --port 8787

# トークンなし → 401
curl -s http://127.0.0.1:8787/admin/settings?tenantId=default
# 期待: {"ok":false,"error":"Unauthorized"}

# トークンあり → 200
curl -s http://127.0.0.1:8787/admin/settings?tenantId=default \
  -H "X-Admin-Token: my-local-dev-token"
# 期待: {"ok":true,...}
```

PowerShell:

```powershell
# トークンなし → 401
Invoke-RestMethod "http://127.0.0.1:8787/admin/settings?tenantId=default"

# トークンあり → 200
Invoke-RestMethod "http://127.0.0.1:8787/admin/settings?tenantId=default" `
  -Headers @{ "X-Admin-Token" = "my-local-dev-token" }
```

---

### Step 2: REQUIRE_ADMIN_TOKEN=1 を staging に設定する

ADMIN_TOKEN が確実に設定されてから実施する（順序を守ること）。

```bash
# staging に必須化フラグを設定
wrangler secret put REQUIRE_ADMIN_TOKEN --env staging
# プロンプトに: 1

# staging にデプロイ
wrangler deploy --env staging
```

動作確認:

```bash
# ADMIN_TOKEN を外して REQUIRE_ADMIN_TOKEN=1 だけある状態をシミュレート
# → .dev.vars の ADMIN_TOKEN をコメントアウトして wrangler dev を再起動

curl -s http://127.0.0.1:8787/admin/settings?tenantId=default
# 期待: {"ok":false,"error":"Service misconfigured: admin token not set"} HTTP 503
```

---

### Step 3: CORS を pages.dev プロジェクト限定に絞る

```bash
# wrangler.toml の [env.staging] vars に追加（実際の URL に合わせること）
# PAGES_DEV_ALLOWED_SUFFIX = ".saas-factory-web-v2.pages.dev"
# ADMIN_WEB_BASE = "https://saas-factory-web-v2.pages.dev"

# デプロイ
wrangler deploy --env staging
```

動作確認（OPTIONS preflight）:

```bash
# ✅ プロジェクト内の pages.dev origin → 許可
curl -sv -X OPTIONS https://saas-factory-api-staging.<subdomain>.workers.dev/admin/settings \
  -H "Origin: https://abc123.saas-factory-web-v2.pages.dev" \
  -H "Access-Control-Request-Method: GET" \
  2>&1 | grep "Access-Control"
# 期待: Access-Control-Allow-Origin: https://abc123.saas-factory-web-v2.pages.dev

# ❌ 別プロジェクトの pages.dev origin → 拒否
curl -sv -X OPTIONS https://saas-factory-api-staging.<subdomain>.workers.dev/admin/settings \
  -H "Origin: https://attacker.pages.dev" \
  2>&1 | grep "Access-Control"
# 期待: (Access-Control-Allow-Origin ヘッダーが返らない)
```

PowerShell:

```powershell
# プロジェクト内 pages.dev → 許可
$r = Invoke-WebRequest -Method OPTIONS `
  "http://127.0.0.1:8787/admin/settings" `
  -Headers @{
    "Origin" = "https://abc123.saas-factory-web-v2.pages.dev"
    "Access-Control-Request-Method" = "GET"
  } -UseBasicParsing
$r.Headers["Access-Control-Allow-Origin"]
# 期待: https://abc123.saas-factory-web-v2.pages.dev

# 不正 origin → ヘッダーなし
$r2 = Invoke-WebRequest -Method OPTIONS `
  "http://127.0.0.1:8787/admin/settings" `
  -Headers @{ "Origin" = "https://attacker.pages.dev" } `
  -UseBasicParsing
$r2.Headers["Access-Control-Allow-Origin"]
# 期待: (空)
```

---

### Step 4: localhost / ADMIN_WEB_BASE の CORS 動作確認

```bash
# localhost → 常に許可
curl -sv -X OPTIONS http://127.0.0.1:8787/admin/settings \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" \
  2>&1 | grep "Access-Control-Allow-Origin"
# 期待: Access-Control-Allow-Origin: http://localhost:3000

# ADMIN_WEB_BASE に設定した origin → 許可
curl -sv -X OPTIONS http://127.0.0.1:8787/admin/settings \
  -H "Origin: https://saas-factory-web-v2.pages.dev" \
  2>&1 | grep "Access-Control-Allow-Origin"
# 期待: Access-Control-Allow-Origin: https://saas-factory-web-v2.pages.dev
```

---

## production 展開手順

staging で上記 Step 1〜4 が問題なく通過してから実施する。

```bash
# ADMIN_TOKEN を production に設定
wrangler secret put ADMIN_TOKEN --env production

# REQUIRE_ADMIN_TOKEN を production に設定
wrangler secret put REQUIRE_ADMIN_TOKEN --env production
# プロンプトに: 1

# wrangler.toml の [env.production] に ADMIN_WEB_BASE を追加してからデプロイ
# ADMIN_WEB_BASE = "https://admin.example.com"  # 実際の本番 URL
wrangler deploy --env production
```

---

## ロールバック手順

### CORS ロールバック

```bash
# PAGES_DEV_ALLOWED_SUFFIX を削除して wildcard に戻す場合
# wrangler.toml から PAGES_DEV_ALLOWED_SUFFIX を削除し再デプロイ
wrangler deploy --env staging

# ALLOW_PAGES_DEV_WILDCARD=1 で一時的に全許可に戻す場合
# wrangler.toml [env.staging] vars に追加:
# ALLOW_PAGES_DEV_WILDCARD = "1"
wrangler deploy --env staging
```

### admin 認証ロールバック

```bash
# REQUIRE_ADMIN_TOKEN を削除（認証は残るが「未設定で503」は解除）
wrangler secret delete REQUIRE_ADMIN_TOKEN --env staging

# ADMIN_TOKEN も削除（完全に認証なしに戻す・緊急時のみ）
wrangler secret delete ADMIN_TOKEN --env staging
wrangler deploy --env staging
```

### コードロールバック

```bash
# 直前のコミットに戻す（git revert で安全に）
git revert HEAD
git push origin main
wrangler deploy --env staging
```

---

## 本番適用前チェックリスト

staging で以下をすべて確認してからチェックを入れ、production 展開する。

```
[ ] localhost:3000 から /admin/settings への OPTIONS preflight が 200 で返る
    Access-Control-Allow-Origin: http://localhost:3000 が確認できる

[ ] PAGES_DEV_ALLOWED_SUFFIX に設定したプロジェクト固有サフィックスの pages.dev origin
    が CORS 許可される

[ ] 別プロジェクト / 不正な pages.dev origin が CORS 拒否される（ヘッダーなし）

[ ] X-Admin-Token なし → 401 が返る

[ ] 正しい X-Admin-Token あり → 200 が返る

[ ] ADMIN_TOKEN 未設定 + REQUIRE_ADMIN_TOKEN=1 → 503 が返る

[ ] ALLOW_PAGES_DEV_WILDCARD が production env に設定されていないこと
    （wrangler secret list --env production で確認）

[ ] wrangler.toml の [vars] / [env.*.vars] に ADMIN_TOKEN の実値が含まれていないこと
    （git diff で確認）

[ ] git log で Phase 0.6 コミットが main に取り込まれていること

[ ] wrangler deploy --env production 後、本番 URL への preflight が通ること
```

---

## 参考: .dev.vars テンプレート（ローカル開発用）

`apps/api/.dev.vars`（gitignore 済みであること）:

```ini
# ローカル開発用 env vars（コミットしないこと）
ADMIN_TOKEN=my-local-dev-token

# pages.dev を絞りたい場合（任意）
# PAGES_DEV_ALLOWED_SUFFIX=.saas-factory-web-v2.pages.dev

# wildcard を試したい場合（任意・ローカルのみ）
# ALLOW_PAGES_DEV_WILDCARD=1

# REQUIRE_ADMIN_TOKEN はローカルでは通常不要
# REQUIRE_ADMIN_TOKEN=1
```
