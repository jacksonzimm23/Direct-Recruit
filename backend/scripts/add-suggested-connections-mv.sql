-- Local-dev seed mirror of backend/migrations/026_add_suggested_connections_mv.sql
-- Materialized view for suggested connections, refreshed every 15 min by
-- backend/server.js. Replaces the per-request ORDER BY RANDOM()
-- correlated-subquery query at backend/routes/profile.js (security audit #33).
-- Uses 30-day windowed profile_views/coach_profile_views counts and post
-- engagement_score (matches popularity-score.js, security #18). Does NOT
-- project users.email (security #32).

CREATE MATERIALIZED VIEW IF NOT EXISTS suggested_connections_mv AS
WITH post_engagement_30d AS (
  SELECT p.user_id, SUM(COALESCE(p.engagement_score, 0)) AS engagement_30d
  FROM posts p
  WHERE p.created_at > NOW() - INTERVAL '30 days'
    AND (p.is_deleted = false OR p.is_deleted IS NULL)
  GROUP BY p.user_id
),
profile_views_30d AS (
  SELECT pv.viewed_user_id AS user_id, COUNT(*) AS view_count_30d
  FROM profile_views pv
  WHERE pv.created_at > NOW() - INTERVAL '30 days'
  GROUP BY pv.viewed_user_id
),
coach_views_30d AS (
  SELECT cpv.viewed_coach_id AS user_id, COUNT(*) AS view_count_30d
  FROM coach_profile_views cpv
  WHERE cpv.created_at > NOW() - INTERVAL '30 days'
  GROUP BY cpv.viewed_coach_id
)
SELECT
  u.id AS user_id,
  u.role,
  COALESCE(pp.first_name, cp.first_name, op.first_name, '')                    AS first_name,
  COALESCE(pp.last_name,  cp.last_name,  op.last_name,  '')                    AS last_name,
  COALESCE(pp.username,   cp.username,   op.username,   '')                    AS username,
  COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) AS profile_image_url,
  COALESCE(pp.position, '')                                                    AS player_position,
  COALESCE(pp.team_name, cp.team_name, '')                                     AS team_name,
  COALESCE(pp.state, cp.state, '')                                             AS state,
  pp.height                                                                    AS player_height,
  pp.weight                                                                    AS player_weight,
  pp.graduation_year                                                           AS graduation_year,
  COALESCE(pp.college_division, cp.college_division, '')                       AS college_division,
  pp.eligibility                                                               AS eligibility,
  COALESCE(pp.transfer, '')                                                    AS transfer,
  COALESCE(cp.position_title, '')                                              AS coach_position_title,
  COALESCE(op.subheader, '')                                                   AS other_subheader,
  CASE
    WHEN u.role = 'player' THEN
      CASE
        WHEN pp.transfer = 'y' THEN 'transfer'
        WHEN pp.college_division IS NOT NULL AND pp.college_division != '' THEN 'college'
        ELSE 'hs'
      END
    WHEN u.role = 'coach' THEN
      CASE
        WHEN cp.college_division IS NOT NULL AND cp.college_division != '' THEN 'college'
        ELSE 'hs'
      END
    WHEN u.role = 'other' THEN 'other'
    ELSE 'unknown'
  END AS profile_type,
  (
    (COALESCE(pp.followers_count, cp.followers_count, op.followers_count, 0) * 3.0)
    + COALESCE(
        CASE
          WHEN u.role = 'player' THEN pv30.view_count_30d
          WHEN u.role = 'coach'  THEN cv30.view_count_30d
          ELSE 0
        END, 0) * 1.0
    + COALESCE(pe30.engagement_30d, 0) * 2.0
  ) AS base_popularity_score,
  RANDOM() AS random_seed
FROM users u
LEFT JOIN player_profiles pp ON u.id = pp.user_id
LEFT JOIN coach_profiles  cp ON u.id = cp.user_id
LEFT JOIN other_profiles  op ON u.id = op.user_id
LEFT JOIN post_engagement_30d pe30 ON u.id = pe30.user_id
LEFT JOIN profile_views_30d   pv30 ON u.id = pv30.user_id
LEFT JOIN coach_views_30d     cv30 ON u.id = cv30.user_id
WHERE u.profile_completed = true
  AND u.is_active = true
  AND (pp.user_id IS NOT NULL OR cp.user_id IS NOT NULL OR op.user_id IS NOT NULL)
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS suggested_connections_mv_user_id_uidx
  ON suggested_connections_mv (user_id);

CREATE INDEX IF NOT EXISTS suggested_connections_mv_score_idx
  ON suggested_connections_mv (base_popularity_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS suggested_connections_mv_state_idx
  ON suggested_connections_mv (state)
  WHERE state IS NOT NULL AND state != '';
