const pool = require('../config/database');

class User {
  // Create user (now without password - Cognito handles auth)
  static async create({ email, role, cognitoSub }) {
    const result = await pool.query(
      'INSERT INTO users (email, role, cognito_sub) VALUES ($1, $2, $3) RETURNING id, email, role, created_at',
      [email, role, cognitoSub]
    );
    return result.rows[0];
  }

  static async findByEmail(email) {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query('SELECT id, email, username, role, created_at, email_verified, profile_completed, is_active FROM users WHERE id = $1', [id]);
    return result.rows[0];
  }

  static async findByCognitoSub(cognitoSub) {
    const result = await pool.query('SELECT * FROM users WHERE cognito_sub = $1', [cognitoSub]);
    return result.rows[0];
  }

  static async findByUsername(username) {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return result.rows[0];
  }

  static async updateUsername(userId, username) {
    const result = await pool.query(
      'UPDATE users SET username = $1 WHERE id = $2 RETURNING *',
      [username, userId]
    );
    return result.rows[0];
  }

  static async updateCognitoSub(userId, cognitoSub) {
    await pool.query('UPDATE users SET cognito_sub = $1 WHERE id = $2', [cognitoSub, userId]);
  }

  static async updateLastLogin(userId) {
    await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [userId]);
  }

  static async markProfileCompleted(userId) {
    await pool.query('UPDATE users SET profile_completed = true WHERE id = $1', [userId]);
  }

  static async markEmailVerified(userId) {
    await pool.query('UPDATE users SET email_verified = true WHERE id = $1', [userId]);
  }

  static async updateEmail(userId, newEmail) {
    const result = await pool.query(
      'UPDATE users SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, email, role',
      [newEmail, userId]
    );
    return result.rows[0];
  }
}

module.exports = User;
