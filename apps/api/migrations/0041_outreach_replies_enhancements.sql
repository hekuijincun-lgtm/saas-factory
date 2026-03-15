-- Outreach Replies Enhancements
-- Add from_email, subject, status columns for better reply management
-- ============================================================

-- Store sender email for display and audit
ALTER TABLE outreach_replies ADD COLUMN from_email TEXT;

-- Store email subject for context
ALTER TABLE outreach_replies ADD COLUMN subject TEXT;

-- Explicit status workflow: open → in_progress → resolved → dismissed
-- (ai_handled remains for backward compat with auto-reply cron)
ALTER TABLE outreach_replies ADD COLUMN status TEXT NOT NULL DEFAULT 'open';

-- Index for status-based queries (未対応 filter)
CREATE INDEX IF NOT EXISTS idx_outreach_replies_status ON outreach_replies(tenant_id, status, created_at);
