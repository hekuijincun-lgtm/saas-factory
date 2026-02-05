# Wrangler Dev トラブルシューティング

## 問題: `wrangler dev` がすぐ "Shutting down local server..." で終了する

### 原因の可能性

1. **KV Namespace ID がプレースホルダーのまま**
   - `wrangler.toml` の `id = "your-kv-namespace-id"` が設定されていると、実際のKV namespaceが存在しない場合にエラーが発生する可能性がある
   - **解決策**: 開発環境では `--persist-to` オプションを使用してローカルKVを使用する

2. **Durable Object の設定エラー**
   - Durable Object の migrations が正しく設定されていない
   - **解決策**: `wrangler.toml` の `[[migrations]]` セクションを確認

3. **エラーが発生してプロセスが終了**
   - コード内で未処理の例外が発生している
   - **解決策**: `--log-level debug` を追加してエラーを確認

4. **stdin が閉じられている**
   - バックグラウンド実行やパイプ経由で実行している場合
   - **解決策**: 通常のターミナルで直接実行

### 推奨の起動方法

```bash
cd C:\dev\saas-factory\apps\api
npm run dev
```

または直接:

```bash
wrangler dev --ip 127.0.0.1 --port 8787 --persist-to .wrangler/state --log-level debug
```

### 修正内容

1. **`wrangler.toml`**: KV namespace ID の設定をコメントアウト（開発環境では不要）
2. **`package.json`**: `scripts.dev` に以下を追加:
   - `--persist-to .wrangler/state`: ローカルKV/Durable Objectの状態を永続化
   - `--log-level debug`: デバッグログを有効化してエラーを確認しやすくする

### 再現手順

1. **修正前の問題を再現**:
   ```bash
   cd C:\dev\saas-factory\apps\api
   wrangler dev --ip 127.0.0.1 --port 8787
   ```
   → すぐに "Shutting down local server..." と表示されて終了

2. **修正後の動作確認**:
   ```bash
   cd C:\dev\saas-factory\apps\api
   npm run dev
   ```
   → サーバーが起動し、`http://127.0.0.1:8787` でアクセス可能になる

### 追加の確認事項

- `.wrangler/state` ディレクトリが作成されることを確認（`.gitignore` に追加推奨）
- エラーログを確認して、他に問題がないか確認
- `wrangler --version` で wrangler のバージョンを確認（v4以上推奨）




