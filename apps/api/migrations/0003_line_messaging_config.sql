-- 0003_line_messaging_config.sql
-- LINE Messaging API config (tenant-scoped)
CREATE TABLE IF NOT EXISTS line_messaging_config (
  tenant_id           TEXT PRIMARY KEY,
  enc_access_token    TEXT NOT NULL,
  enc_channel_secret  TEXT NOT NULL,
  webhook_url         TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_line_messaging_config_updated_at
  ON line_messaging_config(updated_at);
