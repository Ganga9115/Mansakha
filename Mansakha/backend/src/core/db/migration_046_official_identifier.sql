-- Add official_identifier column to officials table
ALTER TABLE officials ADD COLUMN IF NOT EXISTS official_identifier VARCHAR(50);
CREATE UNIQUE INDEX IF NOT EXISTS idx_officials_identifier ON officials(official_identifier);
