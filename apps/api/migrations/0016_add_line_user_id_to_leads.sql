-- Add line_user_id to sales_leads for LINE webhook → lead association
ALTER TABLE sales_leads ADD COLUMN line_user_id TEXT;
CREATE INDEX idx_leads_line_user ON sales_leads(tenant_id, line_user_id);
