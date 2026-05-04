const pool = require('../config/database');
const { escapeLikePattern } = require('../middleware/validation');

class CoachProfile {
  static async create(userId, profileData) {
    const {
      first_name, last_name, username, team_name, college_division,
      position_title, city, state, phone, bio, conference
    } = profileData;

    const result = await pool.query(
      `INSERT INTO coach_profiles
      (user_id, first_name, last_name, username, team_name, college_division,
       position_title, city, state, phone, bio, conference)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [userId, first_name, last_name, username, team_name, college_division,
       position_title, city, state, phone, bio, conference]
    );
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await pool.query('SELECT * FROM coach_profiles WHERE user_id = $1', [userId]);
    return result.rows[0];
  }

  static async update(userId, profileData) {
    const allowedColumns = new Set([
      'first_name', 'last_name', 'username', 'team_name', 'college_division',
      'position_title', 'city', 'state', 'phone', 'bio', 'conference'
      // profile_image_url removed — set via updateProfileImage() only (security #22)
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
    const query = `UPDATE coach_profiles SET ${fields.join(', ')} WHERE user_id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Dedicated avatar update — bypasses the allowedColumns filter on update().
  // MUST only be called from the upload route, which generates the S3 key
  // from req.userId and never accepts a key from req.body. Security #22.
  static async updateProfileImage(userId, s3Key) {
    const result = await pool.query(
      `UPDATE coach_profiles SET profile_image_url = $1 WHERE user_id = $2 RETURNING *`,
      [s3Key, userId]
    );
    return result.rows[0];
  }

  // Security #34: parameterized LIMIT/OFFSET so route can clamp + paginate.
  // Caller passes (filters, limit, offset); we fetch limit+1 rows and return
  // {coaches, hasMore} so route can pass hasMore through to frontend.
  static async search(filters, limit = 50, offset = 0) {
    let query = 'SELECT cp.* FROM coach_profiles cp JOIN users u ON cp.user_id = u.id WHERE u.is_active = true';
    const values = [];
    let paramCount = 1;

    if (filters.college_division) {
      query += ` AND cp.college_division = $${paramCount}`;
      values.push(filters.college_division);
      paramCount++;
    }
    if (filters.state) {
      query += ` AND cp.state = $${paramCount}`;
      values.push(filters.state);
      paramCount++;
    }
    if (filters.searchTerm) {
      query += ` AND (similarity(cp.first_name, $${paramCount}) > 0.2 OR similarity(cp.last_name, $${paramCount}) > 0.2 OR similarity(cp.username, $${paramCount}) > 0.2 OR similarity(cp.team_name, $${paramCount}) > 0.2 OR cp.first_name ILIKE $${paramCount + 1} OR cp.last_name ILIKE $${paramCount + 1} OR cp.username ILIKE $${paramCount + 1} OR cp.team_name ILIKE $${paramCount + 1})`;
      values.push(filters.searchTerm, `%${escapeLikePattern(filters.searchTerm)}%`);
      paramCount += 2;
    }

    if (filters.searchTerm) {
      query += ` ORDER BY GREATEST(similarity(cp.first_name, $${paramCount}), similarity(cp.last_name, $${paramCount}), similarity(cp.username, $${paramCount}), similarity(cp.team_name, $${paramCount})) DESC, cp.verified DESC, cp.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      values.push(filters.searchTerm, limit + 1, offset);
    } else {
      query += ` ORDER BY cp.verified DESC, COALESCE(cp.followers_count, 0) DESC, cp.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(limit + 1, offset);
    }
    const result = await pool.query(query, values);
    const coaches = result.rows.slice(0, limit);
    const hasMore = result.rows.length > limit;
    return { coaches, hasMore };
  }

  static async findByUsername(username) {
    const result = await pool.query('SELECT cp.*, u.role FROM coach_profiles cp JOIN users u ON cp.user_id = u.id WHERE cp.username = $1', [username]);
    return result.rows[0];
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
    const query = `UPDATE coach_profiles SET ${fields.join(', ')} WHERE user_id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0];
  }
}

module.exports = CoachProfile;
