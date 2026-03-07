-- Fix: cancelled reservations were blocking new bookings at the same time slot.
-- The old idx_res_unique(tenant_id, staff_id, start_at) applied to ALL rows
-- including cancelled ones, so re-booking a cancelled slot hit UNIQUE constraint.
-- Replace with a partial index that only enforces uniqueness on active reservations.
DROP INDEX IF EXISTS idx_res_unique;
DROP INDEX IF EXISTS idx_resv_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_res_unique_active
ON reservations(tenant_id, staff_id, start_at)
WHERE status != 'cancelled';
