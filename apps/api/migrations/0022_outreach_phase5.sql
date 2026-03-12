-- Outreach Phase 5: Lead Import, Campaigns, AB Test
-- ============================================================

-- 1. Campaigns
CREATE TABLE IF NOT EXISTS outreach_campaigns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  niche TEXT,
  area TEXT,
  min_score INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | ready | running | paused | archived
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON outreach_campaigns(tenant_id, status);

-- 2. Campaign Variants (AB test)
CREATE TABLE IF NOT EXISTS outreach_campaign_variants (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  variant_key TEXT NOT NULL,            -- 'A' | 'B' | 'C' ...
  subject_template TEXT,
  opener_template TEXT,
  cta_template TEXT,
  tone TEXT DEFAULT 'friendly',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES outreach_campaigns(id)
);

CREATE INDEX IF NOT EXISTS idx_variants_campaign ON outreach_campaign_variants(tenant_id, campaign_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_key ON outreach_campaign_variants(campaign_id, variant_key);

-- 3. Extend lead_message_drafts for campaign tracking
ALTER TABLE lead_message_drafts ADD COLUMN campaign_id TEXT;
ALTER TABLE lead_message_drafts ADD COLUMN variant_key TEXT;

CREATE INDEX IF NOT EXISTS idx_drafts_campaign ON lead_message_drafts(campaign_id, variant_key);

-- 4. Import source tracking on leads
ALTER TABLE sales_leads ADD COLUMN import_source TEXT;       -- 'csv' | 'manual' | 'api'
ALTER TABLE sales_leads ADD COLUMN import_batch_id TEXT;     -- groups rows from same CSV upload
