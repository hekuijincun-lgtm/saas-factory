-- Phase 18: Monitoring & Guard Rails + Close Optimization
-- ============================================================

-- 1. Health snapshots (cron writes, health endpoint reads)
CREATE TABLE IF NOT EXISTS outreach_health_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  snapshot_type TEXT NOT NULL,  -- 'cron_run' | 'daily_summary'
  cron_block TEXT,              -- 'AUTO_CAMPAIGN' | 'FOLLOWUP' | 'CLOSE_ENGINE' | 'SCHEDULER'
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  unsubscribe_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_health_snapshots_tenant_type
  ON outreach_health_snapshots(tenant_id, snapshot_type, created_at);

-- 2. Booking conversion events (close optimization)
CREATE TABLE IF NOT EXISTS outreach_booking_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  close_log_id TEXT,            -- FK to outreach_close_logs
  event_type TEXT NOT NULL,     -- 'link_sent' | 'clicked' | 'booked' | 'no_action'
  booking_url TEXT,
  variant_key TEXT,             -- which close template variant
  metadata_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_booking_events_tenant
  ON outreach_booking_events(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_booking_events_lead
  ON outreach_booking_events(tenant_id, lead_id);

-- 3. Human handoff queue
CREATE TABLE IF NOT EXISTS outreach_handoffs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  reply_id TEXT,
  reason TEXT NOT NULL,         -- 'high_value' | 'complex_question' | 'negotiation' | 'escalation' | 'ai_uncertain'
  priority TEXT DEFAULT 'normal', -- 'urgent' | 'high' | 'normal' | 'low'
  status TEXT DEFAULT 'open',   -- 'open' | 'assigned' | 'resolved' | 'dismissed'
  assigned_to TEXT,
  resolution_notes TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_handoffs_tenant_status
  ON outreach_handoffs(tenant_id, status, created_at);

-- 4. Close template variants
CREATE TABLE IF NOT EXISTS outreach_close_variants (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  close_type TEXT NOT NULL,     -- 'pricing' | 'demo' | 'booking' | 'escalation'
  variant_key TEXT NOT NULL,    -- 'A' | 'B' | 'C'
  subject_template TEXT,
  body_template TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  sent_count INTEGER DEFAULT 0,
  meeting_count INTEGER DEFAULT 0,
  close_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_close_variants_unique
  ON outreach_close_variants(tenant_id, close_type, variant_key);

-- 5. Add variant tracking to close logs
ALTER TABLE outreach_close_logs ADD COLUMN close_variant_key TEXT;
ALTER TABLE outreach_close_logs ADD COLUMN booking_event_id TEXT;
