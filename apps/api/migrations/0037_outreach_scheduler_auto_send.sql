-- Phase 16: Auto Send + Area Auto Selection for Outreach Scheduler
-- ============================================================
-- Adds mode extensions (hybrid, auto_send), area_mode, send limits
-- to outreach_schedules, and auto-send tracking to outreach_schedule_runs.
-- Backward compatible: defaults are review_only / manual / 0.

-- ── outreach_schedules: new columns ──────────────────────────────────────
ALTER TABLE outreach_schedules ADD COLUMN area_mode TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE outreach_schedules ADD COLUMN daily_send_limit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outreach_schedules ADD COLUMN min_score_for_auto_send INTEGER NOT NULL DEFAULT 40;

-- ── outreach_schedule_runs: auto-send tracking ──────────────────────────
ALTER TABLE outreach_schedule_runs ADD COLUMN sent_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outreach_schedule_runs ADD COLUMN skipped_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outreach_schedule_runs ADD COLUMN review_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outreach_schedule_runs ADD COLUMN chosen_area TEXT;
ALTER TABLE outreach_schedule_runs ADD COLUMN area_mode TEXT;
ALTER TABLE outreach_schedule_runs ADD COLUMN send_mode TEXT;
ALTER TABLE outreach_schedule_runs ADD COLUMN selection_reason TEXT;
