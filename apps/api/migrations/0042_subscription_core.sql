-- Subscription core tables for coreType='subscription' verticals (gym, school, etc.)

CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  plan_type TEXT NOT NULL,     -- 'monthly' | 'count' | 'annual'
  price INTEGER NOT NULL,
  count INTEGER,               -- 回数券の場合の回数
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_tenant ON subscription_plans(tenant_id);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'paused' | 'cancelled'
  stripe_subscription_id TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  remaining_count INTEGER,
  paused_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_members_tenant ON members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_members_customer ON members(tenant_id, customer_id);

CREATE TABLE IF NOT EXISTS member_checkins (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  checked_in_at TEXT NOT NULL,
  staff_id TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_member_checkins_tenant ON member_checkins(tenant_id);
CREATE INDEX IF NOT EXISTS idx_member_checkins_member ON member_checkins(member_id);
CREATE INDEX IF NOT EXISTS idx_member_checkins_date ON member_checkins(tenant_id, checked_in_at);

CREATE TABLE IF NOT EXISTS member_qr_codes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_member_qr_tenant ON member_qr_codes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_member_qr_token ON member_qr_codes(token);
