-- Security #18: composite index supporting the 30-day windowed COUNT in
-- playerPopularityExpr (backend/utils/popularity-score.js). Existing
-- single-column indexes on viewed_user_id and created_at work for the query,
-- but a composite is faster on hot profiles with many views. Mirrors the
-- lessons.md #68 pattern of adding popularity-specific indexes alongside
-- formula changes.

CREATE INDEX IF NOT EXISTS idx_profile_views_user_created
  ON profile_views(viewed_user_id, created_at DESC);
