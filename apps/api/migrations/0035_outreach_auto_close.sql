-- Phase 15: Auto Close AI
-- ============================================================

-- 1. Close audit log table
CREATE TABLE IF NOT EXISTS outreach_close_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  reply_id TEXT,
  close_intent TEXT NOT NULL,
  close_confidence REAL NOT NULL DEFAULT 0,
  deal_temperature TEXT NOT NULL DEFAULT 'cold',
  suggested_action TEXT,
  ai_response TEXT,
  execution_status TEXT NOT NULL DEFAULT 'suggested',
  handoff_required INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_close_logs_tenant_lead
  ON outreach_close_logs (tenant_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_close_logs_tenant_created
  ON outreach_close_logs (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_close_logs_tenant_intent
  ON outreach_close_logs (tenant_id, close_intent);
CREATE INDEX IF NOT EXISTS idx_close_logs_tenant_handoff
  ON outreach_close_logs (tenant_id, handoff_required);

-- 2. Extend outreach_replies with close fields
ALTER TABLE outreach_replies ADD COLUMN close_intent TEXT;
ALTER TABLE outreach_replies ADD COLUMN close_confidence REAL;
ALTER TABLE outreach_replies ADD COLUMN recommended_next_step TEXT;
ALTER TABLE outreach_replies ADD COLUMN handoff_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outreach_replies ADD COLUMN deal_temperature TEXT;

-- 3. Extend sales_leads with close-stage fields
ALTER TABLE sales_leads ADD COLUMN close_stage TEXT;
ALTER TABLE sales_leads ADD COLUMN deal_temperature TEXT;
ALTER TABLE sales_leads ADD COLUMN handoff_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales_leads ADD COLUMN close_evaluated_at TEXT;
