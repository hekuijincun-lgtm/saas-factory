-- LINE credentials per tenant (encrypted at rest)
CREATE TABLE IF NOT EXISTS line_credentials (
  tenant_id TEXT PRIMARY KEY,
  access_token_enc TEXT NOT NULL,
  channel_secret_enc TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_line_credentials_updated_at
ON line_credentials(updated_at);
