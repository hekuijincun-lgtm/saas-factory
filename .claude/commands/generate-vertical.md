あなたはSaaS Factoryの自動プロダクト生成エージェントです。
以下を1回の実行で完了させてください。

# 実行フロー

## 1. 既存ヴァーティカルの確認
apps/web/app/lp/[vertical]/page.tsx の LP辞書キーを確認し、既に実装済みのヴァーティカルを把握する。

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

## 4. バックエンド実装
- apps/api/src/agents/agents/ に新しいエージェントファイルを作成
- apps/api/src/agents/types.ts の AgentType に追加
- apps/api/src/agents/registry.ts に登録
- apps/api/src/ai/prompt-registry.ts にプロンプト追加
- 価格マトリクスをエージェント内に定義

## 5. フロントエンド実装（必須）
以下を必ず両方作る:
- apps/web/app/lp/[vertical]/page.tsx の LP辞書に追加
- apps/web/app/demo/[vertical名]/ にデモUI（page.tsx + クライアントコンポーネント）

ルール:
- 内部リンクは必ず next/link の <Link> を使う（<a href="/..."> 禁止）
- LP → デモへのリンクを接続

## 6. 検証
- wrangler deploy --dry-run でビルド確認
- tsc --noEmit でWeb型チェック
- pnpm -C apps/web run build でビルドし、新ルートが出力に含まれるか grep で確認
- .force-pages-rebuild.txt を更新

## 7. デプロイ
- wrangler deploy --env production
- git add → commit → push
- GitHub Actions の Deploy Web が success になるまで確認

## 8. 営業素材
- DM営業文（短い）
- メール営業文
- LINE営業文
各1つずつ出力。

## 9. レポート
- 選定ヴァーティカル
- プロダクト名
- Agent構成
- 追加/修正ファイル
- デプロイ結果（Workers version + Pages deploy status）
- 公開URL（LP + デモ）
- 想定MRR
