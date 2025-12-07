-- Add conference column to coach_profiles table
ALTER TABLE coach_profiles ADD COLUMN IF NOT EXISTS conference VARCHAR(100);
