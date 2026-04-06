const pool = require('../config/database');

const MAX_SAVED = 50;

class RaSavedPlayers {
  // Get the count of saved players for a coach
  static async getCount(coachUserId) {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM ra_saved_players WHERE coach_user_id = $1',
      [coachUserId]
    );
    return parseInt(result.rows[0].count);
  }

  // Add a player to the coach's saved list
  static async addPlayer(coachUserId, playerUserId) {
    const count = await this.getCount(coachUserId);
    if (count >= MAX_SAVED) {
      return { success: false, error: 'Saved list full — maximum 50 players', count };
    }

    await pool.query(
      `INSERT INTO ra_saved_players (coach_user_id, player_user_id)
       VALUES ($1, $2)
       ON CONFLICT (coach_user_id, player_user_id) DO NOTHING`,
      [coachUserId, playerUserId]
    );

    const newCount = await this.getCount(coachUserId);
    return { success: true, count: newCount };
  }

  // Remove a player from the coach's saved list
  static async removePlayer(coachUserId, playerUserId) {
    await pool.query(
      'DELETE FROM ra_saved_players WHERE coach_user_id = $1 AND player_user_id = $2',
      [coachUserId, playerUserId]
    );
    const count = await this.getCount(coachUserId);
    return { success: true, count };
  }

  // Remove all players from the coach's saved list
  static async removeAll(coachUserId) {
    await pool.query(
      'DELETE FROM ra_saved_players WHERE coach_user_id = $1',
      [coachUserId]
    );
  }

  // Get the full saved list with player profile data
  static async getSavedPlayers(coachUserId) {
    const result = await pool.query(
      `SELECT
        rs.player_user_id as user_id,
        rs.saved_at,
        pp.first_name,
        pp.last_name,
        pp.position,
        pp.height,
        pp.weight,
        pp.gpa,
        pp.team_name,
        pp.state,
        pp.college_division,
        pp.transfer,
        pp.graduation_year,
        pp.eligibility,
        pp.offers,
        pp.profile_image_url,
        u.username
       FROM ra_saved_players rs
       JOIN player_profiles pp ON pp.user_id = rs.player_user_id
       JOIN users u ON u.id = rs.player_user_id
       WHERE rs.coach_user_id = $1
       ORDER BY rs.saved_at DESC`,
      [coachUserId]
    );
    return result.rows;
  }

  // Batch check which player IDs are in the coach's saved list
  static async checkPlayers(coachUserId, playerUserIds) {
    if (!playerUserIds || playerUserIds.length === 0) return [];

    const result = await pool.query(
      `SELECT player_user_id FROM ra_saved_players
       WHERE coach_user_id = $1 AND player_user_id = ANY($2::uuid[])`,
      [coachUserId, playerUserIds]
    );
    return result.rows.map(r => r.player_user_id);
  }
}

module.exports = RaSavedPlayers;
