-- Enable pg_trgm extension for fuzzy/typo-tolerant search
-- This is a free built-in PostgreSQL extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Set similarity threshold (lower = more forgiving, default is 0.3)
-- 0.2 catches more typos while still being relevant
ALTER DATABASE CURRENT_DATABASE() SET pg_trgm.similarity_threshold = 0.2;

-- Add GIN trigram indexes for fast fuzzy search on player_profiles
CREATE INDEX IF NOT EXISTS idx_player_first_name_trgm ON player_profiles USING GIN (first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_player_last_name_trgm ON player_profiles USING GIN (last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_player_username_trgm ON player_profiles USING GIN (username gin_trgm_ops);

-- Add GIN trigram indexes for fast fuzzy search on coach_profiles
CREATE INDEX IF NOT EXISTS idx_coach_first_name_trgm ON coach_profiles USING GIN (first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_coach_last_name_trgm ON coach_profiles USING GIN (last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_coach_username_trgm ON coach_profiles USING GIN (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_coach_team_name_trgm ON coach_profiles USING GIN (team_name gin_trgm_ops);

-- Add GIN trigram indexes for fast fuzzy search on other_profiles
CREATE INDEX IF NOT EXISTS idx_other_first_name_trgm ON other_profiles USING GIN (first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_other_last_name_trgm ON other_profiles USING GIN (last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_other_username_trgm ON other_profiles USING GIN (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_other_subheader_trgm ON other_profiles USING GIN (subheader gin_trgm_ops);
