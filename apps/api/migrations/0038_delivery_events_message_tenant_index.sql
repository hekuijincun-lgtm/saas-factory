-- 0038: Add composite index on outreach_delivery_events(message_id, tenant_id)
-- Purpose: Accelerate EXISTS subqueries in analytics that join delivery_events by message_id + tenant_id
-- Safe: CREATE INDEX IF NOT EXISTS is idempotent; no data changes
-- Rollback: DROP INDEX IF EXISTS idx_delivery_events_message_tenant;

CREATE INDEX IF NOT EXISTS idx_delivery_events_message_tenant
  ON outreach_delivery_events(message_id, tenant_id);
