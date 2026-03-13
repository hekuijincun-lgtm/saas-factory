-- Auto Sales Copilot — recommendations + review priority
-- ============================================================

CREATE TABLE IF NOT EXISTS outreach_copilot_recommendations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  recommendation_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_copilot_rec_tenant_status ON outreach_copilot_recommendations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_copilot_rec_tenant_type ON outreach_copilot_recommendations(tenant_id, recommendation_type);
CREATE INDEX IF NOT EXISTS idx_copilot_rec_tenant_priority ON outreach_copilot_recommendations(tenant_id, priority);
CREATE INDEX IF NOT EXISTS idx_copilot_rec_created ON outreach_copilot_recommendations(tenant_id, created_at);

-- Add review priority score to message drafts
ALTER TABLE lead_message_drafts ADD COLUMN review_priority_score REAL;
