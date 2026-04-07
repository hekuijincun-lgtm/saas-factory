-- 空き枠ブロックテーブル（予約不可スロット）
CREATE TABLE IF NOT EXISTS time_blocks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  date TEXT NOT NULL,           -- YYYY-MM-DD
  block_type TEXT NOT NULL,     -- 'closed' | 'full' | 'partial'
  available_slots TEXT,         -- JSON配列 例: ["9:00","13:00"] partialの場合
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_time_blocks_tenant_date ON time_blocks(tenant_id, date);
