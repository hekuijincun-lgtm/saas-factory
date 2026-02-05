-- 2026-01-28 add line webhook logs

CREATE TABLE IF NOT EXISTS line_webhook_logs (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_type TEXT,
  msg_type TEXT,
  reply_token_len INTEGER,
  body_len INTEGER,
  reply_status INTEGER,
  reply_body TEXT
);

CREATE INDEX IF NOT EXISTS idx_line_webhook_logs_tenant_ts
ON line_webhook_logs(tenant_id, ts);
