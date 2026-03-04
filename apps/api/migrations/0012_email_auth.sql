-- 0012_email_auth.sql
-- Magic-link (email-based) authentication for admin login.
-- Adds alongside existing LINE auth — no existing tables modified.
--
-- Apply:
--   wrangler d1 execute saas-factory-staging --file=migrations/0012_email_auth.sql --env production
--   wrangler d1 execute saas-factory-staging --file=migrations/0012_email_auth.sql --local
--
-- Security notes:
--   - Only token_hash (SHA-256) is stored — plaintext token never persisted.
--   - identity_key = "email:<lowercase_email>" mirrors admin:members KV lineUserId field.
--   - bootstrap_key (if any) is carried through the login round-trip and consumed on verify.

CREATE TABLE IF NOT EXISTS auth_magic_links (
  token_hash    TEXT    NOT NULL PRIMARY KEY,
  identity_key  TEXT    NOT NULL,            -- "email:<normalized_email>"
  tenant_id     TEXT    NOT NULL DEFAULT 'default',
  expires_at    INTEGER NOT NULL,            -- Unix seconds (now + 600)
  used_at       INTEGER,                     -- NULL until consumed
  return_to     TEXT,                        -- safe redirect path after login
  bootstrap_key TEXT                         -- optional: carries bootstrapKey through login
);

CREATE INDEX IF NOT EXISTS idx_magic_links_identity
  ON auth_magic_links(identity_key);

CREATE INDEX IF NOT EXISTS idx_magic_links_expires
  ON auth_magic_links(expires_at);
