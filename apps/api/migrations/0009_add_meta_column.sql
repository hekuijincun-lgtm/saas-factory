-- Migration 0009: add meta column to reservations
-- Stores eyebrow karte data (design, consent log, images) as JSON text
-- Backward compatible: existing rows will have meta = NULL

ALTER TABLE reservations ADD COLUMN meta TEXT;
