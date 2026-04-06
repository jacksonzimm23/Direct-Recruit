const pool = require('../config/database');
const logger = require('../utils/logger');

class AiEngagement {
  /**
   * Check if a player was surfaced in a recent AI search for this coach.
   * If yes, log an engagement event linking the action to the search session.
   * Fire-and-forget — errors are logged but don't block the caller.
   *
   * @param {string} coachUserId - The coach performing the action
   * @param {string} playerUserId - The player being acted upon
   * @param {string} eventType - 'save', 'profile_view', 'follow', or 'message'
   */
  static async trackIfAiDriven(coachUserId, playerUserId, eventType) {
    try {
      // Find the most recent AI search (within 30 min) that included this player
      const result = await pool.query(
        `SELECT id, ai_type, coach_division, result_players
         FROM ai_analytics
         WHERE created_at > NOW() - INTERVAL '30 minutes'
           AND result_players @> $1::jsonb
         ORDER BY created_at DESC
         LIMIT 1`,
        [JSON.stringify([{ player_id: playerUserId }])]
      );

      if (result.rows.length === 0) return; // Not AI-driven

      const analytics = result.rows[0];

      // Find player details from the result_players array
      let playerPosition = null;
      let playerState = null;
      if (analytics.result_players) {
        const playerEntry = analytics.result_players.find(p => p.player_id === playerUserId);
        if (playerEntry) {
          playerPosition = playerEntry.position || null;
          playerState = playerEntry.state || playerEntry.college_division || null;
        }
      }

      await pool.query(
        `INSERT INTO ai_engagement_events
          (analytics_id, ai_type, event_type, coach_division, player_user_id, player_position, player_state)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          analytics.id,
          analytics.ai_type,
          eventType,
          analytics.coach_division,
          playerUserId,
          playerPosition,
          playerState
        ]
      );
    } catch (error) {
      logger.error('AI engagement tracking error:', error.message);
    }
  }

  /**
   * Log an engagement event directly when analytics_id is already known.
   */
  static async logEvent(analyticsId, aiType, eventType, coachDivision, playerUserId, playerPosition, playerState) {
    try {
      await pool.query(
        `INSERT INTO ai_engagement_events
          (analytics_id, ai_type, event_type, coach_division, player_user_id, player_position, player_state)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [analyticsId, aiType, eventType, coachDivision, playerUserId, playerPosition, playerState]
      );
    } catch (error) {
      logger.error('AI engagement log error:', error.message);
    }
  }
}

module.exports = AiEngagement;
