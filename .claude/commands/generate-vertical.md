あなたはSaaS Factoryの自動プロダクト生成エージェントです。
以下を1回の実行で完了させてください。時間がかかっても構いません。すべてのステップを省略せずフルで実装してください。

# 実行フロー

## 1. 既存ヴァーティカルの確認
- apps/web/app/lp/[vertical]/page.tsx の LP辞書キーを確認
- apps/web/app/lp/_designs/shared.ts の VERTICAL_DESIGN マッピングを確認
- apps/api/src/vertical-templates.ts の VERTICAL_TEMPLATES キーを確認
- apps/web/app/demo/ 配下のディレクトリを確認
- apps/api/src/agents/agents/ 配下のファイルを確認
- apps/api/src/verticals/registry.ts の SPECIAL_FEATURE_CATALOG を確認
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
### 4a. Agent実装
- apps/api/src/agents/agents/ に新しいエージェントファイルを作成
  - 価格マトリクス（カテゴリ×オプション）をエージェント内に定義
  - ステップ: parse → estimate → present → followup の最低4ステップ
- apps/api/src/agents/types.ts の AgentType union に追加
- apps/api/src/agents/registry.ts に import + 登録
- apps/api/src/ai/prompt-registry.ts にプロンプト追加（最低2つ: parse + present）

### 4b. テンプレートデータ追加
- apps/api/src/vertical-templates.ts の VERTICAL_TEMPLATES に新ヴァーティカル追加
  - menus (6件): name, duration, price, description, category
  - staff (2-3名): name, role
  - faq (5件): question, answer (各2-3文)
  - aiCharacter: 業種専用AIペルソナ（2-3文のシステムプロンプト）
  - businessHours, closedWeekdays, verticalConfig

### 4c. VerticalType 統一更新（必須・漏れ禁止）
以下のすべてに新ヴァーティカルを追加:
- apps/api/src/settings.ts の VerticalType union
- apps/web/src/types/settings.ts の VerticalType union
- apps/api/src/settings.ts の LineAccountIndustry union
- apps/web/src/types/settings.ts の LineAccountIndustry union
- apps/api/src/index.ts の POST /auth/email/start 内の VALID_VERTICALS Set

### 4d. VerticalPlugin 登録（必須）
- apps/api/src/verticals/{vertical}.ts を作成（DEFAULT_REPEAT_TEMPLATE + ラベル + ヘルパー）
- apps/api/src/verticals/registry.ts に plugin 定義を追加（coreType: 'reservation' を必ず指定）
- apps/web/src/lib/verticalPlugins.ts に VerticalPluginUI を追加
- apps/api/src/verticals/crmMetadata.ts に VERTICAL_CAMPAIGNS を追加

### 4e. 業務特化機能の選定と実装（必須）

#### 4e-1. 特化機能の選定
業種の業務フローを分析し、SPECIAL_FEATURE_CATALOG から最適な特化機能を **最大3つ** 選定する。
カタログ（apps/api/src/verticals/registry.ts）に定義された suitableFor を参考にしつつ、
業種固有のペインに最も効く機能を優先的に選ぶ。

利用可能な特化機能キー:
- vaccineRecord: ワクチン・予防接種履歴（動物病院・ペット）
- progressRecord: 成績・進捗記録（学習塾・スクール）
- shootingManagement: 撮影カット数・データ管理（フォトスタジオ）
- treatmentBodyMap: 施術部位・症状マッピング（整体・マッサージ・歯科・エステ）
- colorFormula: カラー調合レシピ（美容・ネイル）
- equipmentCheck: 機器・器具チェックリスト（ジム・清掃・便利屋）
- beforeAfterPhoto: 施術前後写真（エステ・美容・ネイル）
- courseCurriculum: カリキュラム管理（スクール・塾）
- petProfile: ペットプロフィール（ペットサロン・動物病院）
- allergyRecord: アレルギー・禁忌記録（医療・エステ）
- visitSummary: 来店サマリー・施術メモ（全業種共通カルテ拡張）

選定基準:
1. その業種で **日常的に発生する業務** を自動化・効率化できるか
2. 既存の紙・Excel管理をデジタル化する価値があるか
3. 競合SaaSとの差別化ポイントになるか

カタログに無い業種固有の機能が必要な場合:
- SPECIAL_FEATURE_CATALOG に新しいキーを追加
- SpecialFeatureKey の union に追加（API + Web 両方）

#### 4e-2. プラグインへの登録
- apps/api/src/verticals/registry.ts の plugin 定義に `specialFeatures: [...]` を設定
- apps/web/src/lib/verticalPlugins.ts の VerticalPluginUI にも同じ `specialFeatures` を設定

#### 4e-3. 特化機能の管理画面実装（各機能につき1ページ以上）
選定した各特化機能ごとに管理画面ページを実装する:

**ファイル配置:**
- apps/web/app/admin/{vertical名}/{feature名}/page.tsx — 'use client'

**実装パターン（apps/web/app/admin/pet/ を参照）:**

| 特化機能 | 管理画面の実装内容 |
|---|---|
| vaccineRecord | ワクチン一覧テーブル + 期限アラート（赤/黄/緑）+ 登録フォーム |
| progressRecord | 生徒別進捗カード + 成績推移グラフ + メモ入力 |
| shootingManagement | 撮影データ一覧 + カット数/納品ステータス管理 |
| treatmentBodyMap | 人体図SVG + 部位タップで症状記録 + 履歴表示 |
| colorFormula | 顧客別レシピ一覧 + 薬剤名・配合比入力 + 前回レシピコピー |
| equipmentCheck | チェックリスト一覧 + 日次チェック記録 + 未点検アラート |
| beforeAfterPhoto | 写真アップロード（R2） + Before/After並列表示 + 日付ソート |
| courseCurriculum | コース一覧 + 受講者進捗 + 修了ステータス管理 |
| petProfile | ペットカード一覧 + 犬種/体重/アレルギー + 写真 |
| allergyRecord | アレルギー情報一覧 + 施術時アラートバナー + 登録フォーム |
| visitSummary | 来店履歴タイムライン + 施術メモ入力 + 写真添付 |

**各ページの必須要素:**
- 'use client' ディレクティブ
- useAdminTenantId() でテナントID取得
- データ取得: GET /api/proxy/admin/{vertical}/{feature} を fetch
- データ保存: POST/PUT /api/proxy/admin/{vertical}/{feature}
- ローディング・エラー・空状態の表示
- Tailwind CSS でスタイリング

#### 4e-4. APIエンドポイント追加（必要な場合）
特化機能がKVに新しいデータ構造を保存する場合:
- apps/api/src/index.ts に GET/POST エンドポイントを追加
- KVキー: `{vertical}:{feature}:{tenantId}` の命名規則に従う
- D1が必要な場合（requiresD1=true）: apps/api/migrations/ にマイグレーション追加
- R2が必要な場合（requiresR2=true）: 既存の MENU_IMAGES バケットを再利用

#### 4e-5. サイドバーナビに特化機能を追加
- apps/web/app/admin/nav.config.ts に特化機能のサブメニューを追加
- 既存のペット管理画面（admin/pet/）の nav.config パターンを参考にする

## 5. LP実装
### 5a. LP辞書追加
- apps/web/app/lp/[vertical]/page.tsx の LP辞書に新しいヴァーティカルを追加
  - label, badge, headline, subheadline
  - problems (5個), features (6個), flow (3ステップ), faqs (4個)
  - metaTitle, metaDesc
  - **features に選定した特化機能を1つ以上含める**（例: 「カラーレシピ自動保存」「ビフォーアフター写真管理」）

### 5b. デザインマッピング追加
- apps/web/app/lp/[vertical]/page.tsx の VERTICAL_DESIGN に追加
  - 業種に最適なデザインを10種類から選択:
    - dark-hero, split-hero, minimal, storytelling, card-showcase,
      comparison, testimonial, gradient-wave, magazine, bold-typography

### 5c. テーマカラー追加（必要な場合）
- apps/web/app/lp/_designs/shared.ts の VERTICAL_THEME に追加
  - 既存: nail→rose, hair→indigo, dental→sky, esthetic→violet, cleaning→emerald, handyman→amber, pet→orange
  - 未使用: teal, fuchsia, cyan から選択

## 6. デモUI実装（必須）
- apps/web/app/demo/{vertical名}/page.tsx — Server Component (metadata + layout)
- apps/web/app/demo/{vertical名}/{ComponentName}Demo.tsx — Client Component ('use client')
  - 入力フォーム（テキスト入力 + カテゴリ選択の2モード）
  - 例文クリック機能（6パターン以上）
  - AI解析シミュレーション（クライアントサイドの分類ロジック）
  - 見積もり結果の詳細表示（内訳・合計・作業時間）
  - AI返信メッセージプレビュー
  - CTA（登録ボタン → /signup?vertical=xxx）
  - 内部リンクは必ず next/link の `<Link>` を使う

## 7. 管理画面実装（必須・フル）

### 7a. ダッシュボード
- apps/web/app/admin/{vertical名}/page.tsx — 'use client'
- 表示項目:
  - 今日の問い合わせ数
  - 今週の見積もり数・成約数・成約率
  - 月間売上推移（簡易グラフ or 数値表示）
  - 直近の問い合わせリスト（5件）
  - Agent実行ステータスサマリー
  - **特化機能のサマリーカード**（例: 「期限切れワクチン: 3件」「未点検機器: 2台」）
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

### 7e. 特化機能ページ（4e-3 で実装済みのページを確認）
- Step 4e-3 で作成した各特化機能ページが正しくルーティングされていることを確認
- ダッシュボードからの導線（リンク）が繋がっていることを確認

### 7f. サイドバーナビゲーション追加
- apps/web/app/admin/nav.config.ts に新しいヴァーティカルのナビ項目を追加
  - { label: "{ヴァーティカル名}", href: "/admin/{vertical名}" }
  - サブメニュー: 履歴、料金設定、AI設定、**選定した特化機能のページ**

## 8. 導線接続
- LP の「デモを見る」ボタン → /demo/{vertical名}
- LP の「無料で始める」ボタン → /signup?vertical={vertical名}
- デモUI の「無料で始める」ボタン → /signup?vertical={vertical名}
- 管理画面のダッシュボード → 履歴/設定への内部リンク
- 管理画面のダッシュボード → **特化機能ページ**への内部リンク
- [vertical]/page.tsx 内で handyman/cleaning 同様に demo リンクを設定

## 9. 検証（必須・省略禁止）
以下をすべて実行し、エラーがあれば修正してから次に進む:
1. pnpm -C apps/web run build — Webビルド。**新ルートが出力に含まれるか grep で確認**
2. 新しい API route には `export const runtime = 'edge'` が必須（Cloudflare Pages要件）
3. 内部リンクは必ず next/link の `<Link>` を使う（`<a href="/...">` は ESLint がビルドを止める）
4. echo "v{N}-{vertical名}-$(date +%Y%m%d)" > apps/web/.force-pages-rebuild.txt
5. ビルドが通るまでデプロイしない
6. **特化機能ページのルートがビルド出力に含まれるか確認**

## 10. デプロイ
- cd apps/api && node_modules/.bin/wrangler deploy --env production
- powershell.exe -Command "cd C:\dev\saas-factory; git add -A"
- コミットメッセージを /tmp/commit-msg.txt に書いてから:
  powershell.exe -Command "cd C:\dev\saas-factory; git commit -F '\\\\wsl.localhost\\Ubuntu\\tmp\\commit-msg.txt'"
- powershell.exe -Command "cd C:\dev\saas-factory; git push origin main"
- GitHub Actions の "Deploy Web" ワークフローが success になるまで gh run list で確認
- 失敗した場合はログを確認して修正→再push

## 11. 営業素材
- DM営業文（100字以内、デモURL付き）
- メール営業文（件名 + 本文、デモURL付き）
- LINE営業文（3行以内、デモURL付き）
- **特化機能を営業ポイントとして含める**（例: 「カラーレシピ自動保存で、顧客ごとの調合を忘れません」）

## 12. レポート出力
- 選定ヴァーティカル
- プロダクト名
- Agent構成（steps + prompts）
- **選定した特化機能一覧**（各機能の選定理由を1行で記載）
- **追加したAPIエンドポイント**（KVキー・D1テーブル含む）
- フロントエンド構成（LP + デモ + 管理画面ページ一覧 + **特化機能ページ一覧**）
- 追加/修正ファイル一覧
- デプロイ結果（Workers version + Pages deploy status）
- 公開URL（LP + デモ + 管理画面）
- 想定MRR（3ヶ月/6ヶ月/12ヶ月）
