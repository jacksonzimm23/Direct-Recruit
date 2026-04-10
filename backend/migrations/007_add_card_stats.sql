-- Migration: 007_add_card_stats.sql
-- Date: 2026-04-10
-- Description: Add player card stat columns to player_profiles for transfer portal cards

ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS lastseasonstat1 VARCHAR(50);
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS lastseasonstat2 VARCHAR(50);
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS lastseasonstat3 VARCHAR(50);
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS careerstat1 VARCHAR(50);
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS careerstat2 VARCHAR(50);
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS careerstat3 VARCHAR(50);
