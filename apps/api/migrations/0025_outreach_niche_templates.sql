-- Phase 7: Niche Template Recommendation + Learning Auto Refresh Log
-- =====================================================================

-- Niche-specific best-practice templates
CREATE TABLE IF NOT EXISTS outreach_niche_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  niche TEXT NOT NULL,
  name TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'friendly',
  subject_template TEXT,
  opener_template TEXT,
  body_template TEXT,
  cta_template TEXT,
  hypothesis_codes TEXT,
  win_score REAL DEFAULT 0,
  sample_size INTEGER DEFAULT 0,
  is_auto_generated INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_niche_templates_tenant_niche
  ON outreach_niche_templates(tenant_id, niche);

-- Learning auto-refresh log (dedup + tracking)
CREATE TABLE IF NOT EXISTS outreach_learning_refresh_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  patterns_updated INTEGER DEFAULT 0,
  patterns_deleted INTEGER DEFAULT 0,
  templates_generated INTEGER DEFAULT 0,
  triggered_by TEXT NOT NULL DEFAULT 'cron',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_learning_refresh_log_tenant
  ON outreach_learning_refresh_log(tenant_id, created_at);
