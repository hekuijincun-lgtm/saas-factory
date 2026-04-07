-- 0048_breed_size_pricing.sql
-- Breed × Size pricing: per-menu pricing rules based on pet breed and size.

CREATE TABLE IF NOT EXISTS breed_size_pricing (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  menu_id TEXT NOT NULL,
  breed TEXT NOT NULL,
  size TEXT NOT NULL,
  price INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_breed_pricing_tenant ON breed_size_pricing(tenant_id);
CREATE INDEX IF NOT EXISTS idx_breed_pricing_menu ON breed_size_pricing(tenant_id, menu_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_breed_pricing_unique ON breed_size_pricing(tenant_id, menu_id, breed, size);

-- Breeds master: preset breed list for quick selection
CREATE TABLE IF NOT EXISTS breeds_master (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  default_size TEXT,
  category TEXT NOT NULL DEFAULT 'dog',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Seed preset breeds
INSERT OR IGNORE INTO breeds_master (id, name, default_size, category, sort_order) VALUES
  ('breed_toy_poodle',       'トイプードル',             'small',  'dog', 1),
  ('breed_chihuahua',        'チワワ',                   'small',  'dog', 2),
  ('breed_min_dachshund',    'ミニチュアダックスフンド', 'small',  'dog', 3),
  ('breed_pomeranian',       'ポメラニアン',             'small',  'dog', 4),
  ('breed_shiba',            '柴犬',                     'medium', 'dog', 5),
  ('breed_shih_tzu',         'シーズー',                 'small',  'dog', 6),
  ('breed_yorkshire',        'ヨークシャーテリア',       'small',  'dog', 7),
  ('breed_maltese',          'マルチーズ',               'small',  'dog', 8),
  ('breed_min_schnauzer',    'ミニチュアシュナウザー',   'small',  'dog', 9),
  ('breed_papillon',         'パピヨン',                 'small',  'dog', 10),
  ('breed_french_bulldog',   'フレンチブルドッグ',       'medium', 'dog', 11),
  ('breed_golden_retriever', 'ゴールデンレトリバー',     'large',  'dog', 12),
  ('breed_labrador',         'ラブラドールレトリバー',   'large',  'dog', 13),
  ('breed_corgi',            'コーギー',                 'medium', 'dog', 14),
  ('breed_bichon_frise',     'ビションフリーゼ',         'small',  'dog', 15),
  ('breed_mix_small',        'MIX犬（小型）',            'small',  'dog', 16),
  ('breed_mix_medium',       'MIX犬（中型）',            'medium', 'dog', 17),
  ('breed_mix_large',        'MIX犬（大型）',            'large',  'dog', 18),
  ('breed_cat_short',        '猫（短毛）',               'small',  'cat', 19),
  ('breed_cat_long',         '猫（長毛）',               'small',  'cat', 20);
