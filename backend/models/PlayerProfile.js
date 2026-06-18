const pool = require('../config/database');
const { playerPopularityExpr } = require('../utils/popularity-score');
const { escapeLikePattern } = require('../middleware/validation');
const { blockedUserFilter } = require('../utils/blockFilter');
const { computeFit } = require('../utils/fit-score');
const { fullNameExpr, searchTermParams, searchScoreExpr } = require('../utils/search-score');

// Composite stat keys that sum multiple JSONB fields (e.g., "total_tds" = pass_tds + rush_tds + rec_tds)
const COMPOSITE_STAT_KEYS = {
  'total_tds': ['pass_tds', 'rush_tds', 'rec_tds'],
  'total_yds': ['pass_yds', 'rush_yds', 'rec_yds']
};

// Allowlist of stat keys accepted from Claude (matches the keys the seed-scripts
// emit + composite keys). Used by searchByAiFilters AND PortalSignal so that
// stat-range filtering works identically for AI RA and AI PI.
const VALID_STAT_KEYS = new Set([
  'rush_yds', 'rush_tds', 'pass_yds', 'pass_tds', 'ints', 'comp_%',
  'rec', 'rec_yds', 'rec_tds', 'tackles', 'tfls', 'sacks', 'pbu',
  'ff', 'int', 'att', 'm', 'blk', 'long', 'pats', 'avg', 'tb',
  'fc', 'i20', '50+',
  'total_tds', 'total_yds'
]);

// Allowlist for SQL comparison operators emitted by the AI. The AI prompt
// instructs Claude to return one of these five strings (>=, <=, >, <, =),
// but it's a generative model and occasionally hallucinates — past
// production logs caught a stat_filter whose operator contained a stray
// `;` which crashed the query with "syntax error at or near `;`". This
// allowlist normalises any unexpected value back to '>=' (the safe default).
const VALID_STAT_OPERATORS = new Set(['>=', '<=', '>', '<', '=']);

// ---- Fit-aware re-ranking (Plan 7E), shared by RA (PlayerProfile) and PI (PortalSignal) ----
// Given a relevance-ordered candidate WINDOW + the viewing coach, attach computeFit
// to each row and re-sort by a relevance-dominant blend so better fits surface, then
// return the requested page slice. Deterministic total order (blend, then a numeric
// primary key, then id) keeps offset pagination stable across "show more".
const FIT_BLEND = { relevance: 0.7, fit: 0.3, neutral: 0.5 }; // calibration knobs
function rerankByFit(rows, coach, offset, limit, primaryKey) {
  // primaryKey = the SQL numeric ordering column on each row (e.g. 'relevance_score').
  let maxPrimary = 0;
  for (const r of rows) {
    const v = Number(r[primaryKey]) || 0;
    if (v > maxPrimary) maxPrimary = v;
  }
  const scored = rows.map(r => {
    if (!r.fit) r.fit = computeFit(r, coach); // attach here; route helper won't recompute
    const relNorm = maxPrimary > 0 ? (Number(r[primaryKey]) || 0) / maxPrimary : 0;
    const fitForSort = (r.fit && r.fit.score != null ? r.fit.score : FIT_BLEND.neutral * 99) / 99;
    const blended = FIT_BLEND.relevance * relNorm + FIT_BLEND.fit * fitForSort;
    return { r, blended, primary: Number(r[primaryKey]) || 0 };
  });
  scored.sort((a, b) => {
    if (b.blended !== a.blended) return b.blended - a.blended;
    if (b.primary !== a.primary) return b.primary - a.primary;
    return String(a.r.id) < String(b.r.id) ? -1 : (String(a.r.id) > String(b.r.id) ? 1 : 0);
  });
  const page = scored.slice(offset, offset + limit).map(s => s.r);
  const hasMore = scored.length > offset + limit;
  return { players: page, hasMore };
}
const MAX_FIT_WINDOW = 200; // ceiling on over-fetch; deep pages fall back to relevance-only

// Build a dynamic SQL scoring expression based on which filters are active.
// Returns { expr: string, paramCount: number }.
// Scoring is query-adaptive: factors are weighted based on what the coach asked for.
function buildRelevanceScoreExpr(filters, heightCaseExpr, validStatKeys, values, paramCount) {
  const scoreParts = [];

  // --- Filter-driven scoring (only active when filter is present) ---

  // Height excess: reward players taller than the minimum
  if (filters.min_height) {
    scoreParts.push(`CASE WHEN (${heightCaseExpr}) > $${paramCount} THEN LEAST((${heightCaseExpr} - $${paramCount}) * 2.0, 16.0) ELSE 0 END`);
    values.push(filters.min_height);
    paramCount++;
  }

  // Weight scoring
  if (filters.min_weight && filters.max_weight) {
    // Two-sided range: reward players closer to midpoint
    const midWeight = (filters.min_weight + filters.max_weight) / 2;
    scoreParts.push(`CASE WHEN pp.weight IS NOT NULL THEN GREATEST(0, 10.0 - ABS(pp.weight - $${paramCount}) * 0.2) ELSE 0 END`);
    values.push(midWeight);
    paramCount++;
  } else if (filters.min_weight) {
    // One-sided: reward exceeding minimum
    scoreParts.push(`CASE WHEN pp.weight IS NOT NULL AND pp.weight > $${paramCount} THEN LEAST((pp.weight - $${paramCount}) / 10.0, 10.0) ELSE 0 END`);
    values.push(filters.min_weight);
    paramCount++;
  }

  // GPA excess: reward higher GPA above minimum
  if (filters.min_gpa) {
    scoreParts.push(`CASE WHEN pp.gpa IS NOT NULL AND pp.gpa > $${paramCount} THEN LEAST((pp.gpa - $${paramCount}) * 20.0, 10.0) ELSE 0 END`);
    values.push(filters.min_gpa);
    paramCount++;
  }

  // SAT score excess: reward higher SAT above minimum (divide by 50 so +500 over min = 10 pts max)
  if (filters.min_sat_score) {
    scoreParts.push(`CASE WHEN pp.sat_score IS NOT NULL AND pp.sat_score > $${paramCount} THEN LEAST((pp.sat_score - $${paramCount}) / 50.0, 10.0) ELSE 0 END`);
    values.push(filters.min_sat_score);
    paramCount++;
  }

  // ACT score excess: reward higher ACT above minimum (multiply by 2 so +5 over min = 10 pts max)
  if (filters.min_act_score) {
    scoreParts.push(`CASE WHEN pp.act_score IS NOT NULL AND pp.act_score > $${paramCount} THEN LEAST((pp.act_score - $${paramCount}) * 2.0, 10.0) ELSE 0 END`);
    values.push(filters.min_act_score);
    paramCount++;
  }

  // Track 100m: reward sub-threshold times. Faster (lower) = higher score.
  // (threshold - actual) * 5.0 capped at 10. 0.5s under threshold = +2.5,
  // 2s under = +10. Same +10 ceiling as height/GPA/SAT/ACT scoring.
  if (filters.track_100m_max) {
    scoreParts.push(`CASE WHEN pp.track_100m IS NOT NULL AND pp.track_100m < $${paramCount} THEN LEAST(($${paramCount} - pp.track_100m) * 5.0, 10.0) ELSE 0 END`);
    values.push(filters.track_100m_max);
    paramCount++;
  }

  // Track 200m: same shape, factor 2.5 (200m gaps are roughly 2x bigger).
  if (filters.track_200m_max) {
    scoreParts.push(`CASE WHEN pp.track_200m IS NOT NULL AND pp.track_200m < $${paramCount} THEN LEAST(($${paramCount} - pp.track_200m) * 2.5, 10.0) ELSE 0 END`);
    values.push(filters.track_200m_max);
    paramCount++;
  }

  // PFF grade excess: reward grades above the threshold. Factor 0.5 → player
  // 20+ points over threshold hits the +10 cap (e.g. threshold 70, player at
  // 90 → (90-70)*0.5 = +10). NULL-guarded so ungraded players score 0.
  if (filters.pff_grade_min) {
    scoreParts.push(`CASE WHEN pp.pff_grade IS NOT NULL AND pp.pff_grade >= $${paramCount} THEN LEAST((pp.pff_grade - $${paramCount}) * 0.5, 10.0) ELSE 0 END`);
    values.push(filters.pff_grade_min);
    paramCount++;
  }

  // Stat performance scoring: for each stat filter, reward exceeding the threshold
  if (filters.stat_filters && filters.stat_filters.length > 0) {
    filters.stat_filters.forEach((sf, index) => {
      if (!validStatKeys.has(sf.stat_key)) return;

      const scoreAlias = `score_sg${index}`;
      const scoreStatsAlias = `score_sf${index}`;

      const compositeKeys = COMPOSITE_STAT_KEYS[sf.stat_key];
      const scoreStatExpr = compositeKeys
        ? compositeKeys.map(k => `COALESCE(CAST(${scoreStatsAlias}.stats->>'${k}' AS NUMERIC), 0)`).join(' + ')
        : `COALESCE(CAST(${scoreStatsAlias}.stats->>'${sf.stat_key}' AS NUMERIC), 0)`;

      let statScoreSubquery = `COALESCE((
        SELECT LEAST(
          SUM(${scoreStatExpr}) / NULLIF($${paramCount}, 0) * 5.0,
          10.0
        )
        FROM player_games ${scoreAlias}
        JOIN player_game_stats ${scoreStatsAlias} ON ${scoreAlias}.id = ${scoreStatsAlias}.game_id
        JOIN player_profiles pp_score ON ${scoreAlias}.player_id = pp_score.id
        WHERE pp_score.user_id = pp.user_id`;

      values.push(sf.value);
      paramCount++;

      // Season year filter for scoring (mirror WHERE logic)
      if (sf.season_year === -1) {
        statScoreSubquery += ` AND ${scoreAlias}.season_year = (
          SELECT MAX(sg_inner2.season_year) FROM player_games sg_inner2
          JOIN player_profiles pp_inner2 ON sg_inner2.player_id = pp_inner2.id
          WHERE pp_inner2.user_id = pp.user_id AND sg_inner2.season_year > 0
        )`;
      } else if (sf.season_year && sf.season_year > 0) {
        statScoreSubquery += ` AND ${scoreAlias}.season_year = $${paramCount}`;
        values.push(sf.season_year);
        paramCount++;
      }

      // Position filter for scoring
      if (sf.positions && sf.positions.length > 0) {
        const posList = sf.positions.map(p => {
          const param = `$${paramCount}`;
          values.push(p);
          paramCount++;
          return param;
        });
        statScoreSubquery += ` AND ${scoreStatsAlias}.position IN (${posList.join(', ')})`;
      }

      statScoreSubquery += ` GROUP BY pp_score.user_id
      ), 0)`;

      scoreParts.push(statScoreSubquery);
    });
  }

  // --- Profile completeness (always active, lower weight) ---

  // Has profile photo
  scoreParts.push(`CASE WHEN pp.profile_image_url IS NOT NULL AND pp.profile_image_url != '' THEN 3.0 ELSE 0 END`);

  // Has bio
  scoreParts.push(`CASE WHEN pp.bio IS NOT NULL AND pp.bio != '' THEN 2.0 ELSE 0 END`);

  // Has highlight videos or Hudl profile
  scoreParts.push(`CASE WHEN EXISTS (SELECT 1 FROM player_highlights ph WHERE ph.user_id = pp.user_id LIMIT 1) OR (pp.hudl_profile IS NOT NULL AND pp.hudl_profile != '') THEN 3.0 ELSE 0 END`);

  // Offer count bonus (more offers = better, capped at 10 offers * 0.5 = 5 pts)
  scoreParts.push(`CASE WHEN pp.offers IS NOT NULL AND pp.offers != '' THEN
    LEAST(array_length(string_to_array(pp.offers, '|'), 1), 10) * 0.5
  ELSE 0 END`);

  // Offer division quality bonus (D1 FBS worth most, descending by tier, capped at 10 pts)
  // Count offers per division using lateral unnest for accuracy
  scoreParts.push(`COALESCE((
    SELECT LEAST(
      COALESCE(SUM(CASE
        WHEN offer_entry ILIKE '%D1 FBS%' THEN 2.0
        WHEN offer_entry ILIKE '%D1 FCS%' THEN 1.5
        WHEN offer_entry ILIKE '%, D2' OR offer_entry ILIKE '%, D2|%' THEN 1.0
        WHEN offer_entry ILIKE '%, D3' OR offer_entry ILIKE '%, D3|%' THEN 0.5
        WHEN offer_entry ILIKE '%NAIA%' THEN 0.5
        WHEN offer_entry ILIKE '%NJCAA%' THEN 0.5
        ELSE 0.0
      END), 0), 10.0)
    FROM unnest(string_to_array(COALESCE(pp.offers, ''), '|')) AS offer_entry
    WHERE offer_entry != ''
  ), 0)`);

  const expr = `(${scoreParts.join('\n    + ')})`;
  return { expr, paramCount };
}

class PlayerProfile {
  static async create(userId, profileData) {
    const {
      first_name, last_name, username, date_of_birth, team_name, graduation_year,
      city, state, position, height, weight, gpa, sat_score, act_score,
      highlight_video_url, bio, hudl_profile, twitter_handle, instagram_handle, player_status,
      college_division, conference, number, eligibility, transfer,
      lastseasonstat1, lastseasonstat2, lastseasonstat3, careerstat1, careerstat2, careerstat3,
      other_sports, track_100m, track_200m, pff_grade,
      // AI Fit-Matching fields (Plan 2)
      weighted_gpa, has_ap_ib, ap_ib_count, class_rank, intended_major, home_zip,
      needs_financial_aid, needs_scholarship, pell_or_first_gen, levels_open,
      preferred_regions, preferred_campus_setting, fit_preferences,
      // Recruiting contact fields (hsplayer/transferplayer; private, CSV export)
      phone, gender, address, zip, coach_name, coach_email, coach_phone, parent_guardians
    } = profileData;

    const result = await pool.query(
      `INSERT INTO player_profiles
      (user_id, first_name, last_name, username, date_of_birth, team_name, graduation_year,
       city, state, position, height, weight, gpa, sat_score, act_score,
       highlight_video_url, bio, hudl_profile, twitter_handle, instagram_handle, player_status,
       college_division, conference, number, eligibility, transfer,
       lastseasonstat1, lastseasonstat2, lastseasonstat3, careerstat1, careerstat2, careerstat3,
       other_sports, track_100m, track_200m, pff_grade,
       weighted_gpa, has_ap_ib, ap_ib_count, class_rank, intended_major, home_zip,
       needs_financial_aid, needs_scholarship, pell_or_first_gen, levels_open,
       preferred_regions, preferred_campus_setting, fit_preferences,
       phone, gender, address, zip, coach_name, coach_email, coach_phone, parent_guardians)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36,
       $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49,
       $50, $51, $52, $53, $54, $55, $56, $57)
      RETURNING *`,
      [userId, first_name, last_name, username, date_of_birth, team_name, graduation_year,
       city, state, position, height, weight, gpa, sat_score, act_score,
       highlight_video_url, bio, hudl_profile, twitter_handle, instagram_handle, player_status,
       college_division, conference, number, eligibility, transfer,
       lastseasonstat1, lastseasonstat2, lastseasonstat3, careerstat1, careerstat2, careerstat3,
       other_sports, track_100m, track_200m, pff_grade ?? null,
       weighted_gpa ?? null, has_ap_ib ?? null, ap_ib_count ?? null, class_rank ?? null,
       intended_major ?? null, home_zip ?? null, needs_financial_aid ?? null,
       needs_scholarship ?? null, pell_or_first_gen ?? null, levels_open ?? null,
       preferred_regions ?? null, preferred_campus_setting ?? null,
       // JSONB: node-postgres needs a JSON string (defaults to {} per the column default if null)
       fit_preferences != null ? JSON.stringify(fit_preferences) : '{}',
       phone ?? null, gender ?? null, address ?? null, zip ?? null,
       coach_name ?? null, coach_email ?? null, coach_phone ?? null,
       // JSONB array — node-postgres needs a JSON string (defaults to [] if null)
       parent_guardians != null ? JSON.stringify(parent_guardians) : '[]']
    );
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await pool.query('SELECT * FROM player_profiles WHERE user_id = $1', [userId]);
    return result.rows[0];
  }

  static async update(userId, profileData) {
    const allowedColumns = new Set([
      'first_name', 'last_name', 'username', 'date_of_birth', 'team_name', 'graduation_year',
      'city', 'state', 'position', 'height', 'weight', 'gpa', 'sat_score', 'act_score',
      'highlight_video_url', 'bio', 'hudl_profile', 'twitter_handle', 'instagram_handle', 'player_status',
      'college_division', 'conference', 'number', 'eligibility', 'transfer',
      'phone', 'email',
      'lastseasonstat1', 'lastseasonstat2', 'lastseasonstat3',
      'careerstat1', 'careerstat2', 'careerstat3',
      'other_sports', 'track_100m', 'track_200m', 'pff_grade',
      // AI Fit-Matching fields (Plan 2)
      'weighted_gpa', 'has_ap_ib', 'ap_ib_count', 'class_rank', 'intended_major', 'home_zip',
      'needs_financial_aid', 'needs_scholarship', 'pell_or_first_gen', 'levels_open',
      'preferred_regions', 'preferred_campus_setting', 'fit_preferences',
      // Recruiting contact fields (hsplayer/transferplayer; private, CSV export)
      'gender', 'address', 'zip', 'coach_name', 'coach_email', 'coach_phone', 'parent_guardians'
    ]);

    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(profileData).forEach(key => {
      if (profileData[key] !== undefined && allowedColumns.has(key)) {
        fields.push(`${key} = $${paramCount}`);
        // fit_preferences and parent_guardians are JSONB — node-postgres needs a
        // JSON string, not a JS object/array.
        const isJsonb = key === 'fit_preferences' || key === 'parent_guardians';
        values.push(isJsonb && profileData[key] != null
          ? JSON.stringify(profileData[key])
          : profileData[key]);
        paramCount++;
      }
    });

    values.push(userId);
    const query = `UPDATE player_profiles SET ${fields.join(', ')} WHERE user_id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Dedicated avatar update — bypasses the allowedColumns filter on update().
  // MUST only be called from the upload route, which generates the S3 key
  // from req.userId and never accepts a key from req.body. Security #22.
  static async updateProfileImage(userId, s3Key) {
    const result = await pool.query(
      `UPDATE player_profiles SET profile_image_url = $1 WHERE user_id = $2 RETURNING *`,
      [s3Key, userId]
    );
    return result.rows[0];
  }

  // Security #34: parameterized LIMIT/OFFSET so route can clamp + paginate.
  // Caller passes (filters, limit, offset); we fetch limit+1 rows and return
  // {players, hasMore} so route can pass hasMore through to frontend.
  static async search(filters, limit = 50, offset = 0) {
    let select = 'SELECT pp.*';
    let query = ' FROM player_profiles pp JOIN users u ON pp.user_id = u.id WHERE u.is_active = true';
    const values = [];
    let paramCount = 1;

    // Apple Guideline 1.2: hide users the viewer has blocked (or who blocked the viewer)
    if (filters.excludeBlockedFor) {
      const f = blockedUserFilter('pp.user_id', filters.excludeBlockedFor, paramCount);
      query += ` AND ${f.sql}`;
      values.push(f.param);
      paramCount = f.nextIndex;
    }

    if (filters.position) {
      query += ` AND pp.position = $${paramCount}`;
      values.push(filters.position);
      paramCount++;
    }
    if (filters.graduation_year) {
      query += ` AND pp.graduation_year = $${paramCount}`;
      values.push(filters.graduation_year);
      paramCount++;
    }
    if (filters.state) {
      query += ` AND pp.state = $${paramCount}`;
      values.push(filters.state);
      paramCount++;
    }
    if (filters.searchTerm) {
      const p = { term: paramCount, substr: paramCount + 1, prefix: paramCount + 2, word: paramCount + 3 };
      values.push(...searchTermParams(filters.searchTerm));
      paramCount += 4;
      const fullName = fullNameExpr('pp');
      select += `, ${searchScoreExpr(['pp.first_name', 'pp.last_name', 'pp.username', fullName], p)} AS search_score`;
      query += ` AND (similarity(pp.first_name, $${p.term}) > 0.2 OR similarity(pp.last_name, $${p.term}) > 0.2 OR similarity(pp.username, $${p.term}) > 0.2 OR similarity(${fullName}, $${p.term}) > 0.2 OR pp.first_name ILIKE $${p.substr} OR pp.last_name ILIKE $${p.substr} OR pp.username ILIKE $${p.substr} OR ${fullName} ILIKE $${p.substr})`;
    }

    if (filters.searchTerm) {
      // Keys must match compareSearchResults in utils/search-score.js — see invariant there.
      query += ` ORDER BY search_score DESC, COALESCE(pp.followers_count, 0) DESC, pp.created_at DESC, pp.user_id LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(limit + 1, offset);
    } else {
      query += ` ORDER BY pp.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(limit + 1, offset);
    }
    const result = await pool.query(select + query, values);
    const players = result.rows.slice(0, limit);
    const hasMore = result.rows.length > limit;
    return { players, hasMore };
  }

  static async findByUsername(username) {
    const result = await pool.query('SELECT pp.*, u.role FROM player_profiles pp JOIN users u ON pp.user_id = u.id WHERE pp.username = $1', [username]);
    return result.rows[0];
  }

  // Search HS Players only (those without college_division)
  static async searchHSPlayers(filters, limit = 9, offset = 0) {
    let query = `SELECT pp.* FROM player_profiles pp
                 JOIN users u ON pp.user_id = u.id
                 WHERE u.is_active = true
                 AND (pp.college_division IS NULL OR pp.college_division = '')`;
    const values = [];
    let paramCount = 1;

    // Exclude current user's profile from results
    if (filters.excludeUserId) {
      query += ` AND pp.user_id != $${paramCount}`;
      values.push(filters.excludeUserId);
      paramCount++;
    }

    // Apple Guideline 1.2: hide users the viewer has blocked (or who blocked the viewer)
    if (filters.excludeBlockedFor) {
      const f = blockedUserFilter('pp.user_id', filters.excludeBlockedFor, paramCount);
      query += ` AND ${f.sql}`;
      values.push(f.param);
      paramCount = f.nextIndex;
    }

    if (filters.position) {
      // Position can contain multiple values like "WR, RB" - check if the filter value is contained
      query += ` AND pp.position ILIKE $${paramCount}`;
      values.push(`%${filters.position}%`);
      paramCount++;
    }
    if (filters.graduation_year) {
      query += ` AND pp.graduation_year = $${paramCount}`;
      values.push(filters.graduation_year);
      paramCount++;
    }
    if (filters.state) {
      query += ` AND pp.state = $${paramCount}`;
      values.push(filters.state);
      paramCount++;
    }
    if (filters.min_height) {
      query += ` AND pp.height >= $${paramCount}`;
      values.push(filters.min_height);
      paramCount++;
    }
    if (filters.min_weight) {
      query += ` AND pp.weight >= $${paramCount}`;
      values.push(filters.min_weight);
      paramCount++;
    }
    if (filters.min_gpa) {
      query += ` AND pp.gpa >= $${paramCount}`;
      values.push(filters.min_gpa);
      paramCount++;
    }
    if (filters.min_sat_score) {
      query += ` AND pp.sat_score >= $${paramCount}`;
      values.push(filters.min_sat_score);
      paramCount++;
    }
    if (filters.min_act_score) {
      query += ` AND pp.act_score >= $${paramCount}`;
      values.push(filters.min_act_score);
      paramCount++;
    }
    if (filters.searchTerm) {
      query += ` AND (similarity(pp.first_name, $${paramCount}) > 0.2 OR similarity(pp.last_name, $${paramCount}) > 0.2 OR similarity(pp.username, $${paramCount}) > 0.2 OR pp.first_name ILIKE $${paramCount + 1} OR pp.last_name ILIKE $${paramCount + 1} OR pp.username ILIKE $${paramCount + 1})`;
      values.push(filters.searchTerm, `%${escapeLikePattern(filters.searchTerm)}%`);
      paramCount += 2;
    }

    // Add limit + 1 to check if there are more results
    if (filters.searchTerm) {
      query += ` ORDER BY GREATEST(similarity(pp.first_name, $${paramCount}), similarity(pp.last_name, $${paramCount}), similarity(pp.username, $${paramCount})) DESC, COALESCE(pp.followers_count, 0) DESC, pp.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      values.push(filters.searchTerm, limit + 1, offset);
    } else {
      query += ` ORDER BY ${playerPopularityExpr('pp')} DESC NULLS LAST, pp.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(limit + 1, offset);
    }

    const result = await pool.query(query, values);

    // Check if there are more results
    const hasMore = result.rows.length > limit;
    const players = hasMore ? result.rows.slice(0, limit) : result.rows;

    return { players, hasMore };
  }

  // Search College Players only (those WITH college_division)
  static async searchCollegePlayers(filters, limit = 9, offset = 0) {
    let query = `SELECT pp.* FROM player_profiles pp
                 JOIN users u ON pp.user_id = u.id
                 WHERE u.is_active = true
                 AND pp.college_division IS NOT NULL AND pp.college_division != ''`;
    const values = [];
    let paramCount = 1;

    // Exclude current user's profile from results
    if (filters.excludeUserId) {
      query += ` AND pp.user_id != $${paramCount}`;
      values.push(filters.excludeUserId);
      paramCount++;
    }

    // Apple Guideline 1.2: hide users the viewer has blocked (or who blocked the viewer)
    if (filters.excludeBlockedFor) {
      const f = blockedUserFilter('pp.user_id', filters.excludeBlockedFor, paramCount);
      query += ` AND ${f.sql}`;
      values.push(f.param);
      paramCount = f.nextIndex;
    }

    if (filters.position) {
      query += ` AND pp.position ILIKE $${paramCount}`;
      values.push(`%${filters.position}%`);
      paramCount++;
    }
    if (filters.college_division) {
      query += ` AND pp.college_division = $${paramCount}`;
      values.push(filters.college_division);
      paramCount++;
    }
    if (filters.state) {
      query += ` AND pp.state = $${paramCount}`;
      values.push(filters.state);
      paramCount++;
    }
    if (filters.searchTerm) {
      query += ` AND (similarity(pp.first_name, $${paramCount}) > 0.2 OR similarity(pp.last_name, $${paramCount}) > 0.2 OR similarity(pp.username, $${paramCount}) > 0.2 OR pp.first_name ILIKE $${paramCount + 1} OR pp.last_name ILIKE $${paramCount + 1} OR pp.username ILIKE $${paramCount + 1})`;
      values.push(filters.searchTerm, `%${escapeLikePattern(filters.searchTerm)}%`);
      paramCount += 2;
    }

    // Add limit + 1 to check if there are more results
    if (filters.searchTerm) {
      query += ` ORDER BY GREATEST(similarity(pp.first_name, $${paramCount}), similarity(pp.last_name, $${paramCount}), similarity(pp.username, $${paramCount})) DESC, COALESCE(pp.followers_count, 0) DESC, pp.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      values.push(filters.searchTerm, limit + 1, offset);
    } else {
      query += ` ORDER BY ${playerPopularityExpr('pp')} DESC NULLS LAST, pp.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(limit + 1, offset);
    }

    const result = await pool.query(query, values);

    // Check if there are more results
    const hasMore = result.rows.length > limit;
    const players = hasMore ? result.rows.slice(0, limit) : result.rows;

    return { players, hasMore };
  }

  // Search Transfer Players only (those WITH transfer = 'y')
  static async searchTransferPlayers(filters, limit = 9, offset = 0) {
    let query = `SELECT pp.* FROM player_profiles pp
                 JOIN users u ON pp.user_id = u.id
                 WHERE u.is_active = true
                 AND pp.transfer = 'y'`;
    const values = [];
    let paramCount = 1;

    // Exclude current user's profile from results
    if (filters.excludeUserId) {
      query += ` AND pp.user_id != $${paramCount}`;
      values.push(filters.excludeUserId);
      paramCount++;
    }

    // Apple Guideline 1.2: hide users the viewer has blocked (or who blocked the viewer)
    if (filters.excludeBlockedFor) {
      const f = blockedUserFilter('pp.user_id', filters.excludeBlockedFor, paramCount);
      query += ` AND ${f.sql}`;
      values.push(f.param);
      paramCount = f.nextIndex;
    }

    if (filters.position) {
      query += ` AND pp.position ILIKE $${paramCount}`;
      values.push(`%${filters.position}%`);
      paramCount++;
    }
    if (filters.eligibility) {
      query += ` AND pp.eligibility = $${paramCount}`;
      values.push(filters.eligibility);
      paramCount++;
    }
    if (filters.college_division) {
      query += ` AND pp.college_division = $${paramCount}`;
      values.push(filters.college_division);
      paramCount++;
    }
    if (filters.min_height) {
      query += ` AND pp.height >= $${paramCount}`;
      values.push(filters.min_height);
      paramCount++;
    }
    if (filters.min_weight) {
      query += ` AND pp.weight >= $${paramCount}`;
      values.push(filters.min_weight);
      paramCount++;
    }
    if (filters.min_gpa) {
      query += ` AND pp.gpa >= $${paramCount}`;
      values.push(filters.min_gpa);
      paramCount++;
    }
    if (filters.min_sat_score) {
      query += ` AND pp.sat_score >= $${paramCount}`;
      values.push(filters.min_sat_score);
      paramCount++;
    }
    if (filters.min_act_score) {
      query += ` AND pp.act_score >= $${paramCount}`;
      values.push(filters.min_act_score);
      paramCount++;
    }
    if (filters.searchTerm) {
      query += ` AND (similarity(pp.first_name, $${paramCount}) > 0.2 OR similarity(pp.last_name, $${paramCount}) > 0.2 OR similarity(pp.username, $${paramCount}) > 0.2 OR pp.first_name ILIKE $${paramCount + 1} OR pp.last_name ILIKE $${paramCount + 1} OR pp.username ILIKE $${paramCount + 1})`;
      values.push(filters.searchTerm, `%${escapeLikePattern(filters.searchTerm)}%`);
      paramCount += 2;
    }

    // Add limit + 1 to check if there are more results
    if (filters.searchTerm) {
      query += ` ORDER BY GREATEST(similarity(pp.first_name, $${paramCount}), similarity(pp.last_name, $${paramCount}), similarity(pp.username, $${paramCount})) DESC, COALESCE(pp.followers_count, 0) DESC, pp.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      values.push(filters.searchTerm, limit + 1, offset);
    } else {
      query += ` ORDER BY ${playerPopularityExpr('pp')} DESC NULLS LAST, pp.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(limit + 1, offset);
    }

    const result = await pool.query(query, values);

    // Check if there are more results
    const hasMore = result.rows.length > limit;
    const players = hasMore ? result.rows.slice(0, limit) : result.rows;

    return { players, hasMore };
  }

  static async updatePrivacySettings(userId, settings) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (settings.profile_visibility !== undefined) {
      fields.push(`profile_visibility = $${paramCount}`);
      values.push(settings.profile_visibility);
      paramCount++;
    }

    if (settings.message_permissions !== undefined) {
      fields.push(`message_permissions = $${paramCount}`);
      values.push(settings.message_permissions);
      paramCount++;
    }

    if (fields.length === 0) {
      return null;
    }

    values.push(userId);
    const query = `UPDATE player_profiles SET ${fields.join(', ')} WHERE user_id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // AI-powered search — searches HS players and transfer players only (never college)
  // Supports full filter set including game stat filters via JSONB
  static async searchByAiFilters(filters, excludeUserId, limit = 20, offset = 0, coach = null) {
    // VALID_STAT_KEYS + COMPOSITE_STAT_KEYS are module-level (also used by PortalSignal).
    // `coach` (optional): when supplied, AI Match fit is always a ranking factor —
    // results are over-fetched in relevance order, scored with computeFit, then
    // blended-sorted so better fits surface (Plan 7E). null = relevance-only.

    const values = [];
    let paramCount = 1;

    // Height conversion expression — used in both WHERE and scoring
    // Cast to text first so regex works whether column is INTEGER or VARCHAR
    const heightCaseExpr = `
      CASE
        WHEN CAST(pp.height AS TEXT) ~ '^[0-9]+''[0-9]+"?$' THEN
          CAST(SPLIT_PART(CAST(pp.height AS TEXT), '''', 1) AS INTEGER) * 12 +
          CAST(NULLIF(REGEXP_REPLACE(SPLIT_PART(CAST(pp.height AS TEXT), '''', 2), '[^0-9]', '', 'g'), '') AS INTEGER)
        WHEN CAST(pp.height AS TEXT) ~ '^[0-9]+'' [0-9]+"?$' THEN
          CAST(SPLIT_PART(CAST(pp.height AS TEXT), '''', 1) AS INTEGER) * 12 +
          CAST(NULLIF(REGEXP_REPLACE(SPLIT_PART(CAST(pp.height AS TEXT), '''', 2), '[^0-9]', '', 'g'), '') AS INTEGER)
        WHEN CAST(pp.height AS TEXT) ~ '^[0-9]+$' THEN
          CAST(pp.height AS INTEGER)
        ELSE 0
      END`;

    // Build relevance scoring expression based on active filters
    const scoreResult = buildRelevanceScoreExpr(filters, heightCaseExpr, VALID_STAT_KEYS, values, paramCount);
    paramCount = scoreResult.paramCount;

    let selectCols = `pp.*, ${scoreResult.expr} AS relevance_score`;
    let fromClause = `FROM player_profiles pp JOIN users u ON pp.user_id = u.id`;
    let whereClauses = [`u.is_active = true`];

    // Exclude requesting user
    if (excludeUserId) {
      whereClauses.push(`pp.user_id != $${paramCount}`);
      values.push(excludeUserId);
      paramCount++;
    }

    // Player type filter — NEVER include college players
    if (filters.player_type === 'hs') {
      whereClauses.push(`(pp.college_division IS NULL OR pp.college_division = '')`);
      whereClauses.push(`(pp.transfer IS NULL OR pp.transfer != 'y')`);
    } else if (filters.player_type === 'transfer') {
      whereClauses.push(`pp.transfer = 'y'`);
    } else {
      // "all" = HS + transfer only, exclude college players who are not transferring
      whereClauses.push(`((pp.college_division IS NULL OR pp.college_division = '') OR pp.transfer = 'y')`);
    }

    // Position filter (array of positions)
    if (filters.position && filters.position.length > 0) {
      const posConditions = filters.position.map(pos => {
        const p = `$${paramCount}`;
        values.push(`%${pos}%`);
        paramCount++;
        return `pp.position ILIKE ${p}`;
      });
      whereClauses.push(`(${posConditions.join(' OR ')})`);
    }

    // State filter — match full name, abbreviation, or case-insensitive
    if (filters.state) {
      whereClauses.push(`(pp.state ILIKE $${paramCount} OR pp.state ILIKE $${paramCount + 1})`);
      values.push(filters.state);
      // Also try the abbreviation lookup
      const stateAbbrevs = {
        'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
        'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
        'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
        'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
        'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
        'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
        'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
        'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
        'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
        'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
        'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
        'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
        'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC'
      };
      const abbrev = stateAbbrevs[filters.state.toLowerCase()] || filters.state;
      values.push(abbrev);
      paramCount += 2;
    }

    // Graduation year
    if (filters.graduation_year) {
      // If max_graduation_year is set, treat graduation_year as the LOWER bound (range).
      // Otherwise preserve legacy exact-match behavior.
      if (filters.max_graduation_year) {
        whereClauses.push(`pp.graduation_year >= $${paramCount}`);
        values.push(filters.graduation_year);
        paramCount++;
        whereClauses.push(`pp.graduation_year <= $${paramCount}`);
        values.push(filters.max_graduation_year);
        paramCount++;
      } else {
        whereClauses.push(`pp.graduation_year = $${paramCount}`);
        values.push(filters.graduation_year);
        paramCount++;
      }
    } else if (filters.max_graduation_year) {
      // Coach gave only an upper bound (rare — e.g. "class of 2027 or earlier")
      whereClauses.push(`pp.graduation_year <= $${paramCount}`);
      values.push(filters.max_graduation_year);
      paramCount++;
    }

    // Height filters
    if (filters.min_height) {
      whereClauses.push(`(${heightCaseExpr}) >= $${paramCount}`);
      values.push(filters.min_height);
      paramCount++;
    }
    if (filters.max_height) {
      whereClauses.push(`(${heightCaseExpr}) <= $${paramCount}`);
      values.push(filters.max_height);
      paramCount++;
    }

    // Weight filters
    if (filters.min_weight) {
      whereClauses.push(`pp.weight >= $${paramCount}`);
      values.push(filters.min_weight);
      paramCount++;
    }
    if (filters.max_weight) {
      whereClauses.push(`pp.weight <= $${paramCount}`);
      values.push(filters.max_weight);
      paramCount++;
    }

    // GPA filter — supports min, max, or range
    if (filters.min_gpa) {
      whereClauses.push(`pp.gpa >= $${paramCount}`);
      values.push(filters.min_gpa);
      paramCount++;
    }
    if (filters.max_gpa) {
      whereClauses.push(`pp.gpa <= $${paramCount}`);
      values.push(filters.max_gpa);
      paramCount++;
    }

    // SAT score filter — supports min, max, or range
    if (filters.min_sat_score) {
      whereClauses.push(`pp.sat_score >= $${paramCount}`);
      values.push(filters.min_sat_score);
      paramCount++;
    }
    if (filters.max_sat_score) {
      whereClauses.push(`pp.sat_score <= $${paramCount}`);
      values.push(filters.max_sat_score);
      paramCount++;
    }

    // ACT score filter — supports min, max, or range
    if (filters.min_act_score) {
      whereClauses.push(`pp.act_score >= $${paramCount}`);
      values.push(filters.min_act_score);
      paramCount++;
    }
    if (filters.max_act_score) {
      whereClauses.push(`pp.act_score <= $${paramCount}`);
      values.push(filters.max_act_score);
      paramCount++;
    }

    // College division (for transfer players)
    if (filters.college_division) {
      whereClauses.push(`pp.college_division = $${paramCount}`);
      values.push(filters.college_division);
      paramCount++;
    }

    // Eligibility (transfer players) — exact match when only `eligibility` is set;
    // range when both bounds present; ceiling-only when just max_eligibility.
    if (filters.eligibility) {
      if (filters.max_eligibility) {
        whereClauses.push(`pp.eligibility >= $${paramCount}`);
        values.push(filters.eligibility);
        paramCount++;
        whereClauses.push(`pp.eligibility <= $${paramCount}`);
        values.push(filters.max_eligibility);
        paramCount++;
      } else {
        whereClauses.push(`pp.eligibility = $${paramCount}`);
        values.push(filters.eligibility);
        paramCount++;
      }
    } else if (filters.max_eligibility) {
      whereClauses.push(`pp.eligibility <= $${paramCount}`);
      values.push(filters.max_eligibility);
      paramCount++;
    }

    // Highlight / film filter
    if (filters.has_highlights === true) {
      whereClauses.push(`(
        EXISTS (SELECT 1 FROM player_highlights ph WHERE ph.user_id = pp.user_id LIMIT 1)
        OR (pp.hudl_profile IS NOT NULL AND pp.hudl_profile != '')
      )`);
    }

    // Other sports — array containment (AND semantics: player has ALL listed sports)
    if (filters.other_sports && Array.isArray(filters.other_sports) && filters.other_sports.length > 0) {
      const placeholders = filters.other_sports.map(() => {
        const p = `$${paramCount}`;
        paramCount++;
        return p;
      });
      whereClauses.push(`pp.other_sports @> ARRAY[${placeholders.join(', ')}]::text[]`);
      filters.other_sports.forEach(s => values.push(s));
    } else if (filters.plays_other_sports === true) {
      // Boolean shortcut — any multi-sport athlete (only fires when other_sports is empty)
      whereClauses.push(`(pp.other_sports IS NOT NULL AND array_length(pp.other_sports, 1) > 0)`);
    }

    // Track 100m max (faster = lower number, so <= threshold). NOT NULL guard
    // ensures players without track times don't pass through.
    if (filters.track_100m_max) {
      whereClauses.push(`(pp.track_100m IS NOT NULL AND pp.track_100m <= $${paramCount})`);
      values.push(filters.track_100m_max);
      paramCount++;
    }

    // Track 200m max
    if (filters.track_200m_max) {
      whereClauses.push(`(pp.track_200m IS NOT NULL AND pp.track_200m <= $${paramCount})`);
      values.push(filters.track_200m_max);
      paramCount++;
    }

    // PFF grade minimum — transfer-only. NOT NULL guard excludes ungraded players.
    if (filters.pff_grade_min) {
      whereClauses.push(`(pp.pff_grade IS NOT NULL AND pp.pff_grade >= $${paramCount})`);
      values.push(filters.pff_grade_min);
      paramCount++;
    }

    // PFF grade maximum — transfer-only. NOT NULL guard also excludes ungraded.
    if (filters.pff_grade_max) {
      whereClauses.push(`(pp.pff_grade IS NOT NULL AND pp.pff_grade <= $${paramCount})`);
      values.push(filters.pff_grade_max);
      paramCount++;
    }

    // ---- Recruiting-profile (fit) FIELDS as direct filters (Plan 7E) ----
    // These are PLAYER fields the coach searches on directly (distinct from the
    // coach's own program fields the fit ENGINE reads). TEXT[] cols use `&&`
    // (any-of overlap) — deliberately UNLIKE other_sports' `@>` (all-of) above:
    // "open to D2 or D3" means EITHER, not BOTH. GIN-indexed (migration 046).
    const fitArrayOverlap = (col, vals) => {
      const placeholders = vals.map(() => {
        const p = `$${paramCount}`;
        paramCount++;
        return p;
      });
      whereClauses.push(`pp.${col} && ARRAY[${placeholders.join(', ')}]::text[]`);
      vals.forEach(v => values.push(v));
    };
    if (Array.isArray(filters.intended_major) && filters.intended_major.length > 0) {
      fitArrayOverlap('intended_major', filters.intended_major);
    }
    if (Array.isArray(filters.levels_open) && filters.levels_open.length > 0) {
      fitArrayOverlap('levels_open', filters.levels_open);
    }
    if (Array.isArray(filters.preferred_regions) && filters.preferred_regions.length > 0) {
      fitArrayOverlap('preferred_regions', filters.preferred_regions);
    }
    if (filters.preferred_campus_setting) {
      whereClauses.push(`pp.preferred_campus_setting = $${paramCount}`);
      values.push(filters.preferred_campus_setting);
      paramCount++;
    }
    if (filters.needs_financial_aid) {
      whereClauses.push(`pp.needs_financial_aid = $${paramCount}`);
      values.push(filters.needs_financial_aid);
      paramCount++;
    }
    if (filters.needs_scholarship) {
      whereClauses.push(`pp.needs_scholarship = $${paramCount}`);
      values.push(filters.needs_scholarship);
      paramCount++;
    }

    // Offer filters (count and/or division)
    if (filters.offer_filters) {
      const of = filters.offer_filters;
      if (of.division && of.min_count) {
        // Count offers matching a specific division using lateral unnest
        whereClauses.push(`(
          pp.offers IS NOT NULL AND pp.offers != '' AND
          (SELECT COUNT(*) FROM unnest(string_to_array(pp.offers, '|')) AS offer_entry
           WHERE offer_entry ILIKE $${paramCount}) >= $${paramCount + 1}
        )`);
        values.push(`%${of.division}%`);
        values.push(of.min_count);
        paramCount += 2;
      } else if (of.division) {
        // Has at least 1 offer from this division
        whereClauses.push(`pp.offers ILIKE $${paramCount}`);
        values.push(`%${of.division}%`);
        paramCount++;
      } else if (of.min_count) {
        // Count total offers (split by '|')
        whereClauses.push(`(
          pp.offers IS NOT NULL AND pp.offers != ''
          AND array_length(string_to_array(pp.offers, '|'), 1) >= $${paramCount}
        )`);
        values.push(of.min_count);
        paramCount++;
      }
      // Max offer count (for "sleeper" / "under the radar" searches)
      if (of.max_count) {
        whereClauses.push(`(
          pp.offers IS NULL OR pp.offers = ''
          OR array_length(string_to_array(pp.offers, '|'), 1) <= $${paramCount}
        )`);
        values.push(of.max_count);
        paramCount++;
      }
    }

    // Search term (name/username) — fuzzy + ILIKE fallback
    if (filters.searchTerm) {
      whereClauses.push(`(similarity(pp.first_name, $${paramCount}) > 0.2 OR similarity(pp.last_name, $${paramCount}) > 0.2 OR similarity(pp.username, $${paramCount}) > 0.2 OR pp.first_name ILIKE $${paramCount + 1} OR pp.last_name ILIKE $${paramCount + 1} OR pp.username ILIKE $${paramCount + 1})`);
      values.push(filters.searchTerm, `%${escapeLikePattern(filters.searchTerm)}%`);
      paramCount += 2;
    }

    // Stat filters — subquery into player_games + player_game_stats
    // Uses SUM aggregation across games so stats spread across multiple games are totaled
    if (filters.stat_filters && filters.stat_filters.length > 0) {
      filters.stat_filters.forEach((sf, index) => {
        // Validate stat_key against allowlist to prevent SQL injection
        if (!VALID_STAT_KEYS.has(sf.stat_key)) return;

        const alias = `sf${index}`;
        const gameAlias = `sg${index}`;

        // Build aggregated subquery — SUM the stat across matching games
        let statSubquery = `
          EXISTS (
            SELECT 1 FROM player_games ${gameAlias}
            JOIN player_game_stats ${alias} ON ${gameAlias}.id = ${alias}.game_id
            JOIN player_profiles pp_stat ON ${gameAlias}.player_id = pp_stat.id
            WHERE pp_stat.user_id = pp.user_id`;

        // Season year filter:
        // 0 or null = career (all games), -1 = last season, positive = specific year
        if (sf.season_year === -1) {
          // Last season: find the max season_year for this player
          statSubquery += ` AND ${gameAlias}.season_year = (
            SELECT MAX(sg_inner.season_year) FROM player_games sg_inner
            JOIN player_profiles pp_inner ON sg_inner.player_id = pp_inner.id
            WHERE pp_inner.user_id = pp.user_id AND sg_inner.season_year > 0
          )`;
        } else if (sf.season_year && sf.season_year > 0) {
          // Specific year
          statSubquery += ` AND ${gameAlias}.season_year = $${paramCount}`;
          values.push(sf.season_year);
          paramCount++;
        }
        // season_year 0 or null/undefined = career totals across ALL games (no filter needed)

        // Position filter for stats
        if (sf.positions && sf.positions.length > 0) {
          const posList = sf.positions.map(p => {
            const param = `$${paramCount}`;
            values.push(p);
            paramCount++;
            return param;
          });
          statSubquery += ` AND ${alias}.position IN (${posList.join(', ')})`;
        }

        const op = VALID_STAT_OPERATORS.has(sf.operator) ? sf.operator : '>=';
        // Build the stat expression — composite keys sum multiple JSONB fields
        const compositeKeys = COMPOSITE_STAT_KEYS[sf.stat_key];
        const statExpr = compositeKeys
          ? compositeKeys.map(k => `COALESCE(CAST(${alias}.stats->>'${k}' AS NUMERIC), 0)`).join(' + ')
          : `COALESCE(CAST(${alias}.stats->>'${sf.stat_key}' AS NUMERIC), 0)`;

        if (sf.per_game) {
          // Per-game mode: check if ANY single game meets the threshold
          statSubquery += ` AND (${statExpr}) ${op} $${paramCount}`;
        } else {
          // Aggregate mode (default): SUM the stat across all matching games
          statSubquery += ` GROUP BY pp_stat.user_id
            HAVING SUM(${statExpr}) ${op} $${paramCount}`;
        }
        values.push(sf.value);
        paramCount++;

        statSubquery += `)`;
        whereClauses.push(statSubquery);
      });
    }

    // Build final query — rank by relevance score, with similarity as primary for name searches
    let orderClause;
    if (filters.searchTerm) {
      orderClause = `ORDER BY GREATEST(similarity(pp.first_name, $${paramCount}), similarity(pp.last_name, $${paramCount}), similarity(pp.username, $${paramCount})) DESC, relevance_score DESC`;
      values.push(filters.searchTerm);
      paramCount++;
    } else {
      orderClause = `ORDER BY relevance_score DESC`;
    }

    // Fit-aware ranking (Plan 7E): when a coach is present AND this isn't an explicit
    // name lookup, over-fetch a relevance-ordered window, then blend-sort by fit in JS.
    // Name searches stay similarity-first (don't let fit reorder a direct lookup).
    const useFit = coach && !filters.searchTerm && offset < MAX_FIT_WINDOW;
    if (useFit) {
      const windowSize = Math.min(offset + limit + 1, MAX_FIT_WINDOW);
      const query = `SELECT ${selectCols} ${fromClause}
        WHERE ${whereClauses.join(' AND ')}
        ${orderClause}
        LIMIT $${paramCount}`;
      values.push(windowSize);
      const result = await pool.query(query, values);
      return rerankByFit(result.rows, coach, offset, limit, 'relevance_score');
    }

    const query = `SELECT ${selectCols} ${fromClause}
      WHERE ${whereClauses.join(' AND ')}
      ${orderClause}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    values.push(limit + 1, offset);

    const result = await pool.query(query, values);

    const hasMore = result.rows.length > limit;
    const players = hasMore ? result.rows.slice(0, limit) : result.rows;

    return { players, hasMore };
  }
}

module.exports = PlayerProfile;
module.exports.VALID_STAT_KEYS = VALID_STAT_KEYS;
module.exports.VALID_STAT_OPERATORS = VALID_STAT_OPERATORS;
// Shared fit-aware re-ranking (Plan 7E) — reused by PortalSignal for PI parity.
module.exports.rerankByFit = rerankByFit;
module.exports.MAX_FIT_WINDOW = MAX_FIT_WINDOW;
module.exports.COMPOSITE_STAT_KEYS = COMPOSITE_STAT_KEYS;
