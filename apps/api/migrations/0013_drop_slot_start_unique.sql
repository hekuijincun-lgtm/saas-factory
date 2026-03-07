-- Drop the overly restrictive UNIQUE(tenant_id, slot_start) index.
-- This index was created by migration 0005 (now disabled) and prevents
-- multiple reservations at the same time for different staff members.
-- The correct uniqueness constraint is idx_res_unique(tenant_id, staff_id, start_at)
-- which allows different staff to have reservations at the same time.
DROP INDEX IF EXISTS idx_reservations_unique_slot;
