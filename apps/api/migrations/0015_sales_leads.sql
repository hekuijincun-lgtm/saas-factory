-- Lead
CREATE TABLE IF NOT EXISTS sales_leads (
  id         TEXT NOT NULL PRIMARY KEY,
  tenant_id  TEXT NOT NULL DEFAULT 'default',
  industry   TEXT NOT NULL DEFAULT 'shared',
  store_name TEXT NOT NULL DEFAULT '',
  website_url   TEXT,
  instagram_url TEXT,
  line_url      TEXT,
  region     TEXT,
  notes      TEXT,
  status     TEXT NOT NULL DEFAULT 'new',
  score      INTEGER,
  pain_points    TEXT,
  best_offer     TEXT,
  recommended_channel TEXT,
  next_action    TEXT,
  ai_summary     TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_leads_tenant ON sales_leads(tenant_id);
CREATE INDEX idx_leads_status ON sales_leads(tenant_id, status);

-- MessageDraft
CREATE TABLE IF NOT EXISTS lead_message_drafts (
  id         TEXT NOT NULL PRIMARY KEY,
  lead_id    TEXT NOT NULL,
  kind       TEXT NOT NULL,
  subject    TEXT,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES sales_leads(id)
);
CREATE INDEX idx_drafts_lead ON lead_message_drafts(lead_id);

-- ReplyClassification
CREATE TABLE IF NOT EXISTS lead_reply_classifications (
  id         TEXT NOT NULL PRIMARY KEY,
  lead_id    TEXT NOT NULL,
  raw_reply  TEXT NOT NULL,
  label      TEXT NOT NULL,
  confidence REAL,
  suggested_next_action TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES sales_leads(id)
);
CREATE INDEX idx_classifications_lead ON lead_reply_classifications(lead_id);
