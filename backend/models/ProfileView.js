const pool = require('../config/database');

class ProfileView {
  // Record a profile view (only for HS players)
  // Returns true if this is a new unique view, false if already viewed
  static async recordView(viewedPlayerId, viewerId) {
    // Don't record if viewing own profile
    if (viewedPlayerId === viewerId) {
      return false;
    }

    try {
      // Try to insert the view (will fail if already exists due to UNIQUE constraint)
      const result = await pool.query(
        `INSERT INTO profile_views (viewed_player_id, viewer_id)
         VALUES ($1, $2)
         ON CONFLICT (viewed_player_id, viewer_id) DO NOTHING
         RETURNING id`,
        [viewedPlayerId, viewerId]
      );

      // If a row was inserted, increment the cc_views count
      if (result.rows.length > 0) {
        await pool.query(
          `UPDATE player_profiles
           SET cc_views = COALESCE(cc_views, 0) + 1
           WHERE user_id = $1`,
          [viewedPlayerId]
        );
        return true;
      }

      return false; // Already viewed before
    } catch (error) {
      console.error('Error recording profile view:', error);
      throw error;
    }
  }

  // Get the view count for a player
  static async getViewCount(playerId) {
    const result = await pool.query(
      `SELECT cc_views FROM player_profiles WHERE user_id = $1`,
      [playerId]
    );
    return result.rows[0]?.cc_views || 0;
  }

  // Get list of viewers with their profile info
  static async getViewers(playerId) {
    const result = await pool.query(
      `SELECT
        pv.id,
        pv.viewer_id,
        pv.created_at,
        u.role,
        CASE
          WHEN u.role = 'player' THEN pp.first_name
          WHEN u.role = 'coach' THEN cp.first_name
        END as first_name,
        CASE
          WHEN u.role = 'player' THEN pp.last_name
          WHEN u.role = 'coach' THEN cp.last_name
        END as last_name,
        CASE
          WHEN u.role = 'player' THEN pp.username
          WHEN u.role = 'coach' THEN cp.username
        END as username,
        CASE
          WHEN u.role = 'player' THEN pp.profile_image_url
          WHEN u.role = 'coach' THEN cp.profile_image_url
        END as profile_image_url,
        CASE
          WHEN u.role = 'player' THEN pp.position
          WHEN u.role = 'coach' THEN cp.position_title
        END as position_or_title,
        CASE
          WHEN u.role = 'player' THEN pp.team_name
          WHEN u.role = 'coach' THEN cp.team_name
        END as school_or_college,
        CASE
          WHEN u.role = 'player' THEN pp.college_division
          WHEN u.role = 'coach' THEN cp.college_division
        END as college_division
      FROM profile_views pv
      JOIN users u ON pv.viewer_id = u.id
      LEFT JOIN player_profiles pp ON u.id = pp.user_id AND u.role = 'player'
      LEFT JOIN coach_profiles cp ON u.id = cp.user_id AND u.role = 'coach'
      WHERE pv.viewed_player_id = $1
      ORDER BY pv.created_at DESC`,
      [playerId]
    );
    return result.rows;
  }
}

module.exports = ProfileView;
