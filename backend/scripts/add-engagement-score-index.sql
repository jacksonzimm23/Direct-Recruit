-- Add index on engagement_score for feed ranking queries
-- Date: 2026-04-10

CREATE INDEX IF NOT EXISTS idx_posts_engagement_score
  ON posts(engagement_score DESC NULLS LAST, created_at DESC);
