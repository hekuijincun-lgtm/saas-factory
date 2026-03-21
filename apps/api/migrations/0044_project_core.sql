-- Project core tables for coreType='project' verticals (construction, reform, equipment)

-- projects: 案件管理
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  customer_address TEXT,
  status TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'in_progress' | 'completed' | 'cancelled'
  start_date TEXT,
  end_date TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(tenant_id, status);

-- project_phases: 工程
CREATE TABLE IF NOT EXISTS project_phases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',  -- 'pending' | 'in_progress' | 'completed'
  start_date TEXT,
  end_date TEXT
);
CREATE INDEX IF NOT EXISTS idx_phases_project ON project_phases(project_id);

-- project_tasks: タスク
CREATE TABLE IF NOT EXISTS project_tasks (
  id TEXT PRIMARY KEY,
  phase_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_done INTEGER DEFAULT 0,
  assignee TEXT,
  due_date TEXT,
  sort_order INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tasks_phase ON project_tasks(phase_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON project_tasks(project_id);

-- estimates: 見積書
CREATE TABLE IF NOT EXISTS estimates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'draft',  -- 'draft' | 'sent' | 'accepted' | 'rejected'
  subtotal INTEGER DEFAULT 0,
  tax INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  note TEXT,
  valid_until TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_estimates_project ON estimates(project_id);
CREATE INDEX IF NOT EXISTS idx_estimates_tenant ON estimates(tenant_id);

-- estimate_items: 見積明細
CREATE TABLE IF NOT EXISTS estimate_items (
  id TEXT PRIMARY KEY,
  estimate_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  unit TEXT DEFAULT '式',
  unit_price INTEGER NOT NULL,
  amount INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_estimate_items ON estimate_items(estimate_id);

-- invoices: 請求書
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  estimate_id TEXT,
  tenant_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'unpaid',  -- 'unpaid' | 'paid' | 'overdue'
  total INTEGER NOT NULL,
  due_date TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);

-- project_partners: 協力業者
CREATE TABLE IF NOT EXISTS project_partners (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  specialty TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_partners_tenant ON project_partners(tenant_id);

-- project_photos: 現場写真
CREATE TABLE IF NOT EXISTS project_photos (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  image_key TEXT NOT NULL,
  caption TEXT,
  taken_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_project ON project_photos(project_id);
