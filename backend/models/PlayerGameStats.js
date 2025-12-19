const pool = require('../config/database');

class PlayerGameStats {
  // Get all games with stats for a player by user_id
  static async getByUserId(userId) {
    // First get the player_profile id
    const profileResult = await pool.query(
      'SELECT id FROM player_profiles WHERE user_id = $1',
      [userId]
    );

    if (profileResult.rows.length === 0) {
      return [];
    }

    const playerId = profileResult.rows[0].id;
    return this.getByPlayerId(playerId);
  }

  // Get all games with stats for a player by player_profile id
  static async getByPlayerId(playerId) {
    const result = await pool.query(
      `SELECT
        pg.id as game_id,
        pg.game_date,
        pg.season_year,
        pg.opponent,
        pg.result,
        pg.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'position', pgs.position,
              'stats', pgs.stats
            )
          ) FILTER (WHERE pgs.id IS NOT NULL),
          '[]'
        ) as position_stats
      FROM player_games pg
      LEFT JOIN player_game_stats pgs ON pg.id = pgs.game_id
      WHERE pg.player_id = $1
      GROUP BY pg.id, pg.game_date, pg.season_year, pg.opponent, pg.result, pg.created_at
      ORDER BY pg.created_at DESC`,
      [playerId]
    );

    return result.rows;
  }

  // Get games by username (for viewing other profiles)
  static async getByUsername(username) {
    const profileResult = await pool.query(
      'SELECT id FROM player_profiles WHERE username = $1',
      [username]
    );

    if (profileResult.rows.length === 0) {
      return [];
    }

    return this.getByPlayerId(profileResult.rows[0].id);
  }

  // Get a single game with all its stats
  static async getGameById(gameId) {
    const result = await pool.query(
      `SELECT
        pg.id as game_id,
        pg.game_date,
        pg.season_year,
        pg.opponent,
        pg.result,
        COALESCE(
          json_agg(
            json_build_object(
              'position', pgs.position,
              'stats', pgs.stats
            )
          ) FILTER (WHERE pgs.id IS NOT NULL),
          '[]'
        ) as position_stats
      FROM player_games pg
      LEFT JOIN player_game_stats pgs ON pg.id = pgs.game_id
      WHERE pg.id = $1
      GROUP BY pg.id`,
      [gameId]
    );

    return result.rows[0] || null;
  }

  // Create a new game with position stats
  static async create(userId, gameData) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get player_profile id and name
      const profileResult = await client.query(
        'SELECT id, first_name, last_name, user_id FROM player_profiles WHERE user_id = $1',
        [userId]
      );

      if (profileResult.rows.length === 0) {
        throw new Error('Player profile not found');
      }

      const playerId = profileResult.rows[0].id;
      const playerName = `${profileResult.rows[0].first_name} ${profileResult.rows[0].last_name}`;
      const playerUserId = profileResult.rows[0].user_id;

      // Insert the game record
      // season_year: 0 = career stats, -1 = last season stats, positive = actual year
      const gameResult = await client.query(
        `INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, game_date, season_year, opponent, result`,
        [
          playerId,
          gameData.game_date,
          gameData.season_year !== undefined && gameData.season_year !== null ? gameData.season_year : new Date(gameData.game_date).getFullYear(),
          gameData.opponent || null,
          gameData.result || null
        ]
      );

      const gameId = gameResult.rows[0].id;

      // Insert position stats for each position
      const positionStats = [];
      if (gameData.positions && Object.keys(gameData.positions).length > 0) {
        for (const [position, stats] of Object.entries(gameData.positions)) {
          const statsResult = await client.query(
            `INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, position, stats`,
            [gameId, position, JSON.stringify(stats), playerName, playerUserId]
          );
          positionStats.push(statsResult.rows[0]);
        }
      }

      await client.query('COMMIT');

      return {
        game_id: gameId,
        ...gameResult.rows[0],
        position_stats: positionStats
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Update a game and its stats
  static async update(userId, gameId, gameData) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Verify the game belongs to this user and get player info
      const verifyResult = await client.query(
        `SELECT pg.id, pp.first_name, pp.last_name, pp.user_id FROM player_games pg
         JOIN player_profiles pp ON pg.player_id = pp.id
         WHERE pg.id = $1 AND pp.user_id = $2`,
        [gameId, userId]
      );

      if (verifyResult.rows.length === 0) {
        throw new Error('Game not found or unauthorized');
      }

      const playerName = `${verifyResult.rows[0].first_name} ${verifyResult.rows[0].last_name}`;
      const playerUserId = verifyResult.rows[0].user_id;

      // Update the game record
      // season_year: 0 = career stats, -1 = last season stats, positive = actual year
      await client.query(
        `UPDATE player_games
         SET game_date = $1, season_year = $2, opponent = $3, result = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [
          gameData.game_date,
          gameData.season_year !== undefined && gameData.season_year !== null ? gameData.season_year : new Date(gameData.game_date).getFullYear(),
          gameData.opponent || null,
          gameData.result || null,
          gameId
        ]
      );

      // Delete existing position stats and re-insert
      await client.query('DELETE FROM player_game_stats WHERE game_id = $1', [gameId]);

      const positionStats = [];
      if (gameData.positions && Object.keys(gameData.positions).length > 0) {
        for (const [position, stats] of Object.entries(gameData.positions)) {
          const statsResult = await client.query(
            `INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, position, stats`,
            [gameId, position, JSON.stringify(stats), playerName, playerUserId]
          );
          positionStats.push(statsResult.rows[0]);
        }
      }

      await client.query('COMMIT');

      return this.getGameById(gameId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Delete a game and all its stats
  static async delete(userId, gameId) {
    // Verify the game belongs to this user
    const verifyResult = await pool.query(
      `SELECT pg.id FROM player_games pg
       JOIN player_profiles pp ON pg.player_id = pp.id
       WHERE pg.id = $1 AND pp.user_id = $2`,
      [gameId, userId]
    );

    if (verifyResult.rows.length === 0) {
      return null;
    }

    // Delete will cascade to player_game_stats
    await pool.query('DELETE FROM player_games WHERE id = $1', [gameId]);

    return { deleted: true };
  }

  // Get season totals for a player
  static async getSeasonTotals(playerId, seasonYear) {
    const result = await pool.query(
      `SELECT
        pgs.position,
        COUNT(DISTINCT pg.id) as games_played,
        pgs.stats
      FROM player_games pg
      JOIN player_game_stats pgs ON pg.id = pgs.game_id
      WHERE pg.player_id = $1 AND pg.season_year = $2
      GROUP BY pgs.position, pgs.stats`,
      [playerId, seasonYear]
    );

    return result.rows;
  }
}

module.exports = PlayerGameStats;
