// Popularity score SQL expressions for ranking profiles on discover pages
// and suggested connections. Uses existing columns: followers_count, cc_views,
// coach_profile_views, and post engagement_score (30-day window).

function playerPopularityExpr(alias = 'pp') {
  return `(
    (COALESCE(${alias}.followers_count, 0) * 3.0)
    + (COALESCE(${alias}.cc_views, 0) * 1.0)
    + COALESCE((
        SELECT SUM(COALESCE(p.engagement_score, 0))
        FROM posts p
        WHERE p.user_id = ${alias}.user_id
          AND p.created_at > NOW() - INTERVAL '30 days'
          AND (p.is_deleted = false OR p.is_deleted IS NULL)
      ), 0) * 2.0
  )`;
}

function coachPopularityExpr(alias = 'cp') {
  return `(
    (COALESCE(${alias}.followers_count, 0) * 3.0)
    + COALESCE((
        SELECT COUNT(*) FROM coach_profile_views cpv
        WHERE cpv.viewed_coach_id = ${alias}.user_id
          AND cpv.created_at > NOW() - INTERVAL '30 days'
      ), 0) * 1.0
    + COALESCE((
        SELECT SUM(COALESCE(p.engagement_score, 0))
        FROM posts p
        WHERE p.user_id = ${alias}.user_id
          AND p.created_at > NOW() - INTERVAL '30 days'
          AND (p.is_deleted = false OR p.is_deleted IS NULL)
      ), 0) * 2.0
  )`;
}

function otherPopularityExpr(alias = 'op') {
  return `(
    (COALESCE(${alias}.followers_count, 0) * 3.0)
    + COALESCE((
        SELECT SUM(COALESCE(p.engagement_score, 0))
        FROM posts p
        WHERE p.user_id = ${alias}.user_id
          AND p.created_at > NOW() - INTERVAL '30 days'
          AND (p.is_deleted = false OR p.is_deleted IS NULL)
      ), 0) * 2.0
  )`;
}

module.exports = { playerPopularityExpr, coachPopularityExpr, otherPopularityExpr };
