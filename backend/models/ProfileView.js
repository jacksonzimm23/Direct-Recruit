const pool = require('../config/database');
const logger = require('../utils/logger');

class ProfileView {
  // Record a profile view with 2-day cooldown.
  // If the same viewer viewed the same user within the last 2 days, skip.
  // Returns true if a new view was recorded, false if cooldown is active.
  static async recordView(viewedUserId, viewerId) {
    if (viewedUserId === viewerId) {
      return false;
    }

    try {
      // Check 2-day cooldown
      const existing = await pool.query(
        `SELECT 1 FROM profile_views
         WHERE viewed_user_id = $1 AND viewer_id = $2
         AND created_at > NOW() - INTERVAL '2 days'
         LIMIT 1`,
        [viewedUserId, viewerId]
      );

      if (existing.rows.length > 0) {
        return false; // Cooldown active
      }

      // Insert new view
      await pool.query(
        `INSERT INTO profile_views (viewed_user_id, viewer_id) VALUES ($1, $2)`,
        [viewedUserId, viewerId]
      );

      return true;
    } catch (error) {
      logger.error('Error recording profile view:', error);
      throw error;
    }
  }

  // Get total view count for any user
  static async getViewCount(userId) {
    const result = await pool.query(
      `SELECT COUNT(*)::integer AS view_count FROM profile_views WHERE viewed_user_id = $1`,
      [userId]
    );
    return result.rows[0]?.view_count || 0;
  }

  // Get list of viewers with their profile info (same fields as followers/following)
  static async getViewers(userId) {
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
      WHERE pv.viewed_user_id = $1
      ORDER BY pv.created_at DESC`,
      [userId]
    );
    return result.rows;
  }
}

module.exports = ProfileView;
