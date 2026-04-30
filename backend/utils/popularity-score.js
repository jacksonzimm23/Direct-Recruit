// Popularity score SQL expressions for ranking profiles on discover pages
// and suggested connections. Uses existing columns: followers_count, cc_views,
// coach_profile_views, and post engagement_score (30-day window).

// Security #18: replaced lifetime `cc_views` counter with a 30-day windowed
// COUNT against profile_views. Old views age out within 30 days, capping
// the inflation horizon for any successful Sybil attack. Mirrors the
// coachPopularityExpr pattern below. The cc_views column is still updated
// by the view-record route and consumed by the player's own view-count UI —
// it's just no longer a ranking signal.
function playerPopularityExpr(alias = 'pp') {
  return `(
    (COALESCE(${alias}.followers_count, 0) * 3.0)
    + COALESCE((
        SELECT COUNT(*) FROM profile_views pv
        WHERE pv.viewed_user_id = ${alias}.user_id
          AND pv.created_at > NOW() - INTERVAL '30 days'
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
