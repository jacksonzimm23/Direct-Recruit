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

      // Update following_count for the follower (in both player and coach profiles)
      await client.query(
        'UPDATE player_profiles SET following_count = following_count + 1 WHERE user_id = $1',
        [followerId]
      );
      await client.query(
        'UPDATE coach_profiles SET following_count = following_count + 1 WHERE user_id = $1',
        [followerId]
      );

      // Update followers_count for the user being followed (in both player and coach profiles)
      await client.query(
        'UPDATE player_profiles SET followers_count = followers_count + 1 WHERE user_id = $1',
        [followingId]
      );
      await client.query(
        'UPDATE coach_profiles SET followers_count = followers_count + 1 WHERE user_id = $1',
        [followingId]
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
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 RETURNING *',
        [followerId, followingId]
      );

      // Only update counts if a row was actually deleted
      if (result.rows.length > 0) {
        // Decrement following_count for the follower (in both player and coach profiles)
        await client.query(
          'UPDATE player_profiles SET following_count = GREATEST(following_count - 1, 0) WHERE user_id = $1',
          [followerId]
        );
        await client.query(
          'UPDATE coach_profiles SET following_count = GREATEST(following_count - 1, 0) WHERE user_id = $1',
          [followerId]
        );

        // Decrement followers_count for the user being unfollowed (in both player and coach profiles)
        await client.query(
          'UPDATE player_profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE user_id = $1',
          [followingId]
        );
        await client.query(
          'UPDATE coach_profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE user_id = $1',
          [followingId]
        );
      }

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
    // Try to get counts from player_profiles first
    let result = await pool.query(
      'SELECT followers_count, following_count FROM player_profiles WHERE user_id = $1',
      [userId]
    );

    // If not found in player_profiles, try coach_profiles
    if (result.rows.length === 0) {
      result = await pool.query(
        'SELECT followers_count, following_count FROM coach_profiles WHERE user_id = $1',
        [userId]
      );
    }

    // Return the counts or default to 0
    if (result.rows.length > 0) {
      return {
        followers_count: parseInt(result.rows[0].followers_count) || 0,
        following_count: parseInt(result.rows[0].following_count) || 0
      };
    }

    return { followers_count: 0, following_count: 0 };
  }
}

module.exports = Follow;
