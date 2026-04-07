-- 0052: Add actual duration and mobile trimming fields to reservations
ALTER TABLE reservations ADD COLUMN actual_duration_minutes INTEGER;
ALTER TABLE reservations ADD COLUMN is_first_visit INTEGER DEFAULT 0;
ALTER TABLE reservations ADD COLUMN is_puppy INTEGER DEFAULT 0;
ALTER TABLE reservations ADD COLUMN travel_minutes_before INTEGER;
