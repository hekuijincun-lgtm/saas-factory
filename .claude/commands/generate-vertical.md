あなたはSaaS Factoryの自動プロダクト生成エージェントです。
以下を1回の実行で完了させてください。時間がかかっても構いません。すべてのステップを省略せずフルで実装してください。

# 実行フロー

## 1. 既存ヴァーティカルの確認
- apps/web/app/lp/[vertical]/page.tsx の LP辞書キーを確認
- apps/web/app/demo/ 配下のディレクトリを確認
- apps/api/src/agents/agents/ 配下のファイルを確認
- 既に実装済みのヴァーティカルを把握し、以降で除外する

## 2. 市場調査
日本のB2B小規模事業者市場で、以下の条件を満たす業界を5つ選出:
- IT化が遅れている
- 人手不足
- 1件あたりの単価が高い
- 繰り返し作業がある
- AI Agent で自動化できるペインがある
- **既に実装済みのヴァーティカルは除外する**

## 3. スコアリング＆選定
収益性・実装速度・営業しやすさ・競合の弱さで各10点、合計最高の1つを選定。
プロダクト名（日本語 + 英語）も決定する。

## 4. バックエンド実装
- apps/api/src/agents/agents/ に新しいエージェントファイルを作成
  - 価格マトリクス（カテゴリ×オプション）をエージェント内に定義
  - ステップ: parse → estimate → present → followup の最低4ステップ
- apps/api/src/agents/types.ts の AgentType union に追加
- apps/api/src/agents/registry.ts に import + 登録
- apps/api/src/ai/prompt-registry.ts にプロンプト追加（最低2つ: parse + present）

## 5. LP実装
- apps/web/app/lp/[vertical]/page.tsx の LP辞書に新しいヴァーティカルを追加
  - label, badge, headline, subheadline
  - problems (5個), features (6個), flow (3ステップ), faqs (4個)
  - metaTitle, metaDesc

## 6. デモUI実装（必須）
- apps/web/app/demo/{vertical名}/page.tsx — Server Component (metadata + layout)
- apps/web/app/demo/{vertical名}/{ComponentName}Demo.tsx — Client Component ('use client')
  - 入力フォーム（テキスト入力 + カテゴリ選択の2モード）
  - 例文クリック機能（6パターン以上）
  - AI解析シミュレーション（クライアントサイドの分類ロジック）
  - 見積もり結果の詳細表示（内訳・合計・作業時間）
  - AI返信メッセージプレビュー
  - CTA（登録ボタン → /signup?vertical=xxx）

## 7. 管理画面実装（必須・フル）

### 7a. ダッシュボード
- apps/web/app/admin/{vertical名}/page.tsx — 'use client'
- 表示項目:
  - 今日の問い合わせ数
  - 今週の見積もり数・成約数・成約率
  - 月間売上推移（簡易グラフ or 数値表示）
  - 直近の問い合わせリスト（5件）
  - Agent実行ステータスサマリー
- データ取得: GET /admin/agents/logs を fetch して集計
- useAdminTenantId() でテナントID取得

### 7b. 問い合わせ・見積もり履歴
- apps/web/app/admin/{vertical名}/inquiries/page.tsx — 'use client'
- テーブル表示:
  - 日時、カテゴリ、見積もり金額、ステータス（新規/見積済/成約/失注）
  - 元メッセージ展開（クリックで詳細）
  - AI返信内容の表示
- フィルター: ステータス、日付範囲
- データ取得: GET /admin/agents/logs?agentId= を fetch

### 7c. 料金テーブル設定
- apps/web/app/admin/{vertical名}/pricing/page.tsx — 'use client'
- カテゴリ一覧（基本料金・単位・所要時間）の編集フォーム
- オプション一覧（名前・追加料金）の編集フォーム
- 保存ボタン → KV settings:{tenantId}.{vertical}.pricing に保存
- API: PUT /admin/settings の既存エンドポイントを利用

### 7d. AI応答設定
- apps/web/app/admin/{vertical名}/ai-config/page.tsx — 'use client'
- 設定項目:
  - AI自動応答 ON/OFF
  - 応答トーン（丁寧/カジュアル/プロフェッショナル）
  - 営業時間外メッセージ
  - 見積もり後フォローアップ: ON/OFF + 遅延時間（時間単位）
- 保存 → KV settings:{tenantId}.agents.{vertical} に保存

### 7e. サイドバーナビゲーション追加
- apps/web/app/admin/nav.config.ts に新しいヴァーティカルのナビ項目を追加
  - { label: "{ヴァーティカル名}", href: "/admin/{vertical名}" }
  - サブメニュー: 履歴、料金設定、AI設定

## 8. 導線接続
- LP の「デモを見る」ボタン → /demo/{vertical名}
- LP の「無料で始める」ボタン → /signup?vertical={vertical名}
- デモUI の「無料で始める」ボタン → /signup?vertical={vertical名}
- 管理画面のダッシュボード → 履歴/設定への内部リンク

## 9. 検証（必須・省略禁止）
以下をすべて実行し、エラーがあれば修正してから次に進む:
1. cd apps/api && npx wrangler deploy --dry-run — Workers ビルド確認
2. apps/web/node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json — 型チェック
3. pnpm -C apps/web run build — Webビルド。**新ルートが出力に含まれるか grep で確認**
4. echo "v{N}-{vertical名}-$(date +%Y%m%d)" > apps/web/.force-pages-rebuild.txt

ルール:
- 内部リンクは必ず next/link の <Link> を使う。<a href="/..."> は ESLint がビルドを止めるので絶対に使わない
- ビルドが通るまでデプロイしない

## 10. デプロイ
- cd apps/api && node_modules/.bin/wrangler deploy --env production
- powershell.exe -Command "cd C:\dev\saas-factory; git add -A"
- powershell.exe -Command "cd C:\dev\saas-factory; git commit -F '\\\\wsl.localhost\\Ubuntu\\tmp\\commit-msg.txt'"
- powershell.exe -Command "cd C:\dev\saas-factory; git push"
- GitHub Actions の "Deploy Web" ワークフローが success になるまで gh run list で確認

## 11. 営業素材
- DM営業文（100字以内、デモURL付き）
- メール営業文（件名 + 本文、デモURL付き）
- LINE営業文（3行以内、デモURL付き）

## 12. レポート出力
- 選定ヴァーティカル
- プロダクト名
- Agent構成（steps + prompts）
- フロントエンド構成（LP + デモ + 管理画面ページ一覧）
- 追加/修正ファイル一覧
- デプロイ結果（Workers version + Pages deploy status）
- 公開URL（LP + デモ + 管理画面）
- 想定MRR（3ヶ月/6ヶ月/12ヶ月）
