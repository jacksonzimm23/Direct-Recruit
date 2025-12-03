const pool = require('../config/database');

class Follow {
  static async follow(followerId, followingId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) RETURNING *',
        [followerId, followingId]
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async unfollow(followerId, followingId) {
    const result = await pool.query(
      'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 RETURNING *',
      [followerId, followingId]
    );
    return result.rows[0];
  }

  static async getFollowers(userId, limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT u.id, u.email, u.role,
              COALESCE(pp.first_name, cp.first_name) as first_name,
              COALESCE(pp.last_name, cp.last_name) as last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url) as profile_image_url,
              f.created_at as followed_at
       FROM follows f
       JOIN users u ON f.follower_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       WHERE f.following_id = $1
       ORDER BY f.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  static async getFollowing(userId, limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT u.id, u.email, u.role,
              COALESCE(pp.first_name, cp.first_name) as first_name,
              COALESCE(pp.last_name, cp.last_name) as last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url) as profile_image_url,
              f.created_at as followed_at
       FROM follows f
       JOIN users u ON f.following_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       WHERE f.follower_id = $1
       ORDER BY f.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  static async isFollowing(followerId, followingId) {
    const result = await pool.query(
      'SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2',
      [followerId, followingId]
    );
    return result.rows.length > 0;
  }

  static async getFollowCounts(userId) {
    const result = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM follows WHERE follower_id = $1) as following_count,
        (SELECT COUNT(*) FROM follows WHERE following_id = $1) as followers_count`,
      [userId]
    );
    return result.rows[0];
  }
}

module.exports = Follow;
