const pool = require('../config/database');

class OtherProfile {
  static async create(userId, profileData) {
    const {
      first_name, last_name, username
    } = profileData;

    const result = await pool.query(
      `INSERT INTO other_profiles
      (user_id, first_name, last_name, username)
      VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [userId, first_name, last_name, username]
    );
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await pool.query('SELECT * FROM other_profiles WHERE user_id = $1', [userId]);
    return result.rows[0];
  }

  static async findByUsername(username) {
    const result = await pool.query(
      'SELECT op.*, u.email, u.role FROM other_profiles op JOIN users u ON op.user_id = u.id WHERE op.username = $1',
      [username]
    );
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

    if (fields.length === 0) {
      return this.findByUserId(userId);
    }

    values.push(userId);
    const query = `UPDATE other_profiles SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE user_id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async search(filters) {
    let query = 'SELECT op.*, u.email FROM other_profiles op JOIN users u ON op.user_id = u.id WHERE u.is_active = true';
    const values = [];
    let paramCount = 1;

    if (filters.searchTerm) {
      query += ` AND (op.first_name ILIKE $${paramCount} OR op.last_name ILIKE $${paramCount} OR op.username ILIKE $${paramCount} OR op.subheader ILIKE $${paramCount})`;
      values.push(`%${filters.searchTerm}%`);
      paramCount++;
    }

    query += ' ORDER BY op.created_at DESC LIMIT 50';
    const result = await pool.query(query, values);
    return result.rows;
  }

  // Discover other profiles with pagination
  static async discover(filters = {}, limit = 12, offset = 0) {
    let query = `
      SELECT op.*, u.email
      FROM other_profiles op
      JOIN users u ON op.user_id = u.id
      WHERE u.is_active = true
    `;
    const values = [];
    let paramCount = 1;

    // Exclude current user if specified
    if (filters.excludeUserId) {
      query += ` AND op.user_id != $${paramCount}`;
      values.push(filters.excludeUserId);
      paramCount++;
    }

    // Search term filter
    if (filters.searchTerm) {
      query += ` AND (op.first_name ILIKE $${paramCount} OR op.last_name ILIKE $${paramCount} OR op.username ILIKE $${paramCount} OR op.subheader ILIKE $${paramCount})`;
      values.push(`%${filters.searchTerm}%`);
      paramCount++;
    }

    // Count total for hasMore check
    const countQuery = query.replace('SELECT op.*, u.email', 'SELECT COUNT(*) as total');
    const countResult = await pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].total);

    // Add ordering and pagination
    query += ` ORDER BY op.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);

    return {
      profiles: result.rows,
      hasMore: offset + result.rows.length < total
    };
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
    const query = `UPDATE other_profiles SET ${fields.join(', ')} WHERE user_id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0];
  }
}

module.exports = OtherProfile;
