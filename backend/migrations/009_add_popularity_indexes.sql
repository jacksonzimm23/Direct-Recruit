-- Migration: 009_add_popularity_indexes
-- Date: 2026-04-10
-- Description: Add indexes to support engagement-based ranking on discover pages and suggested connections

-- followers_count indexes for sorting (all three profile tables)
CREATE INDEX IF NOT EXISTS idx_player_profiles_followers_count
  ON player_profiles(followers_count DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_coach_profiles_followers_count
  ON coach_profiles(followers_count DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_other_profiles_followers_count
  ON other_profiles(followers_count DESC NULLS LAST);

-- posts index for the 30-day engagement subquery (user_id + created_at composite)
CREATE INDEX IF NOT EXISTS idx_posts_user_engagement
  ON posts(user_id, created_at DESC)
  WHERE (is_deleted = false OR is_deleted IS NULL);

-- follows index for excluding already-followed users in suggested connections
CREATE INDEX IF NOT EXISTS idx_follows_follower_following
  ON follows(follower_id, following_id);
