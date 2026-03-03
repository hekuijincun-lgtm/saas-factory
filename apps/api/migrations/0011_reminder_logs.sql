-- Migration 0011: reminder_logs table for idempotent LINE 1-day-before reminders
CREATE TABLE IF NOT EXISTS reminder_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id    TEXT    NOT NULL,
  reservation_id TEXT  NOT NULL,
  kind         TEXT    NOT NULL DEFAULT 'day_before',
  sent_at      TEXT    NOT NULL,
  status       TEXT    NOT NULL,  -- 'sent' | 'failed' | 'skipped' | 'dry_run'
  error        TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reminder_logs
  ON reminder_logs (tenant_id, reservation_id, kind);
