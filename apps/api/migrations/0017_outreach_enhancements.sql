-- Outreach OS Phase 1: Enhance sales_leads + add delivery events
-- ================================================================

-- 1) Add scoring/CRM columns to existing sales_leads table
ALTER TABLE sales_leads ADD COLUMN rating REAL;
ALTER TABLE sales_leads ADD COLUMN review_count INTEGER DEFAULT 0;
ALTER TABLE sales_leads ADD COLUMN has_booking_link INTEGER DEFAULT 0;
ALTER TABLE sales_leads ADD COLUMN contact_email TEXT;
ALTER TABLE sales_leads ADD COLUMN category TEXT;
ALTER TABLE sales_leads ADD COLUMN area TEXT;
ALTER TABLE sales_leads ADD COLUMN features_json TEXT;
ALTER TABLE sales_leads ADD COLUMN pipeline_stage TEXT NOT NULL DEFAULT 'new';

-- 2) Add tenant_id + status to existing lead_message_drafts for direct tenant isolation
ALTER TABLE lead_message_drafts ADD COLUMN tenant_id TEXT;
ALTER TABLE lead_message_drafts ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE lead_message_drafts ADD COLUMN tone TEXT;
ALTER TABLE lead_message_drafts ADD COLUMN pain_points_json TEXT;
ALTER TABLE lead_message_drafts ADD COLUMN reasoning_summary TEXT;

-- 3) Delivery events audit log
CREATE TABLE IF NOT EXISTS outreach_delivery_events (
  id TEXT NOT NULL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  message_id TEXT,
  channel TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES sales_leads(id)
);
CREATE INDEX idx_ode_tenant ON outreach_delivery_events(tenant_id);
CREATE INDEX idx_ode_lead ON outreach_delivery_events(lead_id);
CREATE INDEX idx_ode_tenant_created ON outreach_delivery_events(tenant_id, created_at);

-- 4) Index for pipeline stage queries
CREATE INDEX idx_leads_pipeline ON sales_leads(tenant_id, pipeline_stage);
