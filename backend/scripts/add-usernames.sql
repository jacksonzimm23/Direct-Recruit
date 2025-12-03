-- Add username fields to profiles

-- Add username to player_profiles
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE;

-- Add username to coach_profiles
ALTER TABLE coach_profiles ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE;

-- Create indexes for username search
CREATE INDEX IF NOT EXISTS idx_player_profiles_username ON player_profiles(username);
CREATE INDEX IF NOT EXISTS idx_coach_profiles_username ON coach_profiles(username);

-- Create indexes for name search
CREATE INDEX IF NOT EXISTS idx_player_profiles_first_name ON player_profiles(first_name);
CREATE INDEX IF NOT EXISTS idx_player_profiles_last_name ON player_profiles(last_name);
CREATE INDEX IF NOT EXISTS idx_coach_profiles_first_name ON coach_profiles(first_name);
CREATE INDEX IF NOT EXISTS idx_coach_profiles_last_name ON coach_profiles(last_name);
