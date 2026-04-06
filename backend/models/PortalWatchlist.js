const pool = require('../config/database');

const MAX_WATCHLIST_SIZE = 50;

class PortalWatchlist {
  // Get the count of watched players for a coach
  static async getCount(coachUserId) {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM portal_watchlist WHERE coach_user_id = $1',
      [coachUserId]
    );
    return parseInt(result.rows[0].count);
  }

  // Add a player to the coach's watchlist
  static async addPlayer(coachUserId, playerUserId) {
    const count = await this.getCount(coachUserId);
    if (count >= MAX_WATCHLIST_SIZE) {
      return { success: false, error: 'Watchlist full — maximum 50 players', count };
    }

    await pool.query(
      `INSERT INTO portal_watchlist (coach_user_id, player_user_id)
       VALUES ($1, $2)
       ON CONFLICT (coach_user_id, player_user_id) DO NOTHING`,
      [coachUserId, playerUserId]
    );

    const newCount = await this.getCount(coachUserId);
    return { success: true, count: newCount };
  }

  // Remove a player from the coach's watchlist
  static async removePlayer(coachUserId, playerUserId) {
    await pool.query(
      'DELETE FROM portal_watchlist WHERE coach_user_id = $1 AND player_user_id = $2',
      [coachUserId, playerUserId]
    );
    const count = await this.getCount(coachUserId);
    return { success: true, count };
  }

  // Remove all players from the coach's watchlist
  static async removeAll(coachUserId) {
    await pool.query(
      'DELETE FROM portal_watchlist WHERE coach_user_id = $1',
      [coachUserId]
    );
  }

  // Get the full watchlist with player profile data
  static async getWatchlist(coachUserId) {
    const result = await pool.query(
      `SELECT
        pw.player_user_id as user_id,
        pw.created_at as watched_since,
        pp.first_name,
        pp.last_name,
        pp.position,
        pp.height,
        pp.weight,
        pp.gpa,
        pp.team_name,
        pp.college_division,
        pp.transfer,
        pp.eligibility,
        pp.graduation_year,
        pp.state,
        pp.profile_image_url,
        u.username
       FROM portal_watchlist pw
       JOIN player_profiles pp ON pp.user_id = pw.player_user_id
       JOIN users u ON u.id = pw.player_user_id
       WHERE pw.coach_user_id = $1
       ORDER BY pw.created_at DESC`,
      [coachUserId]
    );
    return result.rows;
  }

  // Batch check which player IDs are in the coach's watchlist
  static async checkPlayers(coachUserId, playerUserIds) {
    if (!playerUserIds || playerUserIds.length === 0) return [];

    const result = await pool.query(
      `SELECT player_user_id FROM portal_watchlist
       WHERE coach_user_id = $1 AND player_user_id = ANY($2::uuid[])`,
      [coachUserId, playerUserIds]
    );
    return result.rows.map(r => r.player_user_id);
  }

  // Get all coaches watching a specific player (for notification trigger)
  static async getCoachesWatching(playerUserId) {
    const result = await pool.query(
      'SELECT coach_user_id FROM portal_watchlist WHERE player_user_id = $1',
      [playerUserId]
    );
    return result.rows.map(r => r.coach_user_id);
  }
}

module.exports = PortalWatchlist;
