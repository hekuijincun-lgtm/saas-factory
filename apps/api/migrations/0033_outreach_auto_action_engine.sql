-- Auto Action Engine — recommendation execution + audit logs
-- ============================================================

-- Extend copilot recommendations with execution fields
ALTER TABLE outreach_copilot_recommendations ADD COLUMN action_type TEXT;
ALTER TABLE outreach_copilot_recommendations ADD COLUMN action_payload_json TEXT;
ALTER TABLE outreach_copilot_recommendations ADD COLUMN auto_executable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outreach_copilot_recommendations ADD COLUMN execution_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE outreach_copilot_recommendations ADD COLUMN executed_at TEXT;
ALTER TABLE outreach_copilot_recommendations ADD COLUMN execution_result_json TEXT;
ALTER TABLE outreach_copilot_recommendations ADD COLUMN execution_error TEXT;
ALTER TABLE outreach_copilot_recommendations ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'manual_only';

CREATE INDEX IF NOT EXISTS idx_copilot_rec_exec_status ON outreach_copilot_recommendations(tenant_id, execution_status);
CREATE INDEX IF NOT EXISTS idx_copilot_rec_action_type ON outreach_copilot_recommendations(tenant_id, action_type);

-- Action audit log
CREATE TABLE IF NOT EXISTS outreach_action_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  recommendation_id TEXT,
  action_type TEXT NOT NULL,
  action_payload_json TEXT,
  execution_mode TEXT NOT NULL,
  execution_status TEXT NOT NULL,
  executed_by TEXT NOT NULL,
  result_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_action_logs_tenant ON outreach_action_logs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_action_logs_rec ON outreach_action_logs(recommendation_id);
