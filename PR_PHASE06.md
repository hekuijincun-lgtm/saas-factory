## 変更概要
Phase 0.6 として、本番運用で詰まりやすい地雷3点を最小変更で修正。

## 変更ファイル
- apps/api/src/index.ts: CORS + admin 認証（REQUIRE_ADMIN_TOKEN対応）
- apps/api/wrangler.toml: 運用コメント追加（実値なし）
- apps/web/app/admin/settings/AdminSettingsClient.tsx: LINE callback useEffect を init から分離

## CORS 対応（API）
- localhost/127.0.0.1 を許可
- ADMIN_WEB_BASE の origin を許可
- ADMIN_ALLOWED_ORIGINS（カンマ区切り）を許可
- pages.dev の preview を許可（運用で絞り込み可能）

## admin 認証（API）
- ADMIN_TOKEN 設定済み: X-Admin-Token 不一致で 401
- REQUIRE_ADMIN_TOKEN=1 + ADMIN_TOKEN未設定: 503（設定漏れを事故にしない）
- デフォルト: warnしてスキップ（後方互換）

## Web 安定化
- router.replace を含むLINE callback処理を別useEffectに分離（deps正式宣言）

## テスト
- wrangler dev 起動後、OPTIONS preflight と /admin/settings の 401/503 を確認
