-- 0010_message_logs.sql
-- Create message_logs table for LINE repeat-send cooldown guard (I3).
-- Tracks sent messages per customer to prevent spamming within cooldownDays.
CREATE TABLE IF NOT EXISTS message_logs (
  id          TEXT    NOT NULL PRIMARY KEY,
  tenant_id   TEXT    NOT NULL,
  customer_key TEXT   NOT NULL,
  channel     TEXT    NOT NULL DEFAULT 'line', -- 'line' | 'sms' etc.
  type        TEXT    NOT NULL DEFAULT 'repeat', -- 'repeat' | 'followup' etc.
  sent_at     TEXT    NOT NULL,                  -- ISO8601
  payload_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_msglog_tenant_ck_sent
  ON message_logs(tenant_id, customer_key, sent_at);
