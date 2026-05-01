const pool = require('../config/database');
const logger = require('../utils/logger');

class CoachProfileView {
  // Record a coach profile view (no dedup — every view counts for frequency analysis)
  static async recordView(viewedCoachId, viewerId) {
    if (viewedCoachId === viewerId) return false;

    try {
      await pool.query(
        `INSERT INTO coach_profile_views (viewed_coach_id, viewer_id)
         VALUES ($1, $2)`,
        [viewedCoachId, viewerId]
      );
      return true;
    } catch (error) {
      logger.error('Error recording coach profile view:', error);
      throw error;
    }
  }

  // Get all coach profiles a specific player viewed in the last N days
  // Joined with coach_profiles to get team_name for same-team filtering
  // NOTE: no LIMIT — only called internally by getPlayersViewingExternalCoaches
  // (PI signal). If ever exposed via a public route, paginate using the same
  // pattern as ProfileView.getViewers() (security #21).
  static async getViewsByPlayer(viewerUserId, days = 14) {
    const result = await pool.query(
      `SELECT cpv.viewed_coach_id, cpv.created_at,
              cp.first_name, cp.last_name, cp.team_name, cp.college_division,
              cp.position_title, cp.state
       FROM coach_profile_views cpv
       JOIN coach_profiles cp ON cpv.viewed_coach_id = cp.user_id
       WHERE cpv.viewer_id = $1
         AND cpv.created_at >= NOW() - INTERVAL '1 day' * $2
       ORDER BY cpv.created_at DESC`,
      [viewerUserId, days]
    );
    return result.rows;
  }

  // Portal Intelligence signal query:
  // Find college players who viewed coaches from teams OTHER than their own
  // Returns player user_ids with the count of external coach views and coach details
  static async getPlayersViewingExternalCoaches(days = 14, limit = 50) {
    const result = await pool.query(
      `SELECT
         pp.user_id,
         COUNT(DISTINCT cpv.viewed_coach_id) AS external_coach_count,
         COUNT(cpv.id) AS total_view_count,
         ARRAY_AGG(DISTINCT cp.team_name) AS viewed_teams
       FROM coach_profile_views cpv
       JOIN player_profiles pp ON cpv.viewer_id = pp.user_id
       JOIN coach_profiles cp ON cpv.viewed_coach_id = cp.user_id
       WHERE cpv.created_at >= NOW() - INTERVAL '1 day' * $1
         AND pp.college_division IS NOT NULL
         AND pp.college_division != ''
         AND (pp.transfer IS NULL OR pp.transfer != 'y')
         AND LOWER(TRIM(pp.team_name)) != LOWER(TRIM(cp.team_name))
       GROUP BY pp.user_id
       ORDER BY external_coach_count DESC
       LIMIT $2`,
      [days, limit]
    );
    return result.rows;
  }
}

module.exports = CoachProfileView;
