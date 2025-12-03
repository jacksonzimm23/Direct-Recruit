const pool = require('../config/database');
const redisClient = require('../config/redis');

class Post {
  static async create(userId, { content, media_url, media_type }) {
    const result = await pool.query(
      'INSERT INTO posts (user_id, content, media_url, media_type) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, content, media_url, media_type]
    );

    const post = result.rows[0];
    await this.invalidateUserFeedCache(userId);

    return post;
  }

  static async getById(postId) {
    const result = await pool.query(
      `SELECT p.*,
              COALESCE(pp.first_name, cp.first_name) as author_first_name,
              COALESCE(pp.last_name, cp.last_name) as author_last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url) as author_image,
              u.role as author_role
       FROM posts p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       WHERE p.id = $1`,
      [postId]
    );
    return result.rows[0];
  }

  static async update(postId, userId, { content, media_url, media_type }) {
    const result = await pool.query(
      'UPDATE posts SET content = $1, media_url = $2, media_type = $3 WHERE id = $4 AND user_id = $5 RETURNING *',
      [content, media_url, media_type, postId, userId]
    );

    if (result.rows[0]) {
      await this.invalidateUserFeedCache(userId);
    }

    return result.rows[0];
  }

  static async delete(postId, userId) {
    const result = await pool.query(
      'DELETE FROM posts WHERE id = $1 AND user_id = $2 RETURNING *',
      [postId, userId]
    );

    if (result.rows[0]) {
      await this.invalidateUserFeedCache(userId);
    }

    return result.rows[0];
  }

  static async getUserPosts(userId, limit = 20, offset = 0) {
    const result = await pool.query(
      `SELECT p.*,
              COALESCE(pp.first_name, cp.first_name) as author_first_name,
              COALESCE(pp.last_name, cp.last_name) as author_last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url) as author_image,
              u.role as author_role
       FROM posts p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  static async getFeed(userId, limit = 20, offset = 0) {
    const cacheKey = `feed:${userId}:${limit}:${offset}`;

    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      console.error('Redis get error:', err);
    }

    const result = await pool.query(
      `SELECT p.*,
              COALESCE(pp.first_name, cp.first_name) as author_first_name,
              COALESCE(pp.last_name, cp.last_name) as author_last_name,
              CONCAT(COALESCE(pp.first_name, cp.first_name, ''), ' ', COALESCE(pp.last_name, cp.last_name, '')) as author_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url) as author_image,
              u.role as author_role,
              EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $1) as user_liked
       FROM posts p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       WHERE p.user_id IN (
         SELECT following_id FROM follows WHERE follower_id = $1
         UNION
         SELECT $1
       )
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const posts = result.rows;

    try {
      await redisClient.setEx(cacheKey, 300, JSON.stringify(posts));
    } catch (err) {
      console.error('Redis set error:', err);
    }

    return posts;
  }

  static async like(postId, userId) {
    console.log('=== LIKE METHOD CALLED ===');
    console.log('postId:', postId);
    console.log('userId:', userId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      console.log('Transaction started');

      const likeResult = await client.query(
        'INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
        [postId, userId]
      );

      console.log('Like insert result:', likeResult.rows);
      console.log('Row count:', likeResult.rowCount);

      if (likeResult.rows[0]) {
        console.log('Like was inserted, updating post likes_count');
        await client.query(
          'UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1',
          [postId]
        );
        console.log('Post likes_count updated');
      } else {
        console.log('Like NOT inserted (already exists or conflict)');
      }

      await client.query('COMMIT');
      console.log('Transaction committed');

      // Invalidate feed cache for the user
      await this.invalidateUserFeedCache(userId);
      console.log('Cache invalidated');

      console.log('=== LIKE METHOD COMPLETE ===');
      return likeResult.rows[0];
    } catch (error) {
      console.error('=== LIKE METHOD ERROR ===');
      console.error('Error:', error);
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async unlike(postId, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        'DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2 RETURNING *',
        [postId, userId]
      );

      if (result.rows[0]) {
        await client.query(
          'UPDATE posts SET likes_count = likes_count - 1 WHERE id = $1',
          [postId]
        );
      }

      await client.query('COMMIT');

      // Invalidate feed cache for the user
      await this.invalidateUserFeedCache(userId);

      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async addComment(postId, userId, content) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        'INSERT INTO post_comments (post_id, user_id, content) VALUES ($1, $2, $3) RETURNING *',
        [postId, userId, content]
      );

      await client.query(
        'UPDATE posts SET comments_count = comments_count + 1 WHERE id = $1',
        [postId]
      );

      await client.query('COMMIT');

      // Invalidate feed cache for the user
      await this.invalidateUserFeedCache(userId);

      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getComments(postId, limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT c.*,
              COALESCE(pp.first_name, cp.first_name) as author_first_name,
              COALESCE(pp.last_name, cp.last_name) as author_last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url) as author_image,
              u.role as author_role
       FROM post_comments c
       JOIN users u ON c.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       WHERE c.post_id = $1
       ORDER BY c.created_at DESC
       LIMIT $2 OFFSET $3`,
      [postId, limit, offset]
    );
    return result.rows;
  }

  static async invalidateUserFeedCache(userId) {
    try {
      const keys = await redisClient.keys(`feed:${userId}:*`);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
    } catch (err) {
      console.error('Redis cache invalidation error:', err);
    }
  }
}

module.exports = Post;
