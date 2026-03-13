-- Auto Prospect Batch — batch jobs + items
-- ============================================================

CREATE TABLE IF NOT EXISTS outreach_batch_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  niche TEXT NOT NULL,
  areas_json TEXT NOT NULL DEFAULT '[]',
  randomize_areas INTEGER NOT NULL DEFAULT 1,
  target_count INTEGER NOT NULL DEFAULT 20,
  max_per_area INTEGER NOT NULL DEFAULT 8,
  quality_threshold REAL NOT NULL DEFAULT 0.4,
  mode TEXT NOT NULL DEFAULT 'review_only',       -- review_only | approved_send
  status TEXT NOT NULL DEFAULT 'pending',          -- pending | running | completed | failed | cancelled
  source_type TEXT NOT NULL DEFAULT 'directory',
  created_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  draft_count INTEGER NOT NULL DEFAULT 0,
  queued_send_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  result_summary_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_batch_jobs_tenant ON outreach_batch_jobs(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS outreach_batch_job_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  batch_job_id TEXT NOT NULL,
  source_candidate_id TEXT,
  lead_id TEXT,
  review_item_id TEXT,
  status TEXT NOT NULL DEFAULT 'created',  -- created | accepted | imported | analyzed | scored | drafted | queued | sent | skipped | error
  error_message TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_batch_items_job ON outreach_batch_job_items(batch_job_id, tenant_id);
