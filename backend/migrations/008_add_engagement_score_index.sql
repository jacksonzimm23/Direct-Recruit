-- Migration: 008_add_engagement_score_index
-- Date: 2026-04-10
-- Description: Add composite index on engagement_score + created_at for feed ranking queries

CREATE INDEX IF NOT EXISTS idx_posts_engagement_score
  ON posts(engagement_score DESC NULLS LAST, created_at DESC);
