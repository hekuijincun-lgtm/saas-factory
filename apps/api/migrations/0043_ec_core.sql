-- EC core tables for coreType='ec' verticals (shop, food, handmade, etc.)

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  category_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,
  compare_price INTEGER,
  sku TEXT,
  stock INTEGER DEFAULT 0,
  is_unlimited_stock INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  images TEXT DEFAULT '[]',
  attributes TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(tenant_id, category_id);

CREATE TABLE IF NOT EXISTS product_categories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_product_categories_tenant ON product_categories(tenant_id);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  total INTEGER NOT NULL,
  shipping_fee INTEGER DEFAULT 0,
  shipping_name TEXT,
  shipping_address TEXT,
  shipping_phone TEXT,
  stripe_payment_intent_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cart_tenant_session ON cart_items(tenant_id, session_id);

CREATE TABLE IF NOT EXISTS shipping_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  fee INTEGER NOT NULL,
  free_threshold INTEGER,
  is_default INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_shipping_tenant ON shipping_rules(tenant_id);
