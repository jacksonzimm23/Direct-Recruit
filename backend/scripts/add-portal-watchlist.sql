-- Portal Watchlist table
-- Allows college coaches to flag players from Portal Intelligence results
-- and receive notifications when those players enter the transfer portal

CREATE TABLE IF NOT EXISTS portal_watchlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    player_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(coach_user_id, player_user_id)
);

CREATE INDEX IF NOT EXISTS idx_portal_watchlist_coach ON portal_watchlist(coach_user_id);
CREATE INDEX IF NOT EXISTS idx_portal_watchlist_player ON portal_watchlist(player_user_id);
