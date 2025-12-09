-- Add profile views tracking for HS players

-- Add cc_views column to player_profiles table
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS cc_views INTEGER DEFAULT 0;

-- Create profile_views table to track unique viewers
CREATE TABLE IF NOT EXISTS profile_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    viewed_player_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- The HS player being viewed
    viewer_id UUID REFERENCES users(id) ON DELETE CASCADE,          -- The user viewing the profile
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(viewed_player_id, viewer_id)  -- Ensure unique views per viewer
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_profile_views_viewed_player ON profile_views(viewed_player_id);
CREATE INDEX IF NOT EXISTS idx_profile_views_viewer ON profile_views(viewer_id);
CREATE INDEX IF NOT EXISTS idx_profile_views_created_at ON profile_views(created_at DESC);
