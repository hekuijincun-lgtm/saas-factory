-- Outreach OS Phase 2: Website Analyzer + Pain Hypotheses
-- ================================================================

-- 1) Extracted features from website analysis
CREATE TABLE IF NOT EXISTS outreach_lead_features (
  id TEXT NOT NULL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  has_website INTEGER NOT NULL DEFAULT 0,
  has_instagram INTEGER NOT NULL DEFAULT 0,
  has_line_link INTEGER NOT NULL DEFAULT 0,
  has_booking_link INTEGER NOT NULL DEFAULT 0,
  contact_email_found INTEGER NOT NULL DEFAULT 0,
  phone_found INTEGER NOT NULL DEFAULT 0,
  menu_count_guess INTEGER NOT NULL DEFAULT 0,
  price_info_found INTEGER NOT NULL DEFAULT 0,
  booking_cta_count INTEGER NOT NULL DEFAULT 0,
  booking_cta_depth_guess INTEGER NOT NULL DEFAULT 0,
  title_found INTEGER NOT NULL DEFAULT 0,
  meta_description_found INTEGER NOT NULL DEFAULT 0,
  raw_signals_json TEXT,
  analyzed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES sales_leads(id)
);
CREATE UNIQUE INDEX idx_olf_tenant_lead ON outreach_lead_features(tenant_id, lead_id);
CREATE INDEX idx_olf_lead ON outreach_lead_features(lead_id);

-- 2) Pain hypotheses generated from features
CREATE TABLE IF NOT EXISTS outreach_pain_hypotheses (
  id TEXT NOT NULL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES sales_leads(id)
);
CREATE UNIQUE INDEX idx_oph_tenant_lead_code ON outreach_pain_hypotheses(tenant_id, lead_id, code);
CREATE INDEX idx_oph_lead ON outreach_pain_hypotheses(lead_id);
