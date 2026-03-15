-- Phase 19: Area Rotation Mode for Outreach Schedules
-- Adds rotation state tracking to outreach_schedules table.
-- Existing schedules default to rotation_index=0 (no-op for manual/auto modes).

ALTER TABLE outreach_schedules ADD COLUMN rotation_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outreach_schedules ADD COLUMN rotation_cursor_updated_at TEXT;
ALTER TABLE outreach_schedules ADD COLUMN last_executed_area TEXT;
