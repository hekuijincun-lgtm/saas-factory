-- Phase 8.3: Candidate Quality Learning + Automation Tracking
-- =====================================================================
-- Additive only — no renames, no drops.

-- 1. Quality learning patterns (feature-level performance)
CREATE TABLE IF NOT EXISTS outreach_candidate_quality_patterns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_type TEXT,
  source_key TEXT,
  niche TEXT,
  area TEXT,
  feature_key TEXT NOT NULL,
  feature_value TEXT NOT NULL,
  sample_size INTEGER NOT NULL DEFAULT 0,
  reply_rate REAL NOT NULL DEFAULT 0,
  meeting_rate REAL NOT NULL DEFAULT 0,
  won_rate REAL NOT NULL DEFAULT 0,
  quality_lift REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cqp_tenant
  ON outreach_candidate_quality_patterns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cqp_feature
  ON outreach_candidate_quality_patterns(tenant_id, feature_key, feature_value);

-- 2. Automation tracking columns on candidates
ALTER TABLE outreach_source_candidates ADD COLUMN quality_score_v2 REAL DEFAULT NULL;
ALTER TABLE outreach_source_candidates ADD COLUMN quality_score_base REAL DEFAULT NULL;
ALTER TABLE outreach_source_candidates ADD COLUMN quality_score_lift REAL DEFAULT NULL;
ALTER TABLE outreach_source_candidates ADD COLUMN automation_status TEXT DEFAULT 'none';
ALTER TABLE outreach_source_candidates ADD COLUMN analyze_status TEXT DEFAULT 'none';
ALTER TABLE outreach_source_candidates ADD COLUMN score_status TEXT DEFAULT 'none';
ALTER TABLE outreach_source_candidates ADD COLUMN last_automation_error TEXT DEFAULT NULL;
ALTER TABLE outreach_source_candidates ADD COLUMN automation_updated_at TEXT DEFAULT NULL;

-- 3. Index for automation status queries
CREATE INDEX IF NOT EXISTS idx_candidates_automation
  ON outreach_source_candidates(tenant_id, automation_status);
