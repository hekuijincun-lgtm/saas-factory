-- Phase 8.1: Source Quality Layer
-- =====================================================================
-- Additive only — no renames, no drops.

-- 1. Add quality columns to existing outreach_source_candidates
ALTER TABLE outreach_source_candidates ADD COLUMN quality_score REAL DEFAULT NULL;
ALTER TABLE outreach_source_candidates ADD COLUMN acceptance_status TEXT DEFAULT 'pending';
ALTER TABLE outreach_source_candidates ADD COLUMN rejection_reason TEXT DEFAULT NULL;
ALTER TABLE outreach_source_candidates ADD COLUMN accepted_at TEXT DEFAULT NULL;
ALTER TABLE outreach_source_candidates ADD COLUMN rejected_at TEXT DEFAULT NULL;

-- 2. Source quality daily aggregation table
CREATE TABLE IF NOT EXISTS outreach_source_quality_daily (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_key TEXT NOT NULL,
  niche TEXT,
  area TEXT,
  leads_imported INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  meeting_count INTEGER NOT NULL DEFAULT 0,
  won_count INTEGER NOT NULL DEFAULT 0,
  quality_score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sqd_type_key_date
  ON outreach_source_quality_daily(tenant_id, source_type, source_key, created_at);

CREATE INDEX IF NOT EXISTS idx_sqd_niche_area_date
  ON outreach_source_quality_daily(tenant_id, niche, area, created_at);
