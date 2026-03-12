-- Phase 6: Winning Pattern Learning
-- ============================================================
-- Stores aggregated winning patterns (source, hypothesis, tone, CTA)
-- for AI generator context injection.

CREATE TABLE IF NOT EXISTS outreach_learning_patterns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  pattern_type TEXT NOT NULL,          -- 'source' | 'hypothesis' | 'tone' | 'cta' | 'variant'
  pattern_key TEXT NOT NULL,           -- e.g. 'directory', 'no_booking_link', 'friendly', 'free_trial'
  label TEXT NOT NULL,
  niche TEXT,
  sample_size INTEGER NOT NULL DEFAULT 0,
  reply_rate REAL NOT NULL DEFAULT 0,
  meeting_rate REAL NOT NULL DEFAULT 0,
  win_score REAL NOT NULL DEFAULT 0,   -- composite: reply_rate * 0.6 + meeting_rate * 0.4
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_learning_patterns_tenant ON outreach_learning_patterns(tenant_id, pattern_type);
CREATE INDEX idx_learning_patterns_niche ON outreach_learning_patterns(tenant_id, niche);
CREATE UNIQUE INDEX idx_learning_patterns_unique ON outreach_learning_patterns(tenant_id, pattern_type, pattern_key, COALESCE(niche, ''));
