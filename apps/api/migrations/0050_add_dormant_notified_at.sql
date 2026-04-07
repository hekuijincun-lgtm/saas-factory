-- 0050: Add dormant_notified_at to customers for dormant recovery dedup
ALTER TABLE customers ADD COLUMN dormant_notified_at TEXT;
