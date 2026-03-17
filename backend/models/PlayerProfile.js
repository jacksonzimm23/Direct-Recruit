const pool = require('../config/database');

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

    let selectCols = `pp.*, u.email`;
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

    // Height filters (stored as VARCHAR like "6'1"")
    const heightCaseExpr = `
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
      END`;

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

    // Build final query — rank by similarity when searching by name
    let orderClause;
    if (filters.searchTerm) {
      orderClause = `ORDER BY GREATEST(similarity(pp.first_name, $${paramCount}), similarity(pp.last_name, $${paramCount}), similarity(pp.username, $${paramCount})) DESC, pp.created_at DESC`;
      values.push(filters.searchTerm);
      paramCount++;
    } else {
      orderClause = `ORDER BY pp.created_at DESC`;
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
