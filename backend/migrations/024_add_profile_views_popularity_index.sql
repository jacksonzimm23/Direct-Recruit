-- Migration: 024_add_profile_views_popularity_index
-- Date: 2026-04-30
-- Description: Composite index on profile_views(viewed_user_id, created_at DESC)
--              supporting the 30-day windowed COUNT subquery in
--              playerPopularityExpr (security audit fix #18).

CREATE INDEX IF NOT EXISTS idx_profile_views_user_created
  ON profile_views(viewed_user_id, created_at DESC);
