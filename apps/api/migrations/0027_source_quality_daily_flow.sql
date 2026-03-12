-- Phase 8.2: Source Quality Daily + Accepted-Only Import
-- =====================================================================
-- Additive only — no renames, no drops.

-- 1. Add source_key to outreach_source_candidates for granular tracking
ALTER TABLE outreach_source_candidates ADD COLUMN source_key TEXT DEFAULT NULL;

-- 2. Index for acceptance_status filtering (batch actions, accepted-only import)
CREATE INDEX IF NOT EXISTS idx_candidates_acceptance
  ON outreach_source_candidates(tenant_id, acceptance_status);

-- 3. Index for source_key
CREATE INDEX IF NOT EXISTS idx_candidates_source_key
  ON outreach_source_candidates(tenant_id, source_key);

-- 4. Extend outreach_source_quality_daily with Phase 8.2 columns
ALTER TABLE outreach_source_quality_daily ADD COLUMN day TEXT DEFAULT NULL;
ALTER TABLE outreach_source_quality_daily ADD COLUMN candidate_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outreach_source_quality_daily ADD COLUMN accepted_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outreach_source_quality_daily ADD COLUMN rejected_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outreach_source_quality_daily ADD COLUMN imported_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outreach_source_quality_daily ADD COLUMN avg_quality_score REAL NOT NULL DEFAULT 0;
ALTER TABLE outreach_source_quality_daily ADD COLUMN reply_rate REAL NOT NULL DEFAULT 0;
ALTER TABLE outreach_source_quality_daily ADD COLUMN meeting_rate REAL NOT NULL DEFAULT 0;
ALTER TABLE outreach_source_quality_daily ADD COLUMN won_rate REAL NOT NULL DEFAULT 0;

-- 5. Index for daily trend queries
CREATE INDEX IF NOT EXISTS idx_sqd_tenant_day
  ON outreach_source_quality_daily(tenant_id, day);
