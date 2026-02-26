-- 0007_add_followup_columns.sql
-- Add AI-driven followup tracking to reservations (all nullable, non-breaking).
-- line_user_id already exists (cid=5) — not added here.
ALTER TABLE reservations ADD COLUMN followup_at TEXT;
ALTER TABLE reservations ADD COLUMN followup_status TEXT DEFAULT 'pending';
ALTER TABLE reservations ADD COLUMN followup_sent_at TEXT;
ALTER TABLE reservations ADD COLUMN followup_error TEXT;

CREATE INDEX IF NOT EXISTS idx_res_followup_due
  ON reservations(tenant_id, followup_status, followup_at);
