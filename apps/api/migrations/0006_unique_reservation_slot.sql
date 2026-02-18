-- hard guarantee: no double booking for same tenant/staff/start
CREATE UNIQUE INDEX IF NOT EXISTS idx_res_unique
ON reservations(tenant_id, staff_id, start_at);
