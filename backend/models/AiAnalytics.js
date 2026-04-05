const pool = require('../config/database');
const logger = require('../utils/logger');

class AiAnalytics {
  /**
   * Log an AI search request and its results for analytics.
   * Fire-and-forget — errors are logged but don't block the response.
   */
  static async log({
    aiType,
    coachDivision,
    coachState,
    rawQuery,
    filtersJson,
    activeFilters,
    resultCount,
    hasMore,
    avgRelevanceScore,
    resultPlayers,
    modelVersion,
    inputTokens,
    outputTokens,
    latencyMs
  }) {
    try {
      await pool.query(
        `INSERT INTO ai_analytics (
          ai_type, coach_division, coach_state, raw_query,
          filters_json, active_filters, result_count, has_more,
          avg_relevance_score, result_players, model_version,
          input_tokens, output_tokens, latency_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          aiType,
          coachDivision || null,
          coachState || null,
          rawQuery,
          filtersJson ? JSON.stringify(filtersJson) : null,
          activeFilters || [],
          resultCount || 0,
          hasMore || false,
          avgRelevanceScore || null,
          resultPlayers ? JSON.stringify(resultPlayers) : null,
          modelVersion || null,
          inputTokens || null,
          outputTokens || null,
          latencyMs || null
        ]
      );
    } catch (error) {
      logger.error('Failed to log AI analytics:', error.message);
    }
  }
}

module.exports = AiAnalytics;
