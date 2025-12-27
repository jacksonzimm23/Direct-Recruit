-- Migration: Add video_url column to player_highlights table
-- This allows storing S3 video keys for uploaded highlight videos

-- Add video_url column (nullable since highlights can be either Hudl links OR uploaded videos)
ALTER TABLE player_highlights ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Make hudl_link nullable since highlights can now be videos instead
ALTER TABLE player_highlights ALTER COLUMN hudl_link DROP NOT NULL;

-- Add check constraint to ensure at least one of hudl_link or video_url is provided
-- (commented out for now - can be added later if needed)
-- ALTER TABLE player_highlights ADD CONSTRAINT chk_highlight_source
--     CHECK (hudl_link IS NOT NULL OR video_url IS NOT NULL);
