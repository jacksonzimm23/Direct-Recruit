const pool = require('../config/database');
const logger = require('../utils/logger');

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
      logger.error('Error recording profile view:', error);
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

  // Get list of viewers with their profile info (same fields as followers/following)
  static async getViewers(playerId) {
    const result = await pool.query(
      `SELECT
        pv.id,
        pv.viewer_id as id,
        pv.created_at,
        u.role,
        COALESCE(pp.first_name, cp.first_name, op.first_name) as first_name,
        COALESCE(pp.last_name, cp.last_name, op.last_name) as last_name,
        COALESCE(pp.username, cp.username, op.username) as username,
        COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as profile_image_url,
        pp.position as player_position,
        pp.height as player_height,
        pp.weight as player_weight,
        pp.graduation_year,
        pp.team_name as player_team_name,
        pp.state as player_state,
        pp.college_division as player_college_division,
        pp.transfer as is_transfer,
        pp.eligibility as years_of_eligibility,
        cp.position_title as coach_position_title,
        cp.team_name as coach_team_name,
        cp.state as coach_state,
        cp.college_division as coach_college_division,
        op.subheader as other_subheader
      FROM profile_views pv
      JOIN users u ON pv.viewer_id = u.id
      LEFT JOIN player_profiles pp ON u.id = pp.user_id AND u.role = 'player'
      LEFT JOIN coach_profiles cp ON u.id = cp.user_id AND u.role = 'coach'
      LEFT JOIN other_profiles op ON u.id = op.user_id AND u.role = 'other'
      WHERE pv.viewed_player_id = $1
      ORDER BY pv.created_at DESC`,
      [playerId]
    );
    return result.rows;
  }
}

module.exports = ProfileView;
