-- Outreach Phase 3: reply tracking + indexes
ALTER TABLE sales_leads ADD COLUMN last_replied_at TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_status_tenant ON sales_leads(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_replied ON sales_leads(tenant_id, last_replied_at);
