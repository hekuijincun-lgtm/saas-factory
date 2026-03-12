-- Outreach Phase 4.5: Stability Upgrade
-- ============================================================
-- 1. Followup idempotency
-- 2. Send attempt tracking
-- 3. Outreach events (normalized)

-- 1. Followup idempotency columns
ALTER TABLE outreach_followups ADD COLUMN processing_at TEXT;
ALTER TABLE outreach_followups ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outreach_followups ADD COLUMN provider_message_id TEXT;

-- 2. Send attempt tracking on leads
ALTER TABLE sales_leads ADD COLUMN send_attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales_leads ADD COLUMN last_send_error TEXT;

-- 3. Normalized outreach events table
CREATE TABLE IF NOT EXISTS outreach_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  type TEXT NOT NULL,       -- 'initial_send' | 'followup_send' | 'reply_received' | 'reply_classified' | 'meeting_created'
  metadata TEXT,            -- JSON
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outreach_events_tenant ON outreach_events(tenant_id, type, created_at);
CREATE INDEX IF NOT EXISTS idx_outreach_events_lead ON outreach_events(tenant_id, lead_id);
