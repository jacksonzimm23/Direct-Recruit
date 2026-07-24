const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const pool = require('../config/database');
const User = require('../models/User'); // used by the AI Rep subscription gate (getSubscriptionInfo)
const PlayerProfile = require('../models/PlayerProfile');
const CoachProfile = require('../models/CoachProfile');
const { computeFit, tierOf } = require('../utils/fit-score');
const { getSignedS3Url } = require('../utils/s3');
const logger = require('../utils/logger');

// All routes require authenticated player
router.use(authMiddleware, requireRole('player'));

// Normalize legacy division values (e.g., "FBS" → "D1 FBS")
function normalizeDivision(div) {
  if (!div) return null;
  if (div === 'FBS') return 'D1 FBS';
  if (div === 'FCS') return 'D1 FCS';
  return div;
}

// ===== Search Appearances: raw active_filters → player-facing chip labels =====
// Min/max counterparts collapse onto ONE label (a range query on height is still
// just "Height" to the player). Keep in sync with extractActiveFilters() in
// routes/ai.js — any new filter key logged there needs a label here or it is
// silently dropped from the chips.
const FILTER_LABEL_MAP = {
  position: 'Position',
  state: 'State',
  min_height: 'Height',
  max_height: 'Height',
  min_weight: 'Weight',
  max_weight: 'Weight',
  min_gpa: 'GPA',
  max_gpa: 'GPA',
  min_sat_score: 'Test Scores',
  max_sat_score: 'Test Scores',
  min_act_score: 'Test Scores',
  max_act_score: 'Test Scores',
  graduation_year: 'Grad Year',
  max_graduation_year: 'Grad Year',
  college_division: 'College Division',
  eligibility: 'Eligibility',
  max_eligibility: 'Eligibility',
  has_highlights: 'Highlights/Film',
  offer_filters: 'Offers',
  stat_filters: 'Stats',
  other_sports: 'Other Sports',
  plays_other_sports: 'Other Sports',
  track_100m_max: 'Track Times',
  track_200m_max: 'Track Times',
  pff_grade_min: 'PFF Grade',
  pff_grade_max: 'PFF Grade',
  // Fit / recruiting-profile filters (Plan 7E) — these are why a coach's
  // off-field criteria matched, so they're worth showing the player.
  intended_major: 'Intended Major',
  levels_open: 'Level Openness',
  preferred_regions: 'Preferred Region',
  preferred_campus_setting: 'Campus Setting',
  needs_financial_aid: 'Financial Aid',
  needs_scholarship: 'Scholarship Need'
};

// Never surfaced as a "matched on" chip: free-text search and PI-only plumbing.
const EXCLUDED_FILTERS = new Set(['searchTerm', 'signal_types', 'days']);

// Convert an active_filters array into deduplicated display labels.
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

// ============ GET /api/ai-rep/search-appearances ============
// "Search Appearances": every time a college coach's AI Recruiting Assistant
// search returned THIS player, shown as the SCHOOL that searched (name + logo
// + division) and the date.
//
// Owner decision (July 2026): players see the searching PROGRAM by name. The
// school comes from joining ai_analytics.coach_user_id -> coach_profiles.
// Individual coach identity is still never exposed — only the institution.
// Rows logged before migration 004 have coach_user_id = NULL and cannot resolve
// a school; those are EXCLUDED so a player never sees a nameless placeholder row.
//
// Source is the ai_analytics rows written on each RA search (see lesson #22).
router.get('/search-appearances', async (req, res) => {
  try {
    // Players are paid again (7-day trial). 'trialing' counts as active access.
    const subInfo = await User.getSubscriptionInfo(req.userId);
    if (!subInfo || !['active', 'past_due', 'comp', 'trialing'].includes(subInfo.subscription_status)) {
      return res.status(403).json({ error: 'Active subscription required' });
    }

    const period = ['7d', '30d', 'all'].includes(req.query.period) ? req.query.period : '30d';
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 5));

    // JSONB containment: the player's id inside the logged result_players array.
    const playerContainment = JSON.stringify([{ player_id: req.userId }]);
    // Qualified with the a. alias — ai_analytics and coach_profiles both have
    // a created_at column, so an unqualified reference is ambiguous.
    const dateClause = period === '7d'
      ? `AND a.created_at >= NOW() - INTERVAL '7 days'`
      : period === '30d'
        ? `AND a.created_at >= NOW() - INTERVAL '30 days'`
        : '';

    // Join to coach_profiles for the searching school. team_name IS NOT NULL
    // drops both pre-migration-004 rows (NULL coach_user_id) and any coach whose
    // profile was since deleted — neither can name a school.
    const result = await pool.query(
      `WITH filtered AS (
         SELECT a.id,
                cp.team_name,
                COALESCE(cp.college_division, a.coach_division) AS division,
                a.active_filters,
                a.created_at
         FROM ai_analytics a
         JOIN coach_profiles cp ON cp.user_id = a.coach_user_id
         WHERE a.result_players @> $1::jsonb
           AND a.ai_type = 'recruit_assistant'
           AND cp.team_name IS NOT NULL
           AND cp.team_name <> ''
           ${dateClause}
         ORDER BY a.created_at DESC
       )
       SELECT *, COUNT(*) OVER() AS total_count
       FROM filtered
       LIMIT $2 OFFSET $3`,
      [playerContainment, limit, offset]
    );

    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

    const appearances = result.rows.map(row => ({
      id: row.id,
      team_name: row.team_name,
      coach_division: normalizeDivision(row.division) || 'College',
      matched_on: filtersToLabels(row.active_filters),
      created_at: row.created_at
    }));

    res.json({
      appearances,
      totalCount,
      hasMore: offset + appearances.length < totalCount
    });
  } catch (error) {
    logger.error('AI Rep search-appearances error:', error);
    res.status(500).json({ error: 'Failed to load search appearances' });
  }
});

// Per-dimension detail copy, reworded school→player (privacy-safe: no thresholds/PII).
// SCORE-DEPENDENT so the words match the match-strength icon the modal draws from
// the same score (green >=0.67, yellow >=0.34, red <0.34 — see fit-info-modal.js
// _matchIcon). Mirrors the three coach-side tiers in fit-score.js, reworded for the
// player. Keyed by the fit-score DIMENSIONS keys; each key has { strong, medium, weak }.
// Thresholds below are aligned to the modal's icon bands so text never contradicts
// the icon (e.g. a red X no longer reads "Their aid can meet your financial needs").
const SCHOOL_DIM_DETAIL = {
  academic: {
    strong: 'Your academics fit this program’s profile',
    medium: 'Your academics are near their admitted range',
    weak:   'Your academics are below their typical admitted range'
  },
  level: {
    strong: 'Recruits at the level you’re open to',
    medium: 'Recruits at the level you’re open to',
    weak:   'Not currently recruiting at your level'
  },
  major: {
    strong: 'They’re strong in your intended major',
    medium: 'They support your intended major',
    weak:   'Your intended major is outside their highlighted programs'
  },
  geographic: {
    strong: 'Located in a region you’re open to',
    medium: 'Outside your top regions, but they recruit nationally',
    weak:   'Located outside the regions you prefer'
  },
  financial: {
    strong: 'Their aid can meet your financial needs',
    medium: 'Some overlap on your financial needs',
    weak:   'Their aid may not meet your financial needs'
  },
  environment: {
    strong: 'Campus setting matches your preference',
    medium: 'Campus setting is close to your preference',
    weak:   'Different campus setting than you prefer'
  },
  development: {
    strong: 'Their development approach fits how you want to be used',
    medium: 'Their development approach is a partial fit',
    weak:   'Their development approach is a partial fit'
  }
};

// Pick the tiered detail string for a dimension by its averaged score (0–1).
// Bands MUST match fit-info-modal.js _matchIcon() so the copy agrees with the icon.
function schoolDimDetail(key, score) {
  const tiers = SCHOOL_DIM_DETAIL[key];
  if (!tiers) return null;
  const band = score >= 0.67 ? 'strong' : score >= 0.34 ? 'medium' : 'weak';
  return tiers[band];
}

// ============ GET /api/ai-rep/best-fit-schools ============
// Player-facing mirror of the coach AI Match: rank the SCHOOLS that best fit this
// player. Runs computeFit(player, coach) over every college coach, drops coaches
// below the display floor, groups passing coaches by team, averages their scores
// (and per-dimension scores) per school, keeps schools >= 70, ranks, paginates.
// Each school carries a privacy-filtered Staff list (coaches whose profile is not
// private). No coach names appear in the ranked list itself — only inside a school.
const SCHOOL_MIN_SCORE = 70;

router.get('/best-fit-schools', async (req, res) => {
  try {
    // Players are paid again (7-day trial). 'trialing' counts as active access.
    const subInfo = await User.getSubscriptionInfo(req.userId);
    if (!subInfo || !['active', 'past_due', 'comp', 'trialing'].includes(subInfo.subscription_status)) {
      return res.status(403).json({ error: 'Active subscription required' });
    }

    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));

    const player = await PlayerProfile.findByUserId(req.userId);
    if (!player) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const coaches = await CoachProfile.getAllCollege();

    // Group passing coaches by team (skip coaches below the fit floor or with no team).
    const byTeam = new Map();
    for (const coach of coaches) {
      if (!coach.team_name) continue;
      const fit = computeFit(player, coach);
      if (fit.score == null) continue; // below display floor
      const key = coach.team_name.trim();
      if (!byTeam.has(key)) byTeam.set(key, []);
      byTeam.get(key).push({ coach, fit });
    }

    // Build one school object per team.
    const schools = [];
    for (const [teamName, entries] of byTeam) {
      const avgScore = Math.round(entries.reduce((a, e) => a + e.fit.score, 0) / entries.length);
      if (avgScore < SCHOOL_MIN_SCORE) continue;

      // Most common division among passing coaches (fallback: first non-null).
      const divCounts = {};
      for (const e of entries) {
        const d = normalizeDivision(e.coach.college_division);
        if (d) divCounts[d] = (divCounts[d] || 0) + 1;
      }
      const college_division = Object.entries(divCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

      // Merge dimensions: average score across coaches where each dim is present.
      const dimAgg = new Map(); // key -> { label, sum, n }
      for (const e of entries) {
        for (const d of e.fit.dimensions) {
          if (!d.present) continue;
          if (!dimAgg.has(d.key)) dimAgg.set(d.key, { label: d.label, sum: 0, n: 0 });
          const agg = dimAgg.get(d.key);
          agg.sum += d.score;
          agg.n += 1;
        }
      }
      const dimensions = [...dimAgg.entries()].map(([key, agg]) => {
        const score = agg.sum / agg.n;
        return {
          key,
          label: agg.label,
          present: true,
          score,
          detail: schoolDimDetail(key, score) || agg.label
        };
      });

      // Privacy-filtered staff (exclude private coaches; sign avatars; never email).
      const visible = entries.filter(e => e.coach.profile_visibility !== 'private');
      const staff = await Promise.all(visible.map(async (e) => ({
        first_name: e.coach.first_name,
        last_name: e.coach.last_name,
        username: e.coach.username,
        position_title: e.coach.position_title || null,
        profile_image_url: e.coach.profile_image_url
          ? await getSignedS3Url(e.coach.profile_image_url)
          : null
      })));

      schools.push({
        team_name: teamName,
        college_division,
        score: avgScore,
        tier: tierOf(avgScore),
        coachCount: entries.length,
        dimensions,
        staff
      });
    }

    schools.sort((a, b) => b.score - a.score);
    const page = schools.slice(offset, offset + limit);
    const hasMore = offset + limit < schools.length;

    res.json({ schools: page, hasMore });
  } catch (error) {
    logger.error('AI Rep best-fit-schools error:', error);
    res.status(500).json({ error: 'Failed to load best-fit schools' });
  }
});

// ============ GET /api/ai-rep/profile-completion ============
router.get('/profile-completion', async (req, res) => {
  try {
    // Players are paid again (7-day trial). 'trialing' counts as active access.
    const subInfo = await User.getSubscriptionInfo(req.userId);
    if (!subInfo || !['active', 'past_due', 'comp', 'trialing'].includes(subInfo.subscription_status)) {
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

    // Basic / discovery fields — individual rows (keep as-is, position-based priority).
    const fields = [
      { label: 'Highlights/Film', complete: hasHighlights },
      { label: 'Stats', complete: hasStats },
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

    // Recruiting-profile (fit) SECTIONS — one row per recruiting-profile subtab the
    // player edits, instead of per-field, so the list stays short. A section is
    // complete only when ALL of its required fields are filled (optional/edge fields
    // like class rank, AP/IB, weighted GPA, looking-for text, Pell, ZIP, athletics
    // do NOT block completion). These power AI Match / Best-Fit Schools and are always
    // surfaced at HIGH priority by the frontend. Plan 7D.
    const arrHas = (v) => Array.isArray(v) && v.length > 0;
    let fitPrefs = profile.fit_preferences;
    if (typeof fitPrefs === 'string') { try { fitPrefs = JSON.parse(fitPrefs); } catch (e) { fitPrefs = {}; } }
    fitPrefs = fitPrefs || {};
    const sliderSet = (k) => fitPrefs[k] != null && fitPrefs[k] !== '';

    const recruitingFields = [
      // Academics: GPA + at least one test score.
      { label: 'Academics', complete: !!profile.gpa && (!!profile.sat_score || !!profile.act_score) },
      // Major & Goals: intended major.
      { label: 'Major & Goals', complete: arrHas(profile.intended_major) },
      // Financial Fit: both aid questions answered.
      { label: 'Financial Fit', complete: !!profile.needs_financial_aid && !!profile.needs_scholarship },
      // Level & Location: levels + regions + campus setting all set.
      { label: 'Level & Location', complete: arrHas(profile.levels_open) && arrHas(profile.preferred_regions) && !!profile.preferred_campus_setting },
      // Priorities: all four importance sliders rated.
      { label: 'Priorities', complete: sliderSet('importance_playing_time') && sliderSet('importance_close_to_home') && sliderSet('importance_academics_vs_football') && sliderSet('importance_competition_level') }
    ];
    const recruitingSectionLabels = recruitingFields.map(f => f.label);
    fields.push(...recruitingFields);

    const completedFields = fields.filter(f => f.complete).map(f => f.label);
    const incompleteFields = fields.filter(f => !f.complete).map(f => f.label);
    const completionPercent = Math.round((completedFields.length / fields.length) * 100);

    res.json({
      completionPercent,
      completedFields,
      incompleteFields,
      // Which incomplete labels are recruiting-profile SECTIONS (frontend marks HIGH).
      recruitingSections: recruitingSectionLabels,
      playerType: isTransfer ? 'transfer' : 'hs'
    });
  } catch (error) {
    logger.error('AI Rep profile completion error:', error);
    res.status(500).json({ error: 'Failed to load profile completion' });
  }
});

module.exports = router;
