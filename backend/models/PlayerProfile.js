const pool = require('../config/database');

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

  // Stat performance scoring: for each stat filter, reward exceeding the threshold
  if (filters.stat_filters && filters.stat_filters.length > 0) {
    filters.stat_filters.forEach((sf, index) => {
      if (!validStatKeys.has(sf.stat_key)) return;

      const scoreAlias = `score_sg${index}`;
      const scoreStatsAlias = `score_sf${index}`;

      let statScoreSubquery = `COALESCE((
        SELECT LEAST(
          SUM(COALESCE(CAST(${scoreStatsAlias}.stats->>'${sf.stat_key}' AS NUMERIC), 0)) / NULLIF($${paramCount}, 0) * 5.0,
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
      college_division, conference, number, eligibility
    } = profileData;

    const result = await pool.query(
      `INSERT INTO player_profiles
      (user_id, first_name, last_name, username, date_of_birth, team_name, graduation_year,
       city, state, position, height, weight, gpa, sat_score, act_score,
       highlight_video_url, bio, hudl_profile, twitter_handle, instagram_handle, player_status,
       college_division, conference, number, eligibility)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      RETURNING *`,
      [userId, first_name, last_name, username, date_of_birth, team_name, graduation_year,
       city, state, position, height, weight, gpa, sat_score, act_score,
       highlight_video_url, bio, hudl_profile, twitter_handle, instagram_handle, player_status,
       college_division, conference, number, eligibility]
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
      'college_division', 'conference', 'number', 'eligibility', 'profile_image_url', 'transfer',
      'years_of_eligibility', 'phone', 'email', 'is_transfer_player'
    ]);

    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(profileData).forEach(key => {
      if (profileData[key] !== undefined && allowedColumns.has(key)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(profileData[key]);
        paramCount++;
      }
    });

    values.push(userId);
    const query = `UPDATE player_profiles SET ${fields.join(', ')} WHERE user_id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async search(filters) {
    let query = 'SELECT pp.*, u.email FROM player_profiles pp JOIN users u ON pp.user_id = u.id WHERE u.is_active = true';
    const values = [];
    let paramCount = 1;

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
      query += ` AND (similarity(pp.first_name, $${paramCount}) > 0.2 OR similarity(pp.last_name, $${paramCount}) > 0.2 OR similarity(pp.username, $${paramCount}) > 0.2 OR pp.first_name ILIKE $${paramCount + 1} OR pp.last_name ILIKE $${paramCount + 1} OR pp.username ILIKE $${paramCount + 1})`;
      values.push(filters.searchTerm, `%${filters.searchTerm}%`);
      paramCount += 2;
    }

    if (filters.searchTerm) {
      query += ` ORDER BY GREATEST(similarity(pp.first_name, $${paramCount}), similarity(pp.last_name, $${paramCount}), similarity(pp.username, $${paramCount})) DESC, pp.created_at DESC LIMIT 50`;
      values.push(filters.searchTerm);
      paramCount++;
    } else {
      query += ' ORDER BY pp.created_at DESC LIMIT 50';
    }
    const result = await pool.query(query, values);
    return result.rows;
  }

  static async findByUsername(username) {
    const result = await pool.query('SELECT pp.*, u.email, u.role FROM player_profiles pp JOIN users u ON pp.user_id = u.id WHERE pp.username = $1', [username]);
    return result.rows[0];
  }

  // Search HS Players only (those without college_division)
  static async searchHSPlayers(filters, limit = 9, offset = 0) {
    let query = `SELECT pp.*, u.email FROM player_profiles pp
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
      // Height stored as string like "6'1"" - convert to inches for comparison
      // Extract feet and inches: CAST(SPLIT_PART(height, '''', 1) AS INTEGER) * 12 + CAST(REGEXP_REPLACE(SPLIT_PART(height, '''', 2), '[^0-9]', '', 'g') AS INTEGER)
      query += ` AND (
        CASE
          WHEN pp.height ~ '^[0-9]+''[0-9]+"?$' THEN
            CAST(SPLIT_PART(pp.height, '''', 1) AS INTEGER) * 12 +
            CAST(NULLIF(REGEXP_REPLACE(SPLIT_PART(pp.height, '''', 2), '[^0-9]', '', 'g'), '') AS INTEGER)
          WHEN pp.height ~ '^[0-9]+$' THEN
            CAST(pp.height AS INTEGER)
          ELSE 0
        END
      ) >= $${paramCount}`;
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
    if (filters.searchTerm) {
      query += ` AND (similarity(pp.first_name, $${paramCount}) > 0.2 OR similarity(pp.last_name, $${paramCount}) > 0.2 OR similarity(pp.username, $${paramCount}) > 0.2 OR pp.first_name ILIKE $${paramCount + 1} OR pp.last_name ILIKE $${paramCount + 1} OR pp.username ILIKE $${paramCount + 1})`;
      values.push(filters.searchTerm, `%${filters.searchTerm}%`);
      paramCount += 2;
    }

    // Add limit + 1 to check if there are more results
    if (filters.searchTerm) {
      query += ` ORDER BY GREATEST(similarity(pp.first_name, $${paramCount}), similarity(pp.last_name, $${paramCount}), similarity(pp.username, $${paramCount})) DESC, pp.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      values.push(filters.searchTerm, limit + 1, offset);
    } else {
      query += ` ORDER BY pp.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
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
    let query = `SELECT pp.*, u.email FROM player_profiles pp
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
      values.push(filters.searchTerm, `%${filters.searchTerm}%`);
      paramCount += 2;
    }

    // Add limit + 1 to check if there are more results
    if (filters.searchTerm) {
      query += ` ORDER BY GREATEST(similarity(pp.first_name, $${paramCount}), similarity(pp.last_name, $${paramCount}), similarity(pp.username, $${paramCount})) DESC, pp.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      values.push(filters.searchTerm, limit + 1, offset);
    } else {
      query += ` ORDER BY pp.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
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
    let query = `SELECT pp.*, u.email FROM player_profiles pp
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
      // Height stored as string like "6'1"" - convert to inches for comparison
      query += ` AND (
        CASE
          WHEN pp.height ~ '^[0-9]+''[0-9]+"?$' THEN
            CAST(SPLIT_PART(pp.height, '''', 1) AS INTEGER) * 12 +
            CAST(NULLIF(REGEXP_REPLACE(SPLIT_PART(pp.height, '''', 2), '[^0-9]', '', 'g'), '') AS INTEGER)
          WHEN pp.height ~ '^[0-9]+'' [0-9]+"?$' THEN
            CAST(SPLIT_PART(pp.height, '''', 1) AS INTEGER) * 12 +
            CAST(NULLIF(REGEXP_REPLACE(SPLIT_PART(pp.height, '''', 2), '[^0-9]', '', 'g'), '') AS INTEGER)
          WHEN pp.height ~ '^[0-9]+$' THEN
            CAST(pp.height AS INTEGER)
          ELSE 0
        END
      ) >= $${paramCount}`;
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
    if (filters.searchTerm) {
      query += ` AND (similarity(pp.first_name, $${paramCount}) > 0.2 OR similarity(pp.last_name, $${paramCount}) > 0.2 OR similarity(pp.username, $${paramCount}) > 0.2 OR pp.first_name ILIKE $${paramCount + 1} OR pp.last_name ILIKE $${paramCount + 1} OR pp.username ILIKE $${paramCount + 1})`;
      values.push(filters.searchTerm, `%${filters.searchTerm}%`);
      paramCount += 2;
    }

    // Add limit + 1 to check if there are more results
    if (filters.searchTerm) {
      query += ` ORDER BY GREATEST(similarity(pp.first_name, $${paramCount}), similarity(pp.last_name, $${paramCount}), similarity(pp.username, $${paramCount})) DESC, pp.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      values.push(filters.searchTerm, limit + 1, offset);
    } else {
      query += ` ORDER BY pp.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
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
  static async searchByAiFilters(filters, excludeUserId, limit = 20, offset = 0) {
    const VALID_STAT_KEYS = new Set([
      'rush_yds', 'rush_tds', 'pass_yds', 'pass_tds', 'ints', 'comp_%',
      'rec', 'rec_yds', 'rec_tds', 'tackles', 'tfls', 'sacks', 'pbu',
      'ff', 'int', 'att', 'm', 'blk', 'long', 'pats', 'avg', 'tb',
      'fc', 'i20', '50+'
    ]);

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

    let selectCols = `pp.*, u.email, ${scoreResult.expr} AS relevance_score`;
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
      whereClauses.push(`pp.graduation_year = $${paramCount}`);
      values.push(filters.graduation_year);
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

    // GPA filter
    if (filters.min_gpa) {
      whereClauses.push(`pp.gpa >= $${paramCount}`);
      values.push(filters.min_gpa);
      paramCount++;
    }

    // College division (for transfer players)
    if (filters.college_division) {
      whereClauses.push(`pp.college_division = $${paramCount}`);
      values.push(filters.college_division);
      paramCount++;
    }

    // Eligibility (transfer players)
    if (filters.eligibility) {
      whereClauses.push(`pp.eligibility = $${paramCount}`);
      values.push(filters.eligibility);
      paramCount++;
    }

    // Highlight / film filter
    if (filters.has_highlights === true) {
      whereClauses.push(`(
        EXISTS (SELECT 1 FROM player_highlights ph WHERE ph.user_id = pp.user_id LIMIT 1)
        OR (pp.hudl_profile IS NOT NULL AND pp.hudl_profile != '')
      )`);
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
    }

    // Search term (name/username) — fuzzy + ILIKE fallback
    if (filters.searchTerm) {
      whereClauses.push(`(similarity(pp.first_name, $${paramCount}) > 0.2 OR similarity(pp.last_name, $${paramCount}) > 0.2 OR similarity(pp.username, $${paramCount}) > 0.2 OR pp.first_name ILIKE $${paramCount + 1} OR pp.last_name ILIKE $${paramCount + 1} OR pp.username ILIKE $${paramCount + 1})`);
      values.push(filters.searchTerm, `%${filters.searchTerm}%`);
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

        const op = sf.operator || '>=';
        if (sf.per_game) {
          // Per-game mode: check if ANY single game meets the threshold
          statSubquery += ` AND COALESCE(CAST(${alias}.stats->>'${sf.stat_key}' AS NUMERIC), 0) ${op} $${paramCount}`;
        } else {
          // Aggregate mode (default): SUM the stat across all matching games
          statSubquery += ` GROUP BY pp_stat.user_id
            HAVING SUM(COALESCE(CAST(${alias}.stats->>'${sf.stat_key}' AS NUMERIC), 0)) ${op} $${paramCount}`;
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
