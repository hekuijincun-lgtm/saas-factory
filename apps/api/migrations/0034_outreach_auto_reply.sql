-- Auto Reply AI — reply tracking + audit logs
-- ============================================================

-- Dedicated reply tracking table
CREATE TABLE IF NOT EXISTS outreach_replies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  campaign_id TEXT,
  message_id TEXT,
  reply_text TEXT NOT NULL,
  reply_source TEXT NOT NULL DEFAULT 'email',
  sentiment TEXT,
  intent TEXT,
  intent_confidence REAL,
  ai_handled INTEGER NOT NULL DEFAULT 0,
  ai_response TEXT,
  ai_response_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outreach_replies_tenant ON outreach_replies(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_outreach_replies_lead ON outreach_replies(tenant_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_replies_unhandled ON outreach_replies(tenant_id, ai_handled, ai_response_sent);

-- Reply audit log
CREATE TABLE IF NOT EXISTS outreach_reply_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  reply_id TEXT,
  ai_decision TEXT NOT NULL,
  ai_response TEXT,
  execution_status TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reply_logs_tenant ON outreach_reply_logs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reply_logs_reply ON outreach_reply_logs(reply_id);

-- Track reply count per lead for max-reply guard
ALTER TABLE sales_leads ADD COLUMN ai_reply_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales_leads ADD COLUMN last_ai_reply_at TEXT;
