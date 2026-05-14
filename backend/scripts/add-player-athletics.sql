-- add-player-athletics.sql
-- Adds Athletics fields to player_profiles for hsplayer + transferplayer.
-- other_sports: array of sport names; 'Other' free-text stored as 'other:<text>'.
-- track_100m / track_200m: decimal seconds (e.g. 11.25).
ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS other_sports TEXT[],
  ADD COLUMN IF NOT EXISTS track_100m  NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS track_200m  NUMERIC(5,2);
