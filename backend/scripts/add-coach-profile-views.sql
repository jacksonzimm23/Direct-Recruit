-- Track when players view coach profiles
-- Used by Portal Intelligence to detect college players browsing coaches from other teams
-- Unlike profile_views (which deduplicates), this records EVERY view for frequency analysis

CREATE TABLE IF NOT EXISTS coach_profile_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    viewed_coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Index for finding all coaches a specific player has viewed
CREATE INDEX IF NOT EXISTS idx_coach_profile_views_viewer ON coach_profile_views(viewer_id);

-- Index for finding all players who viewed a specific coach
CREATE INDEX IF NOT EXISTS idx_coach_profile_views_coach ON coach_profile_views(viewed_coach_id);

-- Index for time-based queries (recent views within last N days)
CREATE INDEX IF NOT EXISTS idx_coach_profile_views_created ON coach_profile_views(created_at DESC);

-- Composite index for the Portal Intelligence signal query:
-- "Find players who viewed coaches from other teams in the last N days"
CREATE INDEX IF NOT EXISTS idx_coach_profile_views_viewer_created ON coach_profile_views(viewer_id, created_at DESC);
