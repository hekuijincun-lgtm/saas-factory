-- time_blocks: 時間帯範囲テキスト（例: "14:00〜19:00"）
ALTER TABLE time_blocks ADD COLUMN time_range TEXT DEFAULT NULL;
