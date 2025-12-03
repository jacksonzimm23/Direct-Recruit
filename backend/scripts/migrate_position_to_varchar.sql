-- Migration: Change position column from ENUM to VARCHAR to support multiple positions

-- Step 1: Add a temporary VARCHAR column
ALTER TABLE player_profiles ADD COLUMN position_temp VARCHAR(100);

-- Step 2: Copy data from old position column to new column (convert ENUM to string)
UPDATE player_profiles SET position_temp = position::text WHERE position IS NOT NULL;

-- Step 3: Drop the old position column
ALTER TABLE player_profiles DROP COLUMN position;

-- Step 4: Rename the temp column to position
ALTER TABLE player_profiles RENAME COLUMN position_temp TO position;

-- Step 5: Drop the old ENUM type (optional - only if not used elsewhere)
-- DROP TYPE IF EXISTS position_type CASCADE;

-- Note: The position column can now store strings like "CB", "CB/WR", "QB/WR/RB", etc.
