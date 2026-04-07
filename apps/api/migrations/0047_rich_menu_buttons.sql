-- リッチメニューボタン設定テーブル
CREATE TABLE IF NOT EXISTS rich_menu_buttons (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  template TEXT NOT NULL DEFAULT 'pet-default',
  button_index INTEGER NOT NULL,
  label TEXT NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'uri',
  action_value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rmb_tenant ON rich_menu_buttons(tenant_id, template);
