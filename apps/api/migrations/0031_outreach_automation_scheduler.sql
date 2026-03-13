-- Auto Outreach Scheduler — schedules + run logs
-- ============================================================

CREATE TABLE IF NOT EXISTS outreach_schedules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  niche TEXT NOT NULL,
  areas_json TEXT NOT NULL DEFAULT '[]',
  source_type TEXT NOT NULL DEFAULT 'directory',
  enabled INTEGER NOT NULL DEFAULT 0,
  frequency TEXT NOT NULL DEFAULT 'daily',          -- daily | weekdays | weekly
  run_hour INTEGER NOT NULL DEFAULT 9,
  run_minute INTEGER NOT NULL DEFAULT 0,
  max_target_count INTEGER NOT NULL DEFAULT 20,
  max_per_area INTEGER NOT NULL DEFAULT 8,
  quality_threshold REAL NOT NULL DEFAULT 0.4,
  auto_accept_enabled INTEGER NOT NULL DEFAULT 1,
  auto_import_enabled INTEGER NOT NULL DEFAULT 1,
  auto_analyze_enabled INTEGER NOT NULL DEFAULT 1,
  auto_score_enabled INTEGER NOT NULL DEFAULT 1,
  auto_draft_enabled INTEGER NOT NULL DEFAULT 1,
  mode TEXT NOT NULL DEFAULT 'review_only',          -- review_only | approved_send_existing_only
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schedules_tenant ON outreach_schedules(tenant_id, enabled);

CREATE TABLE IF NOT EXISTS outreach_schedule_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  schedule_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',            -- pending | running | completed | failed | cancelled
  searched_count INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  analyzed_count INTEGER NOT NULL DEFAULT 0,
  scored_count INTEGER NOT NULL DEFAULT 0,
  drafted_count INTEGER NOT NULL DEFAULT 0,
  queued_send_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT,
  error_message TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schedule_runs_schedule ON outreach_schedule_runs(schedule_id, tenant_id, created_at);
