const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const logger = require('../utils/logger');

// Admin key authentication middleware
function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_ANALYTICS_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  next();
}

router.use(adminAuth);

// GET /api/admin/analytics/overview
router.get('/overview', async (req, res) => {
  try {
    const [searches, engagements, tokens, latency, today] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM ai_analytics'),
      pool.query('SELECT COUNT(*) as count FROM ai_engagement_events'),
      pool.query('SELECT COALESCE(SUM(input_tokens), 0) as input, COALESCE(SUM(output_tokens), 0) as output FROM ai_analytics'),
      pool.query('SELECT ROUND(AVG(latency_ms)) as avg_latency FROM ai_analytics WHERE latency_ms IS NOT NULL'),
      pool.query("SELECT COUNT(*) as count FROM ai_analytics WHERE created_at > CURRENT_DATE")
    ]);

    const totalSearches = parseInt(searches.rows[0].count);
    const totalEngagements = parseInt(engagements.rows[0].count);

    res.json({
      totalSearches,
      totalEngagements,
      conversionRate: totalSearches > 0 ? Math.round((totalEngagements / totalSearches) * 1000) / 10 : 0,
      totalTokens: parseInt(tokens.rows[0].input) + parseInt(tokens.rows[0].output),
      totalInputTokens: parseInt(tokens.rows[0].input),
      totalOutputTokens: parseInt(tokens.rows[0].output),
      avgLatency: parseInt(latency.rows[0].avg_latency) || 0,
      searchesToday: parseInt(today.rows[0].count)
    });
  } catch (error) {
    logger.error('Admin analytics overview error:', error);
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

// GET /api/admin/analytics/searches?days=30
router.get('/searches', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const [daily, byDivision, byPosition, byFilter, emptyRate] = await Promise.all([
      // Daily searches by AI type
      pool.query(`
        SELECT DATE(created_at) as date,
          COUNT(*) FILTER (WHERE ai_type = 'recruit_assistant') as ra_count,
          COUNT(*) FILTER (WHERE ai_type = 'portal_intelligence') as pi_count
        FROM ai_analytics
        WHERE created_at > NOW() - INTERVAL '1 day' * $1
        GROUP BY DATE(created_at)
        ORDER BY date
      `, [days]),

      // Searches by coach division
      pool.query(`
        SELECT COALESCE(coach_division, 'Unknown') as division, COUNT(*) as count
        FROM ai_analytics
        WHERE created_at > NOW() - INTERVAL '1 day' * $1
        GROUP BY coach_division
        ORDER BY count DESC
      `, [days]),

      // Top searched positions (unnest active_filters to find position, then parse filters_json)
      pool.query(`
        SELECT elem->>'position' as positions, COUNT(*) as count
        FROM ai_analytics,
          LATERAL jsonb_array_elements(
            CASE WHEN filters_json ? 'position' AND filters_json->'position' != 'null'::jsonb
              THEN filters_json->'position'
              ELSE '[]'::jsonb END
          ) AS elem
        WHERE created_at > NOW() - INTERVAL '1 day' * $1
        GROUP BY elem
        ORDER BY count DESC
        LIMIT 10
      `, [days]),

      // Most used filter types
      pool.query(`
        SELECT filter_name, COUNT(*) as count
        FROM ai_analytics, unnest(active_filters) AS filter_name
        WHERE created_at > NOW() - INTERVAL '1 day' * $1
        GROUP BY filter_name
        ORDER BY count DESC
      `, [days]),

      // Empty search rate
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE result_count = 0) as empty,
          COUNT(*) as total
        FROM ai_analytics
        WHERE created_at > NOW() - INTERVAL '1 day' * $1
      `, [days])
    ]);

    const total = parseInt(emptyRate.rows[0].total) || 1;
    const empty = parseInt(emptyRate.rows[0].empty);

    res.json({
      daily: daily.rows,
      byDivision: byDivision.rows,
      byPosition: byPosition.rows,
      byFilter: byFilter.rows,
      emptySearchRate: Math.round((empty / total) * 1000) / 10
    });
  } catch (error) {
    logger.error('Admin analytics searches error:', error);
    res.status(500).json({ error: 'Failed to fetch search data' });
  }
});

// GET /api/admin/analytics/funnel?days=30
router.get('/funnel', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const [funnelTotal, byDivision, byAiType] = await Promise.all([
      // Overall funnel
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM ai_analytics WHERE created_at > NOW() - INTERVAL '1 day' * $1) as searches,
          COUNT(*) FILTER (WHERE event_type = 'save') as saves,
          COUNT(*) FILTER (WHERE event_type = 'profile_view') as views,
          COUNT(*) FILTER (WHERE event_type = 'follow') as follows,
          COUNT(*) FILTER (WHERE event_type = 'message') as messages
        FROM ai_engagement_events
        WHERE created_at > NOW() - INTERVAL '1 day' * $1
      `, [days]),

      // Funnel by coach division
      pool.query(`
        SELECT
          COALESCE(coach_division, 'Unknown') as division,
          COUNT(*) FILTER (WHERE event_type = 'save') as saves,
          COUNT(*) FILTER (WHERE event_type = 'profile_view') as views,
          COUNT(*) FILTER (WHERE event_type = 'follow') as follows,
          COUNT(*) FILTER (WHERE event_type = 'message') as messages
        FROM ai_engagement_events
        WHERE created_at > NOW() - INTERVAL '1 day' * $1
        GROUP BY coach_division
        ORDER BY COUNT(*) DESC
      `, [days]),

      // Funnel by AI type
      pool.query(`
        SELECT
          ai_type,
          COUNT(*) FILTER (WHERE event_type = 'save') as saves,
          COUNT(*) FILTER (WHERE event_type = 'profile_view') as views,
          COUNT(*) FILTER (WHERE event_type = 'follow') as follows,
          COUNT(*) FILTER (WHERE event_type = 'message') as messages
        FROM ai_engagement_events
        WHERE created_at > NOW() - INTERVAL '1 day' * $1
        GROUP BY ai_type
      `, [days])
    ]);

    res.json({
      funnel: funnelTotal.rows[0],
      byDivision: byDivision.rows,
      byAiType: byAiType.rows
    });
  } catch (error) {
    logger.error('Admin analytics funnel error:', error);
    res.status(500).json({ error: 'Failed to fetch funnel data' });
  }
});

// GET /api/admin/analytics/performance?days=30
router.get('/performance', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const [daily, tokenBreakdown] = await Promise.all([
      // Daily performance metrics
      pool.query(`
        SELECT DATE(created_at) as date,
          ROUND(AVG(latency_ms)) as avg_latency,
          ROUND(AVG(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0))) as avg_tokens,
          COUNT(*) as search_count
        FROM ai_analytics
        WHERE created_at > NOW() - INTERVAL '1 day' * $1
        GROUP BY DATE(created_at)
        ORDER BY date
      `, [days]),

      // Token breakdown by AI type
      pool.query(`
        SELECT
          COALESCE(SUM(input_tokens) FILTER (WHERE ai_type = 'recruit_assistant'), 0) as ra_input,
          COALESCE(SUM(output_tokens) FILTER (WHERE ai_type = 'recruit_assistant'), 0) as ra_output,
          COALESCE(SUM(input_tokens) FILTER (WHERE ai_type = 'portal_intelligence'), 0) as pi_input,
          COALESCE(SUM(output_tokens) FILTER (WHERE ai_type = 'portal_intelligence'), 0) as pi_output
        FROM ai_analytics
        WHERE created_at > NOW() - INTERVAL '1 day' * $1
      `, [days])
    ]);

    res.json({
      daily: daily.rows,
      tokenBreakdown: tokenBreakdown.rows[0]
    });
  } catch (error) {
    logger.error('Admin analytics performance error:', error);
    res.status(500).json({ error: 'Failed to fetch performance data' });
  }
});

// DELETE /api/admin/analytics/clear-searches — clear all ai_analytics data
router.delete('/clear-searches', async (req, res) => {
  try {
    // Also clear engagement events that reference analytics (FK cascade would leave orphans with SET NULL)
    await pool.query('DELETE FROM ai_engagement_events');
    await pool.query('DELETE FROM ai_analytics');
    res.json({ success: true, message: 'All search analytics and engagement events cleared' });
  } catch (error) {
    logger.error('Clear searches error:', error);
    res.status(500).json({ error: 'Failed to clear search data' });
  }
});

// DELETE /api/admin/analytics/clear-engagements — clear only engagement events
router.delete('/clear-engagements', async (req, res) => {
  try {
    await pool.query('DELETE FROM ai_engagement_events');
    res.json({ success: true, message: 'All engagement events cleared' });
  } catch (error) {
    logger.error('Clear engagements error:', error);
    res.status(500).json({ error: 'Failed to clear engagement data' });
  }
});

module.exports = router;
