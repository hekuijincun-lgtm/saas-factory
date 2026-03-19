# SaaS Factory

## プロジェクト概要
マルチテナント型SaaS基盤。ヴァーティカル特化のAI Agent SaaSを量産する。

## 技術スタック
- **API**: Cloudflare Workers (Hono) — `apps/api/`
- **Web**: Next.js 15 on Cloudflare Pages — `apps/web/`
- **DB**: D1 (SQLite), KV, R2
- **AI**: AI Core (`apps/api/src/ai/`) — OpenAI + Gemini 統一インターフェース
- **Agent**: Agent Core (`apps/api/src/agents/`) — ステップベース実行フレームワーク

## ビルド・デプロイ
```bash
# Workers
cd apps/api && node_modules/.bin/wrangler deploy --env production

# Web (ビルド確認)
pnpm -C apps/web run build

# TypeScript
apps/web/node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json

# Git (WSLからはpowershell経由)
powershell.exe -Command "cd C:\dev\saas-factory; git add ...; git commit -F '\\\\wsl.localhost\\Ubuntu\\tmp\\msg.txt'"
powershell.exe -Command "cd C:\dev\saas-factory; git push"
```

## 新ページ追加時の必須チェック（404防止）
1. 内部リンクは `<Link>` (next/link) のみ。`<a href="/...">` は ESLint が拒否しビルド失敗する
2. ビルド後に `grep "ルート名"` で出力にルートが含まれるか確認
3. `.force-pages-rebuild.txt` を更新してキャッシュ無効化
4. GitHub Actions の "Deploy Web" が **success** になってからURLを案内する

## カスタムコマンド
- `/generate-vertical` — 新しいヴァーティカルSaaSを市場調査→実装→デプロイまで自動実行
