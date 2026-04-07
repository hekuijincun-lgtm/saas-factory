-- 0049_estimates.sql
-- Estimates table for quote/estimate management mode.

CREATE TABLE IF NOT EXISTS estimates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  customer_id TEXT,
  pet_id TEXT,
  estimated_price INTEGER,
  estimated_duration_minutes INTEGER,
  breakdown TEXT,
  ai_reasoning TEXT,
  final_price INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_estimates_tenant ON estimates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_estimates_reservation ON estimates(tenant_id, reservation_id);
CREATE INDEX IF NOT EXISTS idx_estimates_status ON estimates(tenant_id, status);
