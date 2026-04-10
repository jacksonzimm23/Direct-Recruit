-- Add followers_count and following_count columns to other_profiles table
-- These columns are needed for the follow system to work correctly for "other" profile types

ALTER TABLE other_profiles
ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0;

ALTER TABLE other_profiles
ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0;

-- Recalculate counts for existing other profiles (safe if no rows exist yet)
UPDATE other_profiles op
SET followers_count = COALESCE((
    SELECT COUNT(*) FROM follows f WHERE f.following_id = op.user_id
), 0);

UPDATE other_profiles op
SET following_count = COALESCE((
    SELECT COUNT(*) FROM follows f WHERE f.follower_id = op.user_id
), 0);
