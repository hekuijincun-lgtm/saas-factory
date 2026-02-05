-- LINE連携状態（tenantごと）
CREATE TABLE IF NOT EXISTS line_integrations (
  tenant_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  picture_url TEXT,
  updated_at INTEGER NOT NULL,          -- unix seconds
  notify_enabled INTEGER NOT NULL DEFAULT 0, -- 0/1
  linked_at INTEGER NOT NULL            -- unix seconds
);

CREATE INDEX IF NOT EXISTS idx_line_integrations_updated_at
  ON line_integrations(updated_at DESC);

-- 送信ログ（テスト送信/通知送信の監査）
CREATE TABLE IF NOT EXISTS line_send_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  kind TEXT NOT NULL,                  -- 'test' | 'notify' など
  to_user_id TEXT,
  message TEXT,
  ok INTEGER NOT NULL DEFAULT 1,        -- 0/1
  error TEXT,
  created_at INTEGER NOT NULL           -- unix seconds
);

CREATE INDEX IF NOT EXISTS idx_line_send_logs_tenant_id
  ON line_send_logs(tenant_id);

CREATE INDEX IF NOT EXISTS idx_line_send_logs_created_at
  ON line_send_logs(created_at DESC);
