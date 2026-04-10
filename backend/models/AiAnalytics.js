const pool = require('../config/database');
const logger = require('../utils/logger');
const stripe = require('../utils/stripe');

class AiAnalytics {
  /**
   * Log an AI search request and its results for analytics.
   * Fire-and-forget — errors are logged but don't block the response.
   */
  static async log({
    aiType,
    coachUserId,
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
          ai_type, coach_user_id, coach_division, coach_state, raw_query,
          filters_json, active_filters, result_count, has_more,
          avg_relevance_score, result_players, model_version,
          input_tokens, output_tokens, latency_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          aiType,
          coachUserId || null,
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

  /**
   * Get token usage for a specific coach within the current billing period.
   * Uses Stripe subscription cycle dates if available, falls back to calendar month.
   * Both RA and PI usage count toward the same pool.
   */
  static async getUsageByCoach(coachUserId) {
    // Look up the coach's subscription info
    const userSub = await pool.query(
      'SELECT subscription_tier, stripe_subscription_id, subscription_status FROM users WHERE id = $1',
      [coachUserId]
    );
    const tier = userSub.rows[0]?.subscription_tier || 'starter';
    const subId = userSub.rows[0]?.stripe_subscription_id;
    const subStatus = userSub.rows[0]?.subscription_status;

    // Determine billing period from Stripe or fall back to calendar month
    let periodStart, periodEnd;
    if (subId && (subStatus === 'active' || subStatus === 'past_due')) {
      try {
        const sub = await stripe.getSubscription(subId);
        periodStart = new Date(sub.current_period_start * 1000);
        periodEnd = new Date(sub.current_period_end * 1000);
      } catch (err) {
        logger.warn(`Failed to fetch Stripe subscription for billing period: ${err.message}`);
        const now = new Date();
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      }
    } else {
      const now = new Date();
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    const result = await pool.query(
      `SELECT
         COALESCE(SUM(input_tokens), 0)::int AS input_tokens,
         COALESCE(SUM(output_tokens), 0)::int AS output_tokens,
         COUNT(*)::int AS total_requests
       FROM ai_analytics
       WHERE coach_user_id = $1
         AND created_at >= $2
         AND created_at <= $3`,
      [coachUserId, periodStart, periodEnd]
    );

    const TIER_CAPS = { starter: 4_000_000, pro: 10_000_000, elite: 20_000_000, player: 0 };
    const TIER_NAMES = { starter: 'Starter', pro: 'Pro', elite: 'Elite', player: 'Player' };

    const row = result.rows[0];
    const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      plan: TIER_NAMES[tier] || 'Starter',
      tokenCap: TIER_CAPS[tier] || 4_000_000,
      periodStart: formatDate(periodStart),
      periodEnd: formatDate(periodEnd),
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      totalRequests: row.total_requests
    };
  }
}

module.exports = AiAnalytics;
