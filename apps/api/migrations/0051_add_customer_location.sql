-- 0051: Add location columns to customers for mobile trimming
ALTER TABLE customers ADD COLUMN address TEXT;
ALTER TABLE customers ADD COLUMN lat REAL;
ALTER TABLE customers ADD COLUMN lng REAL;
ALTER TABLE customers ADD COLUMN is_mobile_trimming INTEGER DEFAULT 0;
