-- Outreach Phase 4: followup automation, domain dedup, contact guard
-- ============================================================

-- 1. Followup automation table
CREATE TABLE IF NOT EXISTS outreach_followups (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  step TEXT NOT NULL,          -- 'first_followup' | 'second_followup'
  scheduled_at TEXT NOT NULL,
  sent_at TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled' | 'sent' | 'cancelled' | 'skipped'
  message_id TEXT,             -- FK to lead_message_drafts.id (set after generation)
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_followups_tenant_status ON outreach_followups(tenant_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_followups_lead ON outreach_followups(tenant_id, lead_id);

-- 2. Duplicate send guard: last_contacted_at on leads
ALTER TABLE sales_leads ADD COLUMN last_contacted_at TEXT;

-- 3. Domain deduplication columns
ALTER TABLE sales_leads ADD COLUMN domain TEXT;
ALTER TABLE sales_leads ADD COLUMN normalized_domain TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_domain_unique ON sales_leads(tenant_id, normalized_domain)
  WHERE normalized_domain IS NOT NULL;

-- 4. Reply classification column on delivery events
-- (stored in metadata_json.classification, no schema change needed)

-- 5. Index for learning analytics joins
CREATE INDEX IF NOT EXISTS idx_delivery_events_lead_type ON outreach_delivery_events(tenant_id, lead_id, event_type);
CREATE INDEX IF NOT EXISTS idx_messages_lead_tenant ON lead_message_drafts(tenant_id, lead_id, status);
