const pool = require('../config/database');

class OtherProfile {
  static async create(userId, profileData) {
    const {
      first_name, last_name, username, is_nil_brand, company_name
    } = profileData;

    const result = await pool.query(
      `INSERT INTO other_profiles
      (user_id, first_name, last_name, username, is_nil_brand, company_name)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [userId, first_name, last_name, username, is_nil_brand || false, company_name || null]
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

    if (filters.is_nil_brand !== undefined) {
      query += ` AND op.is_nil_brand = $${paramCount}`;
      values.push(filters.is_nil_brand);
      paramCount++;
    }
    if (filters.searchTerm) {
      query += ` AND (op.first_name ILIKE $${paramCount} OR op.last_name ILIKE $${paramCount} OR op.username ILIKE $${paramCount} OR op.company_name ILIKE $${paramCount})`;
      values.push(`%${filters.searchTerm}%`);
      paramCount++;
    }

    query += ' ORDER BY op.created_at DESC LIMIT 50';
    const result = await pool.query(query, values);
    return result.rows;
  }
}

module.exports = OtherProfile;
