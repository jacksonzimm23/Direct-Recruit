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
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(profileData).forEach(key => {
      if (profileData[key] !== undefined) {
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
      query += ` AND (pp.first_name ILIKE $${paramCount} OR pp.last_name ILIKE $${paramCount} OR pp.username ILIKE $${paramCount})`;
      values.push(`%${filters.searchTerm}%`);
      paramCount++;
    }

    query += ' ORDER BY pp.created_at DESC LIMIT 50';
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
      query += ` AND (pp.first_name ILIKE $${paramCount} OR pp.last_name ILIKE $${paramCount} OR pp.username ILIKE $${paramCount})`;
      values.push(`%${filters.searchTerm}%`);
      paramCount++;
    }

    // Add limit + 1 to check if there are more results
    query += ` ORDER BY pp.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    values.push(limit + 1, offset);

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
      query += ` AND (pp.first_name ILIKE $${paramCount} OR pp.last_name ILIKE $${paramCount} OR pp.username ILIKE $${paramCount})`;
      values.push(`%${filters.searchTerm}%`);
      paramCount++;
    }

    // Add limit + 1 to check if there are more results
    query += ` ORDER BY pp.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    values.push(limit + 1, offset);

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
      query += ` AND (pp.first_name ILIKE $${paramCount} OR pp.last_name ILIKE $${paramCount} OR pp.username ILIKE $${paramCount})`;
      values.push(`%${filters.searchTerm}%`);
      paramCount++;
    }

    // Add limit + 1 to check if there are more results
    query += ` ORDER BY pp.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    values.push(limit + 1, offset);

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
}

module.exports = PlayerProfile;
