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

  // Add a player to the coach's saved list.
  // Security #19: race-free cap enforcement. The original implementation read
  // the count and inserted in separate queries, allowing two concurrent saves
  // to both pass a count<50 check and both insert (TOCTOU). The fix:
  //   1. Per-coach pg_advisory_xact_lock — serializes concurrent saves for
  //      the same coach; saves for different coaches stay parallel.
  //   2. Atomic CTE that gates the INSERT on the count INSIDE a single SQL
  //      statement and returns both the pre-count and whether the insert
  //      actually happened (so we can distinguish cap-reached from duplicate
  //      from fresh-insert).
  static async addPlayer(coachUserId, playerUserId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [`ra_saved:${coachUserId}`]
      );

      const result = await client.query(
        `WITH current_count AS (
           SELECT COUNT(*)::int AS cnt FROM ra_saved_players WHERE coach_user_id = $1
         ),
         inserted AS (
           INSERT INTO ra_saved_players (coach_user_id, player_user_id)
           SELECT $1, $2 FROM current_count WHERE cnt < ${MAX_SAVED}
           ON CONFLICT (coach_user_id, player_user_id) DO NOTHING
           RETURNING id
         )
         SELECT cc.cnt AS pre_count,
                EXISTS(SELECT 1 FROM inserted) AS did_insert
         FROM current_count cc`,
        [coachUserId, playerUserId]
      );

      await client.query('COMMIT');

      const { pre_count, did_insert } = result.rows[0];

      if (pre_count >= MAX_SAVED && !did_insert) {
        return { success: false, error: 'Saved list full — maximum 50 players', count: pre_count };
      }
      // Either fresh insert (count + 1) or duplicate (count unchanged); both
      // are idempotent successes from the caller's perspective.
      return { success: true, count: did_insert ? pre_count + 1 : pre_count };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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
        pp.username
       FROM ra_saved_players rs
       JOIN player_profiles pp ON pp.user_id = rs.player_user_id
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
