-- LINE設定テーブル（暗号化された設定を保存）
CREATE TABLE IF NOT EXISTS line_config (
  tenant_id TEXT PRIMARY KEY NOT NULL,
  enc_json TEXT NOT NULL, -- 暗号化されたJSON文字列（base64）
  iv TEXT NOT NULL, -- 初期化ベクトル（base64）
  alg TEXT NOT NULL DEFAULT 'AES-GCM', -- 暗号化アルゴリズム
  updated_at INTEGER NOT NULL, -- Unix timestamp (seconds)
  updated_by TEXT NOT NULL -- 更新者のuser_id
);

-- 監査ログテーブル
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL, -- 'line_config_created', 'line_config_updated', 'line_config_deleted'
  meta_json TEXT, -- 追加メタデータ（JSON文字列、任意）
  created_at INTEGER NOT NULL -- Unix timestamp (seconds)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_id ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);




