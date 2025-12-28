const pool = require('../config/database');

class Post {
  // ==================== POST CRUD ====================

  static async create(userId, { content, media_urls, media_type, visibility = 'public' }) {
    const result = await pool.query(
      `INSERT INTO posts (user_id, content, media_urls, media_type, visibility)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, content, media_urls || null, media_type || null, visibility]
    );
    return result.rows[0];
  }

  static async getById(postId, currentUserId = null) {
    const result = await pool.query(
      `SELECT p.*,
              u.id as author_user_id,
              u.role as author_role,
              COALESCE(pp.username, cp.username) as author_username,
              COALESCE(pp.first_name, cp.first_name) as author_first_name,
              COALESCE(pp.last_name, cp.last_name) as author_last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url) as author_image,
              COALESCE(pp.position, cp.position_title) as author_position,
              COALESCE(pp.high_school, cp.college_name) as author_school,
              cp.verified as author_verified,
              ${currentUserId ? `EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $2) as user_liked,` : ''}
              ${currentUserId ? `EXISTS(SELECT 1 FROM post_saves WHERE post_id = p.id AND user_id = $2) as user_saved,` : ''}
              ${currentUserId ? `EXISTS(SELECT 1 FROM follows WHERE follower_id = $2 AND following_id = p.user_id) as is_following` : 'false as is_following'}
       FROM posts p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       WHERE p.id = $1`,
      currentUserId ? [postId, currentUserId] : [postId]
    );
    return result.rows[0];
  }

  static async update(postId, userId, { content, media_urls, media_type, visibility }) {
    const result = await pool.query(
      `UPDATE posts
       SET content = COALESCE($1, content),
           media_urls = COALESCE($2, media_urls),
           media_type = COALESCE($3, media_type),
           visibility = COALESCE($4, visibility)
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [content, media_urls, media_type, visibility, postId, userId]
    );
    return result.rows[0];
  }

  static async delete(postId, userId) {
    // Soft delete - mark as deleted but keep in database
    const result = await pool.query(
      'UPDATE posts SET is_deleted = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [postId, userId]
    );
    return result.rows[0];
  }

  // ==================== FEED QUERIES (Option 4: Two-Section Feed) ====================

  // Get posts from people you follow (Your Network feed)
  static async getFollowingFeed(userId, limit = 20, offset = 0) {
    const result = await pool.query(
      `SELECT p.*,
              u.id as author_user_id,
              u.role as author_role,
              COALESCE(pp.username, cp.username) as author_username,
              COALESCE(pp.first_name, cp.first_name) as author_first_name,
              COALESCE(pp.last_name, cp.last_name) as author_last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url) as author_image,
              COALESCE(pp.position, cp.position_title) as author_position,
              COALESCE(pp.high_school, cp.college_name) as author_school,
              pp.graduation_year as author_grad_year,
              COALESCE(pp.college_division, cp.college_division) as author_division,
              cp.verified as author_verified,
              EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $1) as user_liked,
              EXISTS(SELECT 1 FROM post_saves WHERE post_id = p.id AND user_id = $1) as user_saved,
              EXISTS(SELECT 1 FROM post_shares WHERE original_post_id = p.id AND user_id = $1 AND share_type = 'repost') as user_reposted,
              true as is_following
       FROM posts p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       WHERE (
         p.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1)
         OR p.user_id = $1
       )
       AND p.visibility IN ('public', 'followers_only')
       AND p.created_at > NOW() - INTERVAL '7 days'
       AND (p.is_deleted = false OR p.is_deleted IS NULL)
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  // Get discover feed (posts from people you don't follow, ranked by engagement)
  static async getDiscoverFeed(userId, limit = 20, offset = 0) {
    const result = await pool.query(
      `SELECT p.*,
              u.id as author_user_id,
              u.role as author_role,
              COALESCE(pp.username, cp.username) as author_username,
              COALESCE(pp.first_name, cp.first_name) as author_first_name,
              COALESCE(pp.last_name, cp.last_name) as author_last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url) as author_image,
              COALESCE(pp.position, cp.position_title) as author_position,
              COALESCE(pp.high_school, cp.college_name) as author_school,
              pp.graduation_year as author_grad_year,
              COALESCE(pp.college_division, cp.college_division) as author_division,
              cp.verified as author_verified,
              EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $1) as user_liked,
              EXISTS(SELECT 1 FROM post_saves WHERE post_id = p.id AND user_id = $1) as user_saved,
              EXISTS(SELECT 1 FROM post_shares WHERE original_post_id = p.id AND user_id = $1 AND share_type = 'repost') as user_reposted,
              false as is_following
       FROM posts p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       WHERE p.user_id NOT IN (SELECT following_id FROM follows WHERE follower_id = $1)
       AND p.user_id != $1
       AND p.visibility = 'public'
       AND (p.is_deleted = false OR p.is_deleted IS NULL)
       ORDER BY p.engagement_score DESC, p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  // Get combined feed (following first, then discover)
  static async getCombinedFeed(userId, limit = 20, offset = 0) {
    // Get following posts first
    const followingPosts = await this.getFollowingFeed(userId, Math.ceil(limit * 0.6), 0);

    // Get discover posts
    const discoverPosts = await this.getDiscoverFeed(userId, Math.ceil(limit * 0.4), 0);

    // Combine and mark source
    const combined = [
      ...followingPosts.map(p => ({ ...p, feed_source: 'following' })),
      ...discoverPosts.map(p => ({ ...p, feed_source: 'discover' }))
    ];

    return combined.slice(offset, offset + limit);
  }

  // Get user's own posts
  static async getUserPosts(userId, currentUserId = null, limit = 20, offset = 0) {
    const result = await pool.query(
      `SELECT p.*,
              u.id as author_user_id,
              u.role as author_role,
              COALESCE(pp.username, cp.username) as author_username,
              COALESCE(pp.first_name, cp.first_name) as author_first_name,
              COALESCE(pp.last_name, cp.last_name) as author_last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url) as author_image,
              COALESCE(pp.position, cp.position_title) as author_position,
              COALESCE(pp.high_school, cp.college_name) as author_school,
              cp.verified as author_verified,
              ${currentUserId ? `EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $3) as user_liked,` : 'false as user_liked,'}
              ${currentUserId ? `EXISTS(SELECT 1 FROM post_saves WHERE post_id = p.id AND user_id = $3) as user_saved` : 'false as user_saved'}
       FROM posts p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC
       LIMIT $2 ${currentUserId ? 'OFFSET $4' : 'OFFSET $3'}`,
      currentUserId ? [userId, limit, currentUserId, offset] : [userId, limit, offset]
    );
    return result.rows;
  }

  // ==================== LIKES ====================

  static async like(postId, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const likeResult = await client.query(
        'INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
        [postId, userId]
      );

      if (likeResult.rows[0]) {
        await client.query(
          'UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1',
          [postId]
        );
      }

      await client.query('COMMIT');
      return likeResult.rows[0];
    } catch (error) {
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
          'UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = $1',
          [postId]
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

  static async getLikes(postId, limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT u.id, u.username, u.role,
              COALESCE(pp.first_name, cp.first_name) as first_name,
              COALESCE(pp.last_name, cp.last_name) as last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url) as profile_image_url,
              pl.created_at as liked_at
       FROM post_likes pl
       JOIN users u ON pl.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       WHERE pl.post_id = $1
       ORDER BY pl.created_at DESC
       LIMIT $2 OFFSET $3`,
      [postId, limit, offset]
    );
    return result.rows;
  }

  // ==================== COMMENTS ====================

  static async addComment(postId, userId, content, parentCommentId = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO post_comments (post_id, user_id, content, parent_comment_id)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [postId, userId, content, parentCommentId]
      );

      await client.query(
        'UPDATE posts SET comments_count = comments_count + 1 WHERE id = $1',
        [postId]
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

  static async getComments(postId, currentUserId = null, limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT c.*,
              u.id as author_user_id,
              COALESCE(pp.username, cp.username) as author_username,
              u.role as author_role,
              COALESCE(pp.first_name, cp.first_name) as author_first_name,
              COALESCE(pp.last_name, cp.last_name) as author_last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url) as author_image,
              ${currentUserId ? `EXISTS(SELECT 1 FROM comment_likes WHERE comment_id = c.id AND user_id = $4) as user_liked` : 'false as user_liked'}
       FROM post_comments c
       JOIN users u ON c.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       WHERE c.post_id = $1 AND c.parent_comment_id IS NULL
       AND (c.is_deleted = false OR c.is_deleted IS NULL)
       ORDER BY c.created_at DESC
       LIMIT $2 OFFSET $3`,
      currentUserId ? [postId, limit, offset, currentUserId] : [postId, limit, offset]
    );
    return result.rows;
  }

  static async getCommentReplies(commentId, limit = 20, offset = 0) {
    const result = await pool.query(
      `SELECT c.*,
              u.id as author_user_id,
              COALESCE(pp.username, cp.username) as author_username,
              u.role as author_role,
              COALESCE(pp.first_name, cp.first_name) as author_first_name,
              COALESCE(pp.last_name, cp.last_name) as author_last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url) as author_image
       FROM post_comments c
       JOIN users u ON c.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       WHERE c.parent_comment_id = $1
       AND (c.is_deleted = false OR c.is_deleted IS NULL)
       ORDER BY c.created_at ASC
       LIMIT $2 OFFSET $3`,
      [commentId, limit, offset]
    );
    return result.rows;
  }

  static async deleteComment(commentId, userId, postId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Soft delete - mark as deleted but keep in database for records
      const result = await client.query(
        'UPDATE post_comments SET is_deleted = true WHERE id = $1 AND user_id = $2 RETURNING *',
        [commentId, userId]
      );

      if (result.rows[0]) {
        await client.query(
          'UPDATE posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = $1',
          [postId]
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

  // ==================== COMMENT LIKES ====================

  static async likeComment(commentId, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        'INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
        [commentId, userId]
      );

      if (result.rows[0]) {
        await client.query(
          'UPDATE post_comments SET likes_count = likes_count + 1 WHERE id = $1',
          [commentId]
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

  static async unlikeComment(commentId, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        'DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2 RETURNING *',
        [commentId, userId]
      );

      if (result.rows[0]) {
        await client.query(
          'UPDATE post_comments SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = $1',
          [commentId]
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

  // ==================== SAVES (BOOKMARKS) ====================

  static async savePost(postId, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        'INSERT INTO post_saves (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
        [postId, userId]
      );

      if (result.rows[0]) {
        await client.query(
          'UPDATE posts SET saves_count = saves_count + 1 WHERE id = $1',
          [postId]
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

  static async unsavePost(postId, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        'DELETE FROM post_saves WHERE post_id = $1 AND user_id = $2 RETURNING *',
        [postId, userId]
      );

      if (result.rows[0]) {
        await client.query(
          'UPDATE posts SET saves_count = GREATEST(saves_count - 1, 0) WHERE id = $1',
          [postId]
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

  static async getSavedPosts(userId, limit = 20, offset = 0) {
    const result = await pool.query(
      `SELECT p.*,
              u.id as author_user_id,
              u.role as author_role,
              COALESCE(pp.username, cp.username) as author_username,
              COALESCE(pp.first_name, cp.first_name) as author_first_name,
              COALESCE(pp.last_name, cp.last_name) as author_last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url) as author_image,
              COALESCE(pp.position, cp.position_title) as author_position,
              COALESCE(pp.high_school, cp.college_name) as author_school,
              cp.verified as author_verified,
              EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $1) as user_liked,
              true as user_saved,
              ps.created_at as saved_at
       FROM post_saves ps
       JOIN posts p ON ps.post_id = p.id
       JOIN users u ON p.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       WHERE ps.user_id = $1
       ORDER BY ps.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  // ==================== SHARES ====================

  static async sharePost(originalPostId, userId, shareType = 'repost', quoteContent = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if already reposted (for simple reposts)
      if (shareType === 'repost') {
        const existing = await client.query(
          'SELECT id FROM post_shares WHERE original_post_id = $1 AND user_id = $2 AND share_type = $3',
          [originalPostId, userId, 'repost']
        );
        if (existing.rows[0]) {
          await client.query('ROLLBACK');
          return { already_reposted: true, share_id: existing.rows[0].id };
        }
      }

      const result = await client.query(
        `INSERT INTO post_shares (original_post_id, user_id, share_type, quote_content)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [originalPostId, userId, shareType, quoteContent]
      );

      await client.query(
        'UPDATE posts SET shares_count = shares_count + 1 WHERE id = $1',
        [originalPostId]
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

  static async unsharePost(shareId, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        'DELETE FROM post_shares WHERE id = $1 AND user_id = $2 RETURNING *',
        [shareId, userId]
      );

      if (result.rows[0]) {
        await client.query(
          'UPDATE posts SET shares_count = GREATEST(shares_count - 1, 0) WHERE id = $1',
          [result.rows[0].original_post_id]
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

  // Unrepost by post ID (for toggle functionality)
  static async unrepostByPostId(postId, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        'DELETE FROM post_shares WHERE original_post_id = $1 AND user_id = $2 AND share_type = $3 RETURNING *',
        [postId, userId, 'repost']
      );

      if (result.rows[0]) {
        await client.query(
          'UPDATE posts SET shares_count = GREATEST(shares_count - 1, 0) WHERE id = $1',
          [postId]
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

  // Check if user has reposted
  static async hasUserReposted(postId, userId) {
    const result = await pool.query(
      'SELECT id FROM post_shares WHERE original_post_id = $1 AND user_id = $2 AND share_type = $3',
      [postId, userId, 'repost']
    );
    return result.rows[0] ? result.rows[0].id : null;
  }

  // Get shares for a post (reposts and quotes)
  static async getShares(postId, limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT ps.*,
              u.id as user_id,
              u.username,
              u.role,
              COALESCE(pp.first_name, cp.first_name) as first_name,
              COALESCE(pp.last_name, cp.last_name) as last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url) as profile_image_url,
              COALESCE(pp.position, cp.position_title) as position,
              COALESCE(pp.high_school, cp.college_name) as school
       FROM post_shares ps
       JOIN users u ON ps.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       WHERE ps.original_post_id = $1
       ORDER BY ps.created_at DESC
       LIMIT $2 OFFSET $3`,
      [postId, limit, offset]
    );

    // Separate reposts and quotes
    const reposts = result.rows.filter(s => s.share_type === 'repost');
    const quotes = result.rows.filter(s => s.share_type === 'quote');

    return {
      all: result.rows,
      reposts,
      quotes,
      repost_count: reposts.length,
      quote_count: quotes.length
    };
  }

  // Get user's reposts and quote posts for feed
  static async getUserReposts(userId, limit = 20, offset = 0) {
    const result = await pool.query(
      `SELECT ps.*, ps.created_at as reposted_at,
              ps.share_type,
              ps.quote_content,
              p.id as original_post_id,
              p.content as original_content,
              p.media_urls as original_media_urls,
              p.media_type as original_media_type,
              p.likes_count,
              p.comments_count,
              p.shares_count,
              p.created_at as original_created_at,
              u.id as author_user_id,
              u.role as author_role,
              COALESCE(pp.username, cp.username) as author_username,
              COALESCE(pp.first_name, cp.first_name) as author_first_name,
              COALESCE(pp.last_name, cp.last_name) as author_last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url) as author_image,
              COALESCE(pp.position, cp.position_title) as author_position,
              COALESCE(pp.high_school, cp.college_name) as author_school,
              pp.graduation_year as author_grad_year,
              COALESCE(pp.college_division, cp.college_division) as author_division,
              cp.verified as author_verified,
              EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $1) as user_liked,
              EXISTS(SELECT 1 FROM post_saves WHERE post_id = p.id AND user_id = $1) as user_saved,
              CASE WHEN ps.share_type = 'repost' THEN true ELSE false END as user_reposted,
              true as is_repost,
              qu.id as quoter_user_id,
              COALESCE(qpp.first_name, qcp.first_name) as quoter_first_name,
              COALESCE(qpp.last_name, qcp.last_name) as quoter_last_name,
              COALESCE(qpp.profile_image_url, qcp.profile_image_url) as quoter_image,
              qu.role as quoter_role
       FROM post_shares ps
       JOIN posts p ON ps.original_post_id = p.id
       JOIN users u ON p.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       JOIN users qu ON ps.user_id = qu.id
       LEFT JOIN player_profiles qpp ON qu.id = qpp.user_id
       LEFT JOIN coach_profiles qcp ON qu.id = qcp.user_id
       WHERE ps.user_id = $1 AND ps.share_type IN ('repost', 'quote')
       AND (p.is_deleted = false OR p.is_deleted IS NULL)
       ORDER BY ps.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  // ==================== PIN POST ====================

  static async pinPost(postId, userId) {
    // First unpin any existing pinned post
    await pool.query(
      'UPDATE posts SET is_pinned = false WHERE user_id = $1 AND is_pinned = true',
      [userId]
    );

    const result = await pool.query(
      'UPDATE posts SET is_pinned = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [postId, userId]
    );
    return result.rows[0];
  }

  static async unpinPost(postId, userId) {
    const result = await pool.query(
      'UPDATE posts SET is_pinned = false WHERE id = $1 AND user_id = $2 RETURNING *',
      [postId, userId]
    );
    return result.rows[0];
  }

  // ==================== UTILITY ====================

  static async getPostCount(userId) {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM posts WHERE user_id = $1',
      [userId]
    );
    return parseInt(result.rows[0].count);
  }

  // Recalculate engagement score manually (if needed)
  static async recalculateEngagementScore(postId) {
    const result = await pool.query(
      `UPDATE posts SET engagement_score = (
        (likes_count * 2.0) +
        (comments_count * 3.0) +
        (shares_count * 4.0) +
        (saves_count * 1.0)
      ) / POWER(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0 + 2, 1.5)
      WHERE id = $1
      RETURNING engagement_score`,
      [postId]
    );
    return result.rows[0]?.engagement_score;
  }
}

module.exports = Post;
