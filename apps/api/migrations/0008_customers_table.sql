-- 0008_customers_table.sql
-- Add customers table for CRM and link reservations to customers.
-- customer_id in reservations is NULL-allowed for phased migration (existing rows unaffected).

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_visit_at TEXT,
  visit_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone  ON customers(tenant_id, phone);

-- Link reservations → customers (NULL-allowed for backward compatibility)
ALTER TABLE reservations ADD COLUMN customer_id TEXT;
