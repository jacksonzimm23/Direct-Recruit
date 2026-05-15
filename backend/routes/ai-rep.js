const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const pool = require('../config/database');
const User = require('../models/User');
const logger = require('../utils/logger');

// All routes require authenticated player
router.use(authMiddleware, requireRole('player'));

// Map raw active_filters names to display labels
const FILTER_LABEL_MAP = {
  position: 'Position',
  state: 'State',
  min_height: 'Height',
  max_height: 'Height',
  min_weight: 'Weight',
  max_weight: 'Weight',
  min_gpa: 'GPA',
  min_sat_score: 'Test Scores',
  min_act_score: 'Test Scores',
  graduation_year: 'Grad Year',
  college_division: 'College Division',
  eligibility: 'Eligibility',
  has_highlights: 'Highlights/Film',
  offer_filters: 'Offers',
  stat_filters: 'Stats',
  other_sports: 'Other Sports',
  plays_other_sports: 'Other Sports',
  track_100m_max: 'Track Times',
  track_200m_max: 'Track Times',
  pff_grade_min: 'PFF Grade',
  pff_grade_max: 'PFF Grade'
};

// Filters to exclude from display
const EXCLUDED_FILTERS = new Set(['searchTerm', 'signal_types', 'days']);

// All 6 divisions in display order
const ALL_DIVISIONS = ['D1 FBS', 'D1 FCS', 'D2', 'D3', 'NAIA', 'NJCAA'];

// Normalize legacy division values (e.g., "FBS" → "D1 FBS")
function normalizeDivision(div) {
  if (!div) return null;
  if (div === 'FBS') return 'D1 FBS';
  if (div === 'FCS') return 'D1 FCS';
  return div;
}

// Convert active_filters array to deduplicated display labels
function filtersToLabels(activeFilters) {
  if (!activeFilters || !activeFilters.length) return [];
  const seen = new Set();
  const labels = [];
  for (const f of activeFilters) {
    if (EXCLUDED_FILTERS.has(f)) continue;
    const label = FILTER_LABEL_MAP[f];
    if (label && !seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }
  return labels;
}

// Build date filter clause and param
function buildDateFilter(period, paramIndex) {
  if (period === '7d') return { clause: `AND created_at >= NOW() - INTERVAL '7 days'`, params: [] };
  if (period === '30d') return { clause: `AND created_at >= NOW() - INTERVAL '30 days'`, params: [] };
  return { clause: '', params: [] }; // 'all'
}

// ============ GET /api/ai-rep/matches ============
router.get('/matches', async (req, res) => {
  try {
    // Require active subscription for AI Rep
    const subInfo = await User.getSubscriptionInfo(req.userId);
    if (!subInfo || (subInfo.subscription_status !== 'active' && subInfo.subscription_status !== 'past_due')) {
      return res.status(403).json({ error: 'Active subscription required' });
    }

    const userId = req.userId;
    const period = ['7d', '30d', 'all'].includes(req.query.period) ? req.query.period : '7d';
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 5));

    const playerContainment = JSON.stringify([{ player_id: userId }]);
    const dateFilter = buildDateFilter(period);

    // Query 1: Paginated matches with total count
    const matchesResult = await pool.query(
      `WITH filtered AS (
        SELECT id, coach_division, active_filters, created_at
        FROM ai_analytics
        WHERE result_players @> $1::jsonb
          AND ai_type = 'recruit_assistant'
          ${dateFilter.clause}
        ORDER BY created_at DESC
      )
      SELECT *, COUNT(*) OVER() AS total_count
      FROM filtered
      LIMIT $2 OFFSET $3`,
      [playerContainment, limit, offset]
    );

    const totalCount = matchesResult.rows.length > 0
      ? parseInt(matchesResult.rows[0].total_count)
      : 0;

    const matches = matchesResult.rows.map(row => ({
      id: row.id,
      coach_division: normalizeDivision(row.coach_division) || 'Unknown',
      matched_on: filtersToLabels(row.active_filters),
      created_at: row.created_at
    }));

    // Query 2: Division distribution (same period filter)
    const divResult = await pool.query(
      `SELECT coach_division, COUNT(*)::int AS count
       FROM ai_analytics
       WHERE result_players @> $1::jsonb
         AND ai_type = 'recruit_assistant'
         ${dateFilter.clause}
       GROUP BY coach_division`,
      [playerContainment]
    );

    const divisionDistribution = {};
    for (const d of ALL_DIVISIONS) divisionDistribution[d] = 0;
    for (const row of divResult.rows) {
      const normalized = normalizeDivision(row.coach_division);
      if (normalized && divisionDistribution.hasOwnProperty(normalized)) {
        divisionDistribution[normalized] += row.count;
      }
    }

    // Query 3: Top attributes (unnest active_filters, count, exclude irrelevant)
    const attrResult = await pool.query(
      `SELECT filter_name, COUNT(*)::int AS count
       FROM ai_analytics, unnest(active_filters) AS filter_name
       WHERE result_players @> $1::jsonb
         AND ai_type = 'recruit_assistant'
         ${dateFilter.clause}
         AND filter_name NOT IN ('searchTerm', 'signal_types', 'days')
       GROUP BY filter_name
       ORDER BY count DESC`,
      [playerContainment]
    );

    // Deduplicate min_height/max_height → Height, min_weight/max_weight → Weight
    const labelCounts = {};
    for (const row of attrResult.rows) {
      const label = FILTER_LABEL_MAP[row.filter_name];
      if (!label) continue;
      labelCounts[label] = (labelCounts[label] || 0) + row.count;
    }

    const topAttributes = Object.entries(labelCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({
        label,
        count,
        percent: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0
      }));

    res.json({ matches, totalCount, divisionDistribution, topAttributes });
  } catch (error) {
    logger.error('AI Rep matches error:', error);
    res.status(500).json({ error: 'Failed to load matches' });
  }
});

// ============ GET /api/ai-rep/profile-completion ============
router.get('/profile-completion', async (req, res) => {
  try {
    const subInfo = await User.getSubscriptionInfo(req.userId);
    if (!subInfo || (subInfo.subscription_status !== 'active' && subInfo.subscription_status !== 'past_due')) {
      return res.status(403).json({ error: 'Active subscription required' });
    }

    const userId = req.userId;

    // Fetch player profile
    const profileResult = await pool.query(
      'SELECT * FROM player_profiles WHERE user_id = $1',
      [userId]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const profile = profileResult.rows[0];
    const isTransfer = profile.transfer === 'y';

    // Check highlights count
    const highlightResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM player_highlights WHERE user_id = $1',
      [userId]
    );
    const hasHighlights = highlightResult.rows[0].count > 0 || !!profile.hudl_profile;

    // Check stats count (player_games uses player_profiles.id, not user_id)
    const statsResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM player_games WHERE player_id = $1',
      [profile.id]
    );
    const hasStats = statsResult.rows[0].count > 0;

    // Build field checklist ordered by priority (most impactful first)
    const fields = [
      { label: 'Highlights/Film', complete: hasHighlights },
      { label: 'Stats', complete: hasStats },
      { label: 'GPA', complete: !!profile.gpa },
      { label: 'Academic Test Scores', complete: !!profile.sat_score || !!profile.act_score },
      { label: 'Offers', complete: !!profile.offers && profile.offers.trim() !== '' },
      { label: 'Position', complete: !!profile.position },
      { label: 'Height', complete: !!profile.height },
      { label: 'Weight', complete: !!profile.weight },
      { label: 'State', complete: !!profile.state },
      { label: 'Graduation Year', complete: !!profile.graduation_year },
      { label: 'Bio', complete: !!profile.bio && profile.bio.trim() !== '' },
      { label: 'Profile Photo', complete: !!profile.profile_image_url }
    ];

    // Transfer players have 2 additional fields
    if (isTransfer) {
      fields.push({ label: 'College Division', complete: !!profile.college_division });
      fields.push({ label: 'Eligibility', complete: profile.eligibility != null });
    }

    const completedFields = fields.filter(f => f.complete).map(f => f.label);
    const incompleteFields = fields.filter(f => !f.complete).map(f => f.label);
    const completionPercent = Math.round((completedFields.length / fields.length) * 100);

    res.json({
      completionPercent,
      completedFields,
      incompleteFields,
      playerType: isTransfer ? 'transfer' : 'hs'
    });
  } catch (error) {
    logger.error('AI Rep profile completion error:', error);
    res.status(500).json({ error: 'Failed to load profile completion' });
  }
});

module.exports = router;
