const pool = require('../config/database');

class CoachProfile {
  static async create(userId, profileData) {
    const {
      first_name, last_name, username, college_name, college_division,
      position_title, city, state, phone, bio, conference
    } = profileData;

    const result = await pool.query(
      `INSERT INTO coach_profiles
      (user_id, first_name, last_name, username, college_name, college_division,
       position_title, city, state, phone, bio, conference)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [userId, first_name, last_name, username, college_name, college_division,
       position_title, city, state, phone, bio, conference]
    );
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await pool.query('SELECT * FROM coach_profiles WHERE user_id = $1', [userId]);
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
    const query = `UPDATE coach_profiles SET ${fields.join(', ')} WHERE user_id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async search(filters) {
    let query = 'SELECT cp.*, u.email FROM coach_profiles cp JOIN users u ON cp.user_id = u.id WHERE u.is_active = true';
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
      query += ` AND (cp.first_name ILIKE $${paramCount} OR cp.last_name ILIKE $${paramCount} OR cp.username ILIKE $${paramCount} OR cp.college_name ILIKE $${paramCount})`;
      values.push(`%${filters.searchTerm}%`);
      paramCount++;
    }

    query += ' ORDER BY cp.verified DESC, cp.created_at DESC LIMIT 50';
    const result = await pool.query(query, values);
    return result.rows;
  }

  static async findByUsername(username) {
    const result = await pool.query('SELECT cp.*, u.email, u.role FROM coach_profiles cp JOIN users u ON cp.user_id = u.id WHERE cp.username = $1', [username]);
    return result.rows[0];
  }
}

module.exports = CoachProfile;
