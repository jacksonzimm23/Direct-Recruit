const pool = require('../config/database');

class PlayerProfile {
  static async create(userId, profileData) {
    const {
      first_name, last_name, username, date_of_birth, high_school, graduation_year,
      city, state, position, height, weight, gpa, sat_score, act_score,
      highlight_video_url, bio, hudl_profile, twitter_handle, instagram_handle, player_status,
      college_division
    } = profileData;

    const result = await pool.query(
      `INSERT INTO player_profiles
      (user_id, first_name, last_name, username, date_of_birth, high_school, graduation_year,
       city, state, position, height, weight, gpa, sat_score, act_score,
       highlight_video_url, bio, hudl_profile, twitter_handle, instagram_handle, player_status,
       college_division)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      RETURNING *`,
      [userId, first_name, last_name, username, date_of_birth, high_school, graduation_year,
       city, state, position, height, weight, gpa, sat_score, act_score,
       highlight_video_url, bio, hudl_profile, twitter_handle, instagram_handle, player_status,
       college_division]
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
}

module.exports = PlayerProfile;
