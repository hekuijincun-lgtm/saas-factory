-- Phase 6: Google Map / Directory → Lead Generation Foundation
-- ============================================================

-- 1. Search run history
CREATE TABLE IF NOT EXISTS outreach_source_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_type TEXT NOT NULL,          -- 'map' | 'directory' | 'csv' | 'manual'
  query TEXT,
  location TEXT,
  niche TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'running' | 'completed' | 'failed'
  error_message TEXT,
  result_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_source_runs_tenant ON outreach_source_runs(tenant_id, status);
CREATE INDEX idx_source_runs_type ON outreach_source_runs(tenant_id, source_type);

-- 2. Source candidates (staging before lead creation)
CREATE TABLE IF NOT EXISTS outreach_source_candidates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  external_id TEXT,
  store_name TEXT NOT NULL,
  category TEXT,
  area TEXT,
  address TEXT,
  website_url TEXT,
  phone TEXT,
  email TEXT,
  rating REAL,
  review_count INTEGER DEFAULT 0,
  source_url TEXT,
  normalized_domain TEXT,
  import_status TEXT NOT NULL DEFAULT 'new', -- 'new' | 'duplicate' | 'imported' | 'skipped' | 'invalid'
  dedup_reason TEXT,
  dedup_lead_id TEXT,
  raw_payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES outreach_source_runs(id)
);

CREATE INDEX idx_candidates_run ON outreach_source_candidates(tenant_id, run_id);
CREATE INDEX idx_candidates_domain ON outreach_source_candidates(tenant_id, normalized_domain);
CREATE INDEX idx_candidates_type ON outreach_source_candidates(tenant_id, source_type);
CREATE INDEX idx_candidates_status ON outreach_source_candidates(tenant_id, import_status);

-- 3. Extend leads with source metadata
ALTER TABLE sales_leads ADD COLUMN source_type TEXT;        -- 'csv' | 'manual' | 'map' | 'directory'
ALTER TABLE sales_leads ADD COLUMN source_run_id TEXT;
ALTER TABLE sales_leads ADD COLUMN source_ref TEXT;         -- external_id or candidate_id
ALTER TABLE sales_leads ADD COLUMN imported_at TEXT;

CREATE INDEX idx_leads_source_type ON sales_leads(tenant_id, source_type);
CREATE INDEX idx_leads_source_run ON sales_leads(tenant_id, source_run_id);
