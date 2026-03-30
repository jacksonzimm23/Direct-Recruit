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

  // Update quote content for a share (only owner can update)
  static async updateShareQuote(shareId, userId, quoteContent, mediaUrls = null, mediaType = null) {
    const result = await pool.query(
      `UPDATE post_shares
       SET quote_content = $1,
           media_urls = COALESCE($4, media_urls),
           media_type = COALESCE($5, media_type)
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [quoteContent, shareId, userId, mediaUrls, mediaType]
    );
    return result.rows[0];
  }

  // Get a share (repost or quote) by its share ID with full details
  static async getShareById(shareId, currentUserId = null) {
    const result = await pool.query(
      `SELECT
        ps.id as share_id,
        ps.share_type,
        ps.quote_content,
        ps.media_urls as quote_media_urls,
        ps.media_type as quote_media_type,
        ps.created_at as share_created_at,
        ps.original_post_id,
        -- Share's own engagement counts (for quote posts)
        COALESCE(ps.likes_count, 0) as share_likes_count,
        COALESCE(ps.comments_count, 0) as share_comments_count,
        COALESCE(ps.shares_count, 0) as share_shares_count,
        COALESCE(ps.saves_count, 0) as share_saves_count,
        p.id,
        p.content,
        p.media_urls,
        p.media_type::text as media_type,
        p.visibility::text as visibility,
        -- Original post's engagement counts
        p.likes_count as original_likes_count,
        p.comments_count as original_comments_count,
        p.shares_count as original_shares_count,
        p.saves_count as original_saves_count,
        p.created_at as original_created_at,
        ps.created_at as sort_date,
        CASE WHEN ps.share_type = 'repost' THEN true ELSE false END as is_repost,
        CASE WHEN ps.share_type = 'quote' THEN true ELSE false END as is_quote,
        -- Quoter/Reposter info
        qu.id as quoter_user_id,
        qu.role::text as quoter_role,
        COALESCE(qpp.username, qcp.username, qop.username) as quoter_username,
        COALESCE(qpp.first_name, qcp.first_name, qop.first_name) as quoter_first_name,
        COALESCE(qpp.last_name, qcp.last_name, qop.last_name) as quoter_last_name,
        COALESCE(qpp.profile_image_url, qcp.profile_image_url, qop.profile_picture_url) as quoter_image,
        COALESCE(qpp.position, qcp.position_title) as quoter_position,
        COALESCE(qpp.team_name, qcp.team_name) as quoter_school,
        qpp.graduation_year as quoter_grad_year,
        COALESCE(qpp.college_division, qcp.college_division) as quoter_division,
        qpp.transfer as quoter_transfer,
        qpp.height as quoter_height,
        qpp.weight as quoter_weight,
        qpp.eligibility as quoter_eligibility,
        qpp.star_rating as quoter_star_rating,
        COALESCE(qpp.state, qcp.state) as quoter_state,
        qop.subheader as quoter_subheader,
        -- Original author info
        ou.id as author_user_id,
        ou.role::text as author_role,
        COALESCE(opp.username, ocp.username, oop.username) as author_username,
        COALESCE(opp.first_name, ocp.first_name, oop.first_name) as author_first_name,
        COALESCE(opp.last_name, ocp.last_name, oop.last_name) as author_last_name,
        COALESCE(opp.profile_image_url, ocp.profile_image_url, oop.profile_picture_url) as author_image,
        COALESCE(opp.position, ocp.position_title) as author_position,
        COALESCE(opp.team_name, ocp.team_name) as author_school,
        opp.graduation_year as author_grad_year,
        COALESCE(opp.college_division, ocp.college_division) as author_division,
        opp.transfer as author_transfer,
        opp.height as author_height,
        opp.weight as author_weight,
        opp.eligibility as author_eligibility,
        opp.star_rating as author_star_rating,
        COALESCE(opp.state, ocp.state) as author_state,
        ocp.verified as author_verified,
        oop.subheader as author_subheader
        ${currentUserId ? `,
        -- User's engagement with the share itself (for quote posts)
        EXISTS(SELECT 1 FROM share_likes WHERE share_id = ps.id AND user_id = $2) as user_liked_share,
        EXISTS(SELECT 1 FROM share_saves WHERE share_id = ps.id AND user_id = $2) as user_saved_share,
        -- User's engagement with the original post
        EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $2) as user_liked,
        EXISTS(SELECT 1 FROM post_saves WHERE post_id = p.id AND user_id = $2) as user_saved,
        EXISTS(SELECT 1 FROM post_shares WHERE original_post_id = p.id AND user_id = $2 AND share_type = 'repost') as user_reposted,
        EXISTS(SELECT 1 FROM follows WHERE follower_id = $2 AND following_id = p.user_id) as is_following` : ''}
      FROM post_shares ps
      JOIN posts p ON ps.original_post_id = p.id
      JOIN users qu ON ps.user_id = qu.id
      LEFT JOIN player_profiles qpp ON qu.id = qpp.user_id
      LEFT JOIN coach_profiles qcp ON qu.id = qcp.user_id
      LEFT JOIN other_profiles qop ON qu.id = qop.user_id
      JOIN users ou ON p.user_id = ou.id
      LEFT JOIN player_profiles opp ON ou.id = opp.user_id
      LEFT JOIN coach_profiles ocp ON ou.id = ocp.user_id
      LEFT JOIN other_profiles oop ON ou.id = oop.user_id
      WHERE ps.id = $1`,
      currentUserId ? [shareId, currentUserId] : [shareId]
    );
    return result.rows[0];
  }

  static async getById(postId, currentUserId = null) {
    const result = await pool.query(
      `SELECT p.*,
              u.id as author_user_id,
              u.role as author_role,
              COALESCE(pp.username, cp.username, op.username) as author_username,
              COALESCE(pp.first_name, cp.first_name, op.first_name) as author_first_name,
              COALESCE(pp.last_name, cp.last_name, op.last_name) as author_last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as author_image,
              COALESCE(pp.position, cp.position_title) as author_position,
              COALESCE(pp.team_name, cp.team_name) as author_school,
              pp.graduation_year as author_grad_year,
              pp.star_rating as author_star_rating,
              COALESCE(pp.college_division, cp.college_division) as author_division,
              pp.transfer as author_transfer,
              pp.height as author_height,
              pp.weight as author_weight,
              pp.eligibility as author_eligibility,
              COALESCE(pp.state, cp.state) as author_state,
              cp.verified as author_verified,
              op.subheader as author_subheader,
              ${currentUserId ? `EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $2) as user_liked,` : ''}
              ${currentUserId ? `EXISTS(SELECT 1 FROM post_saves WHERE post_id = p.id AND user_id = $2) as user_saved,` : ''}
              ${currentUserId ? `EXISTS(SELECT 1 FROM follows WHERE follower_id = $2 AND following_id = p.user_id) as is_following` : 'false as is_following'}
       FROM posts p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       LEFT JOIN other_profiles op ON u.id = op.user_id
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
    // Soft delete - archive content to deleted_content column, then mark as deleted
    const result = await pool.query(
      `UPDATE posts
       SET is_deleted = true,
           deleted_content = jsonb_build_object(
             'content', content,
             'media_urls', media_urls,
             'media_type', media_type,
             'deleted_at', NOW()
           )
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [postId, userId]
    );
    return result.rows[0];
  }

  // ==================== FEED QUERIES (Option 4: Two-Section Feed) ====================

  // Get posts from people you follow (Your Network feed)
  // Includes original posts AND reposts/quote posts from followed users
  static async getFollowingFeed(userId, limit = 20, offset = 0) {
    const result = await pool.query(
      `WITH feed_posts AS (
        -- Original posts from people you follow (or yourself)
        SELECT
          p.id,
          p.user_id,
          p.content,
          p.media_urls,
          p.media_type::text as media_type,
          p.visibility::text as visibility,
          p.likes_count,
          p.comments_count,
          p.shares_count,
          p.created_at,
          p.created_at as sort_date,
          false as is_repost,
          false as is_quote,
          NULL::uuid as share_id,
          NULL::text as quote_content,
          NULL::text[] as quote_media_urls,
          NULL::text as quote_media_type,
          NULL::uuid as original_post_id,
          NULL::text as original_content,
          NULL::text[] as original_media_urls,
          NULL::text as original_media_type,
          NULL::timestamptz as original_created_at,
          NULL::uuid as reposter_user_id,
          NULL::text as reposter_first_name,
          NULL::text as reposter_last_name,
          NULL::text as reposter_image,
          NULL::text as reposter_role,
          NULL::text as reposter_username,
          NULL::text as reposter_division,
          NULL::text as reposter_transfer,
          NULL::text as reposter_position,
          NULL::text as reposter_school,
          NULL::text as reposter_state,
          NULL::integer as reposter_grad_year,
          NULL::text as reposter_subheader,
          u.id as author_user_id,
          u.role::text as author_role,
          COALESCE(pp.username, cp.username, op.username) as author_username,
          COALESCE(pp.first_name, cp.first_name, op.first_name) as author_first_name,
          COALESCE(pp.last_name, cp.last_name, op.last_name) as author_last_name,
          COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as author_image,
          COALESCE(pp.position, cp.position_title) as author_position,
          COALESCE(pp.team_name, cp.team_name) as author_school,
          pp.graduation_year as author_grad_year,
          COALESCE(pp.college_division, cp.college_division) as author_division,
          pp.transfer as author_transfer,
          pp.height as author_height,
          pp.weight as author_weight,
          pp.eligibility as author_eligibility,
          pp.star_rating as author_star_rating,
          COALESCE(pp.state, cp.state) as author_state,
          cp.verified as author_verified,
          op.subheader as author_subheader
        FROM posts p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN player_profiles pp ON u.id = pp.user_id
        LEFT JOIN coach_profiles cp ON u.id = cp.user_id
        LEFT JOIN other_profiles op ON u.id = op.user_id
        WHERE (
          p.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1)
          OR p.user_id = $1
        )
        AND p.visibility IN ('public', 'followers_only')
        AND (p.is_deleted = false OR p.is_deleted IS NULL)

        UNION ALL

        -- Reposts and quote posts from people you follow
        SELECT
          p.id,
          p.user_id,
          p.content,
          p.media_urls,
          p.media_type::text as media_type,
          p.visibility::text as visibility,
          -- For quote posts, use the share's engagement counts; for reposts, use the original post's counts
          CASE WHEN ps.share_type = 'quote' THEN COALESCE(ps.likes_count, 0) ELSE p.likes_count END as likes_count,
          CASE WHEN ps.share_type = 'quote' THEN COALESCE(ps.comments_count, 0) ELSE p.comments_count END as comments_count,
          CASE WHEN ps.share_type = 'quote' THEN COALESCE(ps.shares_count, 0) ELSE p.shares_count END as shares_count,
          p.created_at as created_at,
          ps.created_at as sort_date,
          CASE WHEN ps.share_type = 'repost' THEN true ELSE false END as is_repost,
          CASE WHEN ps.share_type = 'quote' THEN true ELSE false END as is_quote,
          ps.id as share_id,
          ps.quote_content,
          ps.media_urls as quote_media_urls,
          ps.media_type as quote_media_type,
          p.id as original_post_id,
          p.content as original_content,
          p.media_urls as original_media_urls,
          p.media_type::text as original_media_type,
          p.created_at as original_created_at,
          ru.id as reposter_user_id,
          COALESCE(rpp.first_name, rcp.first_name, rop.first_name) as reposter_first_name,
          COALESCE(rpp.last_name, rcp.last_name, rop.last_name) as reposter_last_name,
          COALESCE(rpp.profile_image_url, rcp.profile_image_url, rop.profile_picture_url) as reposter_image,
          ru.role::text as reposter_role,
          COALESCE(rpp.username, rcp.username, rop.username) as reposter_username,
          COALESCE(rpp.college_division, rcp.college_division) as reposter_division,
          rpp.transfer as reposter_transfer,
          COALESCE(rpp.position, rcp.position_title) as reposter_position,
          COALESCE(rpp.team_name, rcp.team_name) as reposter_school,
          COALESCE(rpp.state, rcp.state) as reposter_state,
          rpp.graduation_year as reposter_grad_year,
          rop.subheader as reposter_subheader,
          ou.id as author_user_id,
          ou.role::text as author_role,
          COALESCE(opp.username, ocp.username, oop.username) as author_username,
          COALESCE(opp.first_name, ocp.first_name, oop.first_name) as author_first_name,
          COALESCE(opp.last_name, ocp.last_name, oop.last_name) as author_last_name,
          COALESCE(opp.profile_image_url, ocp.profile_image_url, oop.profile_picture_url) as author_image,
          COALESCE(opp.position, ocp.position_title) as author_position,
          COALESCE(opp.team_name, ocp.team_name) as author_school,
          opp.graduation_year as author_grad_year,
          COALESCE(opp.college_division, ocp.college_division) as author_division,
          opp.transfer as author_transfer,
          opp.height as author_height,
          opp.weight as author_weight,
          opp.eligibility as author_eligibility,
          opp.star_rating as author_star_rating,
          COALESCE(opp.state, ocp.state) as author_state,
          ocp.verified as author_verified,
          oop.subheader as author_subheader
        FROM post_shares ps
        JOIN posts p ON ps.original_post_id = p.id
        JOIN users ru ON ps.user_id = ru.id
        LEFT JOIN player_profiles rpp ON ru.id = rpp.user_id
        LEFT JOIN coach_profiles rcp ON ru.id = rcp.user_id
        LEFT JOIN other_profiles rop ON ru.id = rop.user_id
        JOIN users ou ON p.user_id = ou.id
        LEFT JOIN player_profiles opp ON ou.id = opp.user_id
        LEFT JOIN coach_profiles ocp ON ou.id = ocp.user_id
        LEFT JOIN other_profiles oop ON ou.id = oop.user_id
        WHERE ps.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1)
        AND ps.user_id != $1
        AND (p.is_deleted = false OR p.is_deleted IS NULL)
      )
      SELECT fp.*,
             -- For quote posts, check share_likes; for regular posts/reposts, check post_likes
             CASE WHEN fp.is_quote THEN
               EXISTS(SELECT 1 FROM share_likes WHERE share_id = fp.share_id AND user_id = $1)
             ELSE
               EXISTS(SELECT 1 FROM post_likes WHERE post_id = fp.id AND user_id = $1)
             END as user_liked,
             -- For quote posts, check share_saves; for regular posts/reposts, check post_saves
             CASE WHEN fp.is_quote THEN
               EXISTS(SELECT 1 FROM share_saves WHERE share_id = fp.share_id AND user_id = $1)
             ELSE
               EXISTS(SELECT 1 FROM post_saves WHERE post_id = fp.id AND user_id = $1)
             END as user_saved,
             EXISTS(SELECT 1 FROM post_shares WHERE original_post_id = fp.id AND user_id = $1 AND share_type = 'repost') as user_reposted,
             true as is_following
      FROM feed_posts fp
      ORDER BY fp.sort_date DESC
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  // Get discover feed (all public posts ranked by engagement)
  // Includes posts from everyone (followed and not followed), sorted by engagement_score
  static async getDiscoverFeed(userId, limit = 20, offset = 0) {
    const result = await pool.query(
      `WITH discover_posts AS (
        -- All public posts from everyone
        SELECT
          p.id,
          p.user_id,
          p.content,
          p.media_urls,
          p.media_type::text as media_type,
          p.visibility::text as visibility,
          p.likes_count,
          p.comments_count,
          p.shares_count,
          p.engagement_score,
          p.created_at,
          p.created_at as sort_date,
          false as is_repost,
          false as is_quote,
          NULL::uuid as share_id,
          NULL::text as quote_content,
          NULL::text[] as quote_media_urls,
          NULL::text as quote_media_type,
          NULL::uuid as original_post_id,
          NULL::text as original_content,
          NULL::text[] as original_media_urls,
          NULL::text as original_media_type,
          NULL::timestamptz as original_created_at,
          NULL::uuid as reposter_user_id,
          NULL::text as reposter_first_name,
          NULL::text as reposter_last_name,
          NULL::text as reposter_image,
          NULL::text as reposter_role,
          NULL::text as reposter_username,
          NULL::text as reposter_division,
          NULL::text as reposter_transfer,
          NULL::text as reposter_position,
          NULL::text as reposter_school,
          NULL::text as reposter_state,
          NULL::integer as reposter_grad_year,
          NULL::text as reposter_subheader,
          u.id as author_user_id,
          u.role::text as author_role,
          COALESCE(pp.username, cp.username, op.username) as author_username,
          COALESCE(pp.first_name, cp.first_name, op.first_name) as author_first_name,
          COALESCE(pp.last_name, cp.last_name, op.last_name) as author_last_name,
          COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as author_image,
          COALESCE(pp.position, cp.position_title) as author_position,
          COALESCE(pp.team_name, cp.team_name) as author_school,
          pp.graduation_year as author_grad_year,
          COALESCE(pp.college_division, cp.college_division) as author_division,
          pp.transfer as author_transfer,
          pp.height as author_height,
          pp.weight as author_weight,
          pp.eligibility as author_eligibility,
          pp.star_rating as author_star_rating,
          COALESCE(pp.state, cp.state) as author_state,
          cp.verified as author_verified,
          op.subheader as author_subheader
        FROM posts p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN player_profiles pp ON u.id = pp.user_id
        LEFT JOIN coach_profiles cp ON u.id = cp.user_id
        LEFT JOIN other_profiles op ON u.id = op.user_id
        WHERE p.visibility = 'public'
        AND (p.is_deleted = false OR p.is_deleted IS NULL)

        UNION ALL

        -- All reposts and quote posts
        SELECT
          p.id,
          p.user_id,
          p.content,
          p.media_urls,
          p.media_type::text as media_type,
          p.visibility::text as visibility,
          -- For quote posts, use the share's engagement counts; for reposts, use the original post's counts
          CASE WHEN ps.share_type = 'quote' THEN COALESCE(ps.likes_count, 0) ELSE p.likes_count END as likes_count,
          CASE WHEN ps.share_type = 'quote' THEN COALESCE(ps.comments_count, 0) ELSE p.comments_count END as comments_count,
          CASE WHEN ps.share_type = 'quote' THEN COALESCE(ps.shares_count, 0) ELSE p.shares_count END as shares_count,
          p.engagement_score,
          p.created_at as created_at,
          ps.created_at as sort_date,
          CASE WHEN ps.share_type = 'repost' THEN true ELSE false END as is_repost,
          CASE WHEN ps.share_type = 'quote' THEN true ELSE false END as is_quote,
          ps.id as share_id,
          ps.quote_content,
          ps.media_urls as quote_media_urls,
          ps.media_type as quote_media_type,
          p.id as original_post_id,
          p.content as original_content,
          p.media_urls as original_media_urls,
          p.media_type::text as original_media_type,
          p.created_at as original_created_at,
          ru.id as reposter_user_id,
          COALESCE(rpp.first_name, rcp.first_name, rop.first_name) as reposter_first_name,
          COALESCE(rpp.last_name, rcp.last_name, rop.last_name) as reposter_last_name,
          COALESCE(rpp.profile_image_url, rcp.profile_image_url, rop.profile_picture_url) as reposter_image,
          ru.role::text as reposter_role,
          COALESCE(rpp.username, rcp.username, rop.username) as reposter_username,
          COALESCE(rpp.college_division, rcp.college_division) as reposter_division,
          rpp.transfer as reposter_transfer,
          COALESCE(rpp.position, rcp.position_title) as reposter_position,
          COALESCE(rpp.team_name, rcp.team_name) as reposter_school,
          COALESCE(rpp.state, rcp.state) as reposter_state,
          rpp.graduation_year as reposter_grad_year,
          rop.subheader as reposter_subheader,
          ou.id as author_user_id,
          ou.role::text as author_role,
          COALESCE(opp.username, ocp.username, oop.username) as author_username,
          COALESCE(opp.first_name, ocp.first_name, oop.first_name) as author_first_name,
          COALESCE(opp.last_name, ocp.last_name, oop.last_name) as author_last_name,
          COALESCE(opp.profile_image_url, ocp.profile_image_url, oop.profile_picture_url) as author_image,
          COALESCE(opp.position, ocp.position_title) as author_position,
          COALESCE(opp.team_name, ocp.team_name) as author_school,
          opp.graduation_year as author_grad_year,
          COALESCE(opp.college_division, ocp.college_division) as author_division,
          opp.transfer as author_transfer,
          opp.height as author_height,
          opp.weight as author_weight,
          opp.eligibility as author_eligibility,
          opp.star_rating as author_star_rating,
          COALESCE(opp.state, ocp.state) as author_state,
          ocp.verified as author_verified,
          oop.subheader as author_subheader
        FROM post_shares ps
        JOIN posts p ON ps.original_post_id = p.id
        JOIN users ru ON ps.user_id = ru.id
        LEFT JOIN player_profiles rpp ON ru.id = rpp.user_id
        LEFT JOIN coach_profiles rcp ON ru.id = rcp.user_id
        LEFT JOIN other_profiles rop ON ru.id = rop.user_id
        JOIN users ou ON p.user_id = ou.id
        LEFT JOIN player_profiles opp ON ou.id = opp.user_id
        LEFT JOIN coach_profiles ocp ON ou.id = ocp.user_id
        LEFT JOIN other_profiles oop ON ou.id = oop.user_id
        WHERE p.visibility = 'public'
        AND (p.is_deleted = false OR p.is_deleted IS NULL)
      )
      SELECT dp.*,
             -- For quote posts, check share_likes; for regular posts/reposts, check post_likes
             CASE WHEN dp.is_quote THEN
               EXISTS(SELECT 1 FROM share_likes WHERE share_id = dp.share_id AND user_id = $1)
             ELSE
               EXISTS(SELECT 1 FROM post_likes WHERE post_id = dp.id AND user_id = $1)
             END as user_liked,
             -- For quote posts, check share_saves; for regular posts/reposts, check post_saves
             CASE WHEN dp.is_quote THEN
               EXISTS(SELECT 1 FROM share_saves WHERE share_id = dp.share_id AND user_id = $1)
             ELSE
               EXISTS(SELECT 1 FROM post_saves WHERE post_id = dp.id AND user_id = $1)
             END as user_saved,
             EXISTS(SELECT 1 FROM post_shares WHERE original_post_id = dp.id AND user_id = $1 AND share_type = 'repost') as user_reposted,
             EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = dp.user_id) as is_following
      FROM discover_posts dp
      ORDER BY dp.engagement_score DESC NULLS LAST, dp.sort_date DESC
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
              COALESCE(pp.username, cp.username, op.username) as author_username,
              COALESCE(pp.first_name, cp.first_name, op.first_name) as author_first_name,
              COALESCE(pp.last_name, cp.last_name, op.last_name) as author_last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as author_image,
              COALESCE(pp.position, cp.position_title) as author_position,
              COALESCE(pp.team_name, cp.team_name) as author_school,
              pp.graduation_year as author_grad_year,
              pp.star_rating as author_star_rating,
              COALESCE(pp.college_division, cp.college_division) as author_division,
              pp.transfer as author_transfer,
              pp.height as author_height,
              pp.weight as author_weight,
              pp.eligibility as author_eligibility,
              COALESCE(pp.state, cp.state) as author_state,
              cp.verified as author_verified,
              op.subheader as author_subheader,
              ${currentUserId ? `EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $3) as user_liked,` : 'false as user_liked,'}
              ${currentUserId ? `EXISTS(SELECT 1 FROM post_saves WHERE post_id = p.id AND user_id = $3) as user_saved` : 'false as user_saved'}
       FROM posts p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       LEFT JOIN other_profiles op ON u.id = op.user_id
       WHERE p.user_id = $1
       AND (p.is_deleted = false OR p.is_deleted IS NULL)
       ORDER BY p.is_pinned DESC NULLS LAST, p.created_at DESC
       LIMIT $2 ${currentUserId ? 'OFFSET $4' : 'OFFSET $3'}`,
      currentUserId ? [userId, limit, currentUserId, offset] : [userId, limit, offset]
    );
    return result.rows;
  }

  // Get user's posts combined with their reposts and quote posts (for profile Posts tab)
  static async getUserPostsWithReposts(userId, currentUserId = null, limit = 20, offset = 0) {
    // Use a UNION query to combine original posts and reposts/quotes
    // Cast all enum types to text for UNION compatibility
    const result = await pool.query(
      `WITH combined_posts AS (
        -- Original posts by user
        SELECT
          p.id,
          p.user_id,
          p.content,
          p.media_urls,
          p.media_type::text as media_type,
          p.visibility::text as visibility,
          p.likes_count,
          p.comments_count,
          p.shares_count,
          p.is_pinned,
          p.is_deleted,
          p.created_at,
          p.created_at as sort_date,
          false as is_repost,
          false as is_quote,
          NULL::uuid as share_id,
          NULL::text as quote_content,
          NULL::text[] as quote_media_urls,
          NULL::text as quote_media_type,
          NULL::uuid as original_post_id,
          NULL::text as original_content,
          NULL::text[] as original_media_urls,
          NULL::text as original_media_type,
          NULL::integer as original_likes_count,
          NULL::integer as original_comments_count,
          NULL::integer as original_shares_count,
          NULL::timestamptz as original_created_at,
          NULL::uuid as original_author_user_id,
          NULL::text as original_author_role,
          NULL::text as original_author_username,
          NULL::text as original_author_first_name,
          NULL::text as original_author_last_name,
          NULL::text as original_author_image,
          NULL::text as original_author_position,
          NULL::text as original_author_school,
          NULL::integer as original_author_grad_year,
          NULL::numeric as original_author_star_rating,
          NULL::text as original_author_division,
          NULL::text as original_author_transfer,
          NULL::text as original_author_height,
          NULL::integer as original_author_weight,
          NULL::integer as original_author_eligibility,
          NULL::text as original_author_state,
          NULL::boolean as original_author_verified,
          NULL::text as original_author_subheader,
          u.id as author_user_id,
          u.role::text as author_role,
          COALESCE(pp.username, cp.username, op.username) as author_username,
          COALESCE(pp.first_name, cp.first_name, op.first_name) as author_first_name,
          COALESCE(pp.last_name, cp.last_name, op.last_name) as author_last_name,
          COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as author_image,
          COALESCE(pp.position, cp.position_title) as author_position,
          COALESCE(pp.team_name, cp.team_name) as author_school,
          pp.graduation_year as author_grad_year,
          pp.star_rating as author_star_rating,
          COALESCE(pp.college_division, cp.college_division) as author_division,
          pp.transfer as author_transfer,
          pp.height as author_height,
          pp.weight as author_weight,
          pp.eligibility as author_eligibility,
          COALESCE(pp.state, cp.state) as author_state,
          cp.verified as author_verified,
          op.subheader as author_subheader
        FROM posts p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN player_profiles pp ON u.id = pp.user_id
        LEFT JOIN coach_profiles cp ON u.id = cp.user_id
        LEFT JOIN other_profiles op ON u.id = op.user_id
        WHERE p.user_id = $1
        AND (p.is_deleted = false OR p.is_deleted IS NULL)

        UNION ALL

        -- Reposts and quote posts by user
        SELECT
          ps.original_post_id as id,
          ps.user_id,
          NULL::text as content,
          NULL::text[] as media_urls,
          NULL::text as media_type,
          'public'::text as visibility,
          -- For quote posts, use the share's engagement counts; for reposts, use the original post's counts
          CASE WHEN ps.share_type = 'quote' THEN COALESCE(ps.likes_count, 0) ELSE p.likes_count END as likes_count,
          CASE WHEN ps.share_type = 'quote' THEN COALESCE(ps.comments_count, 0) ELSE p.comments_count END as comments_count,
          CASE WHEN ps.share_type = 'quote' THEN COALESCE(ps.shares_count, 0) ELSE p.shares_count END as shares_count,
          false as is_pinned,
          false as is_deleted,
          ps.created_at,
          ps.created_at as sort_date,
          CASE WHEN ps.share_type = 'repost' THEN true ELSE false END as is_repost,
          CASE WHEN ps.share_type = 'quote' THEN true ELSE false END as is_quote,
          ps.id as share_id,
          ps.quote_content,
          ps.media_urls as quote_media_urls,
          ps.media_type as quote_media_type,
          p.id as original_post_id,
          p.content as original_content,
          p.media_urls as original_media_urls,
          p.media_type::text as original_media_type,
          p.likes_count as original_likes_count,
          p.comments_count as original_comments_count,
          p.shares_count as original_shares_count,
          p.created_at as original_created_at,
          ou.id as original_author_user_id,
          ou.role::text as original_author_role,
          COALESCE(opp.username, ocp.username, oop.username) as original_author_username,
          COALESCE(opp.first_name, ocp.first_name, oop.first_name) as original_author_first_name,
          COALESCE(opp.last_name, ocp.last_name, oop.last_name) as original_author_last_name,
          COALESCE(opp.profile_image_url, ocp.profile_image_url, oop.profile_picture_url) as original_author_image,
          COALESCE(opp.position, ocp.position_title) as original_author_position,
          COALESCE(opp.team_name, ocp.team_name) as original_author_school,
          opp.graduation_year as original_author_grad_year,
          opp.star_rating as original_author_star_rating,
          COALESCE(opp.college_division, ocp.college_division) as original_author_division,
          opp.transfer as original_author_transfer,
          opp.height as original_author_height,
          opp.weight as original_author_weight,
          opp.eligibility as original_author_eligibility,
          COALESCE(opp.state, ocp.state) as original_author_state,
          ocp.verified as original_author_verified,
          oop.subheader as original_author_subheader,
          qu.id as author_user_id,
          qu.role::text as author_role,
          COALESCE(qpp.username, qcp.username, qop.username) as author_username,
          COALESCE(qpp.first_name, qcp.first_name, qop.first_name) as author_first_name,
          COALESCE(qpp.last_name, qcp.last_name, qop.last_name) as author_last_name,
          COALESCE(qpp.profile_image_url, qcp.profile_image_url, qop.profile_picture_url) as author_image,
          COALESCE(qpp.position, qcp.position_title) as author_position,
          COALESCE(qpp.team_name, qcp.team_name) as author_school,
          qpp.graduation_year as author_grad_year,
          qpp.star_rating as author_star_rating,
          COALESCE(qpp.college_division, qcp.college_division) as author_division,
          qpp.transfer as author_transfer,
          qpp.height as author_height,
          qpp.weight as author_weight,
          qpp.eligibility as author_eligibility,
          COALESCE(qpp.state, qcp.state) as author_state,
          qcp.verified as author_verified,
          qop.subheader as author_subheader
        FROM post_shares ps
        JOIN posts p ON ps.original_post_id = p.id
        JOIN users ou ON p.user_id = ou.id
        LEFT JOIN player_profiles opp ON ou.id = opp.user_id
        LEFT JOIN coach_profiles ocp ON ou.id = ocp.user_id
        LEFT JOIN other_profiles oop ON ou.id = oop.user_id
        JOIN users qu ON ps.user_id = qu.id
        LEFT JOIN player_profiles qpp ON qu.id = qpp.user_id
        LEFT JOIN coach_profiles qcp ON qu.id = qcp.user_id
        LEFT JOIN other_profiles qop ON qu.id = qop.user_id
        WHERE ps.user_id = $1
        AND (p.is_deleted = false OR p.is_deleted IS NULL)
      )
      SELECT cp.*,
             -- For quote posts, check share_likes; for regular posts/reposts, check post_likes
             ${currentUserId ? `CASE WHEN cp.is_quote THEN EXISTS(SELECT 1 FROM share_likes WHERE share_id = cp.share_id AND user_id = $3) ELSE EXISTS(SELECT 1 FROM post_likes WHERE post_id = cp.id AND user_id = $3) END as user_liked,` : 'false as user_liked,'}
             -- For quote posts, check share_saves; for regular posts/reposts, check post_saves
             ${currentUserId ? `CASE WHEN cp.is_quote THEN EXISTS(SELECT 1 FROM share_saves WHERE share_id = cp.share_id AND user_id = $3) ELSE EXISTS(SELECT 1 FROM post_saves WHERE post_id = cp.id AND user_id = $3) END as user_saved,` : 'false as user_saved,'}
             ${currentUserId ? `EXISTS(SELECT 1 FROM post_shares WHERE original_post_id = cp.id AND user_id = $3 AND share_type = 'repost') as user_reposted` : 'false as user_reposted'}
      FROM combined_posts cp
      ORDER BY cp.is_pinned DESC NULLS LAST, cp.sort_date DESC
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
              COALESCE(pp.first_name, cp.first_name, op.first_name) as first_name,
              COALESCE(pp.last_name, cp.last_name, op.last_name) as last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as profile_image_url,
              pl.created_at as liked_at
       FROM post_likes pl
       JOIN users u ON pl.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       LEFT JOIN other_profiles op ON u.id = op.user_id
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
              COALESCE(pp.username, cp.username, op.username) as author_username,
              u.role as author_role,
              COALESCE(pp.first_name, cp.first_name, op.first_name) as author_first_name,
              COALESCE(pp.last_name, cp.last_name, op.last_name) as author_last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as author_image,
              COALESCE(pp.position, cp.position_title) as author_position,
              COALESCE(pp.team_name, cp.team_name) as author_school,
              COALESCE(pp.college_division, cp.college_division) as author_division,
              pp.transfer as author_transfer,
              pp.height as author_height,
              pp.weight as author_weight,
              pp.graduation_year as author_grad_year,
              pp.eligibility as author_eligibility,
              COALESCE(pp.state, cp.state) as author_state,
              op.subheader as author_subheader,
              ${currentUserId ? `EXISTS(SELECT 1 FROM comment_likes WHERE comment_id = c.id AND user_id = $4) as user_liked` : 'false as user_liked'}
       FROM post_comments c
       JOIN users u ON c.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       LEFT JOIN other_profiles op ON u.id = op.user_id
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
              COALESCE(pp.username, cp.username, op.username) as author_username,
              u.role as author_role,
              COALESCE(pp.first_name, cp.first_name, op.first_name) as author_first_name,
              COALESCE(pp.last_name, cp.last_name, op.last_name) as author_last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as author_image
       FROM post_comments c
       JOIN users u ON c.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       LEFT JOIN other_profiles op ON u.id = op.user_id
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

      // Soft delete - mark as deleted and clear content
      const result = await client.query(
        `UPDATE post_comments
         SET is_deleted = true,
             content = '[deleted]'
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
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

  static async updateComment(commentId, userId, content) {
    const result = await pool.query(
      `UPDATE post_comments
       SET content = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3 AND (is_deleted = false OR is_deleted IS NULL)
       RETURNING *`,
      [content, commentId, userId]
    );
    return result.rows[0];
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
              COALESCE(pp.username, cp.username, op.username) as author_username,
              COALESCE(pp.first_name, cp.first_name, op.first_name) as author_first_name,
              COALESCE(pp.last_name, cp.last_name, op.last_name) as author_last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as author_image,
              COALESCE(pp.position, cp.position_title) as author_position,
              COALESCE(pp.team_name, cp.team_name) as author_school,
              cp.verified as author_verified,
              op.subheader as author_subheader,
              EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $1) as user_liked,
              true as user_saved,
              ps.created_at as saved_at
       FROM post_saves ps
       JOIN posts p ON ps.post_id = p.id
       JOIN users u ON p.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       LEFT JOIN other_profiles op ON u.id = op.user_id
       WHERE ps.user_id = $1
       ORDER BY ps.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  // Get posts that a user has liked (includes both regular post likes and quote post likes)
  static async getLikedPosts(userId, currentUserId = null, limit = 20, offset = 0) {
    const result = await pool.query(
      `WITH liked_items AS (
        -- Liked regular posts
        SELECT
          p.id,
          p.user_id,
          p.content,
          p.media_urls,
          p.media_type::text as media_type,
          p.likes_count,
          p.comments_count,
          p.shares_count,
          p.created_at,
          false as is_quote,
          NULL::uuid as share_id,
          NULL::text as quote_content,
          NULL::text[] as quote_media_urls,
          NULL::text as quote_media_type,
          NULL::uuid as original_post_id,
          NULL::text as original_content,
          NULL::text[] as original_media_urls,
          NULL::text as original_media_type,
          NULL::timestamptz as original_created_at,
          NULL::uuid as original_author_user_id,
          NULL::text as original_author_role,
          NULL::text as original_author_username,
          NULL::text as original_author_first_name,
          NULL::text as original_author_last_name,
          NULL::text as original_author_image,
          NULL::text as original_author_position,
          NULL::text as original_author_school,
          NULL::integer as original_author_grad_year,
          NULL::numeric as original_author_star_rating,
          NULL::text as original_author_division,
          NULL::text as original_author_transfer,
          NULL::text as original_author_height,
          NULL::integer as original_author_weight,
          NULL::integer as original_author_eligibility,
          NULL::text as original_author_state,
          NULL::boolean as original_author_verified,
          NULL::text as original_author_subheader,
          u.id as author_user_id,
          u.role::text as author_role,
          COALESCE(pp.username, cp.username, op.username) as author_username,
          COALESCE(pp.first_name, cp.first_name, op.first_name) as author_first_name,
          COALESCE(pp.last_name, cp.last_name, op.last_name) as author_last_name,
          COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as author_image,
          COALESCE(pp.position, cp.position_title) as author_position,
          COALESCE(pp.team_name, cp.team_name) as author_school,
          pp.graduation_year as author_grad_year,
          pp.state as author_state,
          cp.verified as author_verified,
          COALESCE(pp.college_division, cp.college_division) as author_division,
          pp.transfer as author_transfer,
          pp.eligibility as author_eligibility,
          pp.height as author_height,
          pp.weight as author_weight,
          pp.star_rating as author_star_rating,
          op.subheader as author_subheader,
          pl.created_at as liked_at
        FROM post_likes pl
        JOIN posts p ON pl.post_id = p.id
        JOIN users u ON p.user_id = u.id
        LEFT JOIN player_profiles pp ON u.id = pp.user_id
        LEFT JOIN coach_profiles cp ON u.id = cp.user_id
        LEFT JOIN other_profiles op ON u.id = op.user_id
        WHERE pl.user_id = $1
        AND (p.is_deleted = false OR p.is_deleted IS NULL)

        UNION ALL

        -- Liked quote posts
        SELECT
          ps.original_post_id as id,
          ps.user_id,
          NULL::text as content,
          NULL::text[] as media_urls,
          NULL::text as media_type,
          COALESCE(ps.likes_count, 0) as likes_count,
          COALESCE(ps.comments_count, 0) as comments_count,
          COALESCE(ps.shares_count, 0) as shares_count,
          ps.created_at,
          true as is_quote,
          ps.id as share_id,
          ps.quote_content,
          ps.media_urls as quote_media_urls,
          ps.media_type as quote_media_type,
          p.id as original_post_id,
          p.content as original_content,
          p.media_urls as original_media_urls,
          p.media_type::text as original_media_type,
          p.created_at as original_created_at,
          ou.id as original_author_user_id,
          ou.role::text as original_author_role,
          COALESCE(opp.username, ocp.username, oop.username) as original_author_username,
          COALESCE(opp.first_name, ocp.first_name, oop.first_name) as original_author_first_name,
          COALESCE(opp.last_name, ocp.last_name, oop.last_name) as original_author_last_name,
          COALESCE(opp.profile_image_url, ocp.profile_image_url, oop.profile_picture_url) as original_author_image,
          COALESCE(opp.position, ocp.position_title) as original_author_position,
          COALESCE(opp.team_name, ocp.team_name) as original_author_school,
          opp.graduation_year as original_author_grad_year,
          opp.star_rating as original_author_star_rating,
          COALESCE(opp.college_division, ocp.college_division) as original_author_division,
          opp.transfer as original_author_transfer,
          opp.height as original_author_height,
          opp.weight as original_author_weight,
          opp.eligibility as original_author_eligibility,
          COALESCE(opp.state, ocp.state) as original_author_state,
          ocp.verified as original_author_verified,
          oop.subheader as original_author_subheader,
          qu.id as author_user_id,
          qu.role::text as author_role,
          COALESCE(qpp.username, qcp.username, qop.username) as author_username,
          COALESCE(qpp.first_name, qcp.first_name, qop.first_name) as author_first_name,
          COALESCE(qpp.last_name, qcp.last_name, qop.last_name) as author_last_name,
          COALESCE(qpp.profile_image_url, qcp.profile_image_url, qop.profile_picture_url) as author_image,
          COALESCE(qpp.position, qcp.position_title) as author_position,
          COALESCE(qpp.team_name, qcp.team_name) as author_school,
          qpp.graduation_year as author_grad_year,
          COALESCE(qpp.state, qcp.state) as author_state,
          qcp.verified as author_verified,
          COALESCE(qpp.college_division, qcp.college_division) as author_division,
          qpp.transfer as author_transfer,
          qpp.eligibility as author_eligibility,
          qpp.height as author_height,
          qpp.weight as author_weight,
          qpp.star_rating as author_star_rating,
          qop.subheader as author_subheader,
          sl.created_at as liked_at
        FROM share_likes sl
        JOIN post_shares ps ON sl.share_id = ps.id
        JOIN posts p ON ps.original_post_id = p.id
        JOIN users ou ON p.user_id = ou.id
        LEFT JOIN player_profiles opp ON ou.id = opp.user_id
        LEFT JOIN coach_profiles ocp ON ou.id = ocp.user_id
        LEFT JOIN other_profiles oop ON ou.id = oop.user_id
        JOIN users qu ON ps.user_id = qu.id
        LEFT JOIN player_profiles qpp ON qu.id = qpp.user_id
        LEFT JOIN coach_profiles qcp ON qu.id = qcp.user_id
        LEFT JOIN other_profiles qop ON qu.id = qop.user_id
        WHERE sl.user_id = $1
        AND ps.share_type = 'quote'
        AND (p.is_deleted = false OR p.is_deleted IS NULL)
      )
      SELECT li.*,
             true as user_liked,
             -- For quote posts, check share_saves; for regular posts, check post_saves
             ${currentUserId ? `CASE WHEN li.is_quote THEN EXISTS(SELECT 1 FROM share_saves WHERE share_id = li.share_id AND user_id = $3) ELSE EXISTS(SELECT 1 FROM post_saves WHERE post_id = li.id AND user_id = $3) END as user_saved` : 'false as user_saved'}
      FROM liked_items li
      ORDER BY li.liked_at DESC
      LIMIT $2 ${currentUserId ? 'OFFSET $4' : 'OFFSET $3'}`,
      currentUserId ? [userId, limit, currentUserId, offset] : [userId, limit, offset]
    );
    return result.rows;
  }

  // ==================== SHARES ====================

  static async sharePost(originalPostId, userId, shareType = 'repost', quoteContent = null, mediaUrls = null, mediaType = null) {
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
        `INSERT INTO post_shares (original_post_id, user_id, share_type, quote_content, media_urls, media_type)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [originalPostId, userId, shareType, quoteContent, mediaUrls, mediaType]
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
              COALESCE(pp.first_name, cp.first_name, op.first_name) as first_name,
              COALESCE(pp.last_name, cp.last_name, op.last_name) as last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as profile_image_url,
              COALESCE(pp.position, cp.position_title) as position,
              COALESCE(pp.team_name, cp.team_name) as school
       FROM post_shares ps
       JOIN users u ON ps.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       LEFT JOIN other_profiles op ON u.id = op.user_id
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
              ps.media_urls as quote_media_urls,
              ps.media_type as quote_media_type,
              p.id as original_post_id,
              p.content as original_content,
              p.media_urls as original_media_urls,
              p.media_type as original_media_type,
              p.likes_count,
              p.comments_count,
              p.shares_count,
              p.created_at as original_created_at,
              -- Alias fields for createPostElement compatibility (simple reposts)
              p.content as content,
              p.media_urls as media_urls,
              p.media_type as media_type,
              p.user_id as user_id,
              p.visibility as visibility,
              u.id as author_user_id,
              u.role as author_role,
              COALESCE(pp.username, cp.username, op.username) as author_username,
              COALESCE(pp.first_name, cp.first_name, op.first_name) as author_first_name,
              COALESCE(pp.last_name, cp.last_name, op.last_name) as author_last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as author_image,
              COALESCE(pp.position, cp.position_title) as author_position,
              COALESCE(pp.team_name, cp.team_name) as author_school,
              pp.graduation_year as author_grad_year,
              pp.star_rating as author_star_rating,
              COALESCE(pp.college_division, cp.college_division) as author_division,
              pp.transfer as author_transfer,
              pp.height as author_height,
              pp.weight as author_weight,
              pp.eligibility as author_eligibility,
              COALESCE(pp.state, cp.state) as author_state,
              cp.verified as author_verified,
              op.subheader as author_subheader,
              EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $1) as user_liked,
              EXISTS(SELECT 1 FROM post_saves WHERE post_id = p.id AND user_id = $1) as user_saved,
              CASE WHEN ps.share_type = 'repost' THEN true ELSE false END as user_reposted,
              true as is_repost,
              qu.id as quoter_user_id,
              COALESCE(qpp.first_name, qcp.first_name, qop.first_name) as quoter_first_name,
              COALESCE(qpp.last_name, qcp.last_name, qop.last_name) as quoter_last_name,
              COALESCE(qpp.profile_image_url, qcp.profile_image_url, qop.profile_picture_url) as quoter_image,
              qu.role as quoter_role
       FROM post_shares ps
       JOIN posts p ON ps.original_post_id = p.id
       JOIN users u ON p.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       LEFT JOIN other_profiles op ON u.id = op.user_id
       JOIN users qu ON ps.user_id = qu.id
       LEFT JOIN player_profiles qpp ON qu.id = qpp.user_id
       LEFT JOIN coach_profiles qcp ON qu.id = qcp.user_id
       LEFT JOIN other_profiles qop ON qu.id = qop.user_id
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

  // ==================== USER REPLIES ====================

  // Get all comments/replies made by a user (for profile Replies tab)
  static async getUserReplies(userId, currentUserId = null, limit = 10, offset = 0) {
    const result = await pool.query(
      `SELECT c.*,
              c.created_at as reply_created_at,
              u.id as author_user_id,
              u.role as author_role,
              COALESCE(pp.username, cp.username, op.username) as author_username,
              COALESCE(pp.first_name, cp.first_name, op.first_name) as author_first_name,
              COALESCE(pp.last_name, cp.last_name, op.last_name) as author_last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as author_image,
              COALESCE(pp.position, cp.position_title) as author_position,
              COALESCE(pp.team_name, cp.team_name) as author_school,
              pp.graduation_year as author_grad_year,
              pp.star_rating as author_star_rating,
              COALESCE(pp.college_division, cp.college_division) as author_division,
              pp.transfer as author_transfer,
              pp.height as author_height,
              pp.weight as author_weight,
              pp.eligibility as author_eligibility,
              COALESCE(pp.state, cp.state) as author_state,
              cp.verified as author_verified,
              op.subheader as author_subheader,
              -- Original post info
              p.id as original_post_id,
              p.content as original_post_content,
              p.created_at as original_post_created_at,
              -- Original post author info
              op_u.id as original_author_user_id,
              op_u.role as original_author_role,
              COALESCE(op_pp.username, op_cp.username, op_op.username) as original_author_username,
              COALESCE(op_pp.first_name, op_cp.first_name, op_op.first_name) as original_author_first_name,
              COALESCE(op_pp.last_name, op_cp.last_name, op_op.last_name) as original_author_last_name,
              COALESCE(op_pp.profile_image_url, op_cp.profile_image_url, op_op.profile_picture_url) as original_author_image,
              ${currentUserId ? `EXISTS(SELECT 1 FROM comment_likes WHERE comment_id = c.id AND user_id = $3) as user_liked` : 'false as user_liked'}
       FROM post_comments c
       JOIN users u ON c.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       LEFT JOIN other_profiles op ON u.id = op.user_id
       JOIN posts p ON c.post_id = p.id
       JOIN users op_u ON p.user_id = op_u.id
       LEFT JOIN player_profiles op_pp ON op_u.id = op_pp.user_id
       LEFT JOIN coach_profiles op_cp ON op_u.id = op_cp.user_id
       LEFT JOIN other_profiles op_op ON op_u.id = op_op.user_id
       WHERE c.user_id = $1
       AND (c.is_deleted = false OR c.is_deleted IS NULL)
       AND (p.is_deleted = false OR p.is_deleted IS NULL)
       ORDER BY c.created_at DESC
       LIMIT $2 ${currentUserId ? 'OFFSET $4' : 'OFFSET $3'}`,
      currentUserId ? [userId, limit, currentUserId, offset] : [userId, limit, offset]
    );
    return result.rows;
  }

  // ==================== UTILITY ====================

  static async getPostCount(userId) {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM posts WHERE user_id = $1',
      [userId]
    );
    return parseInt(result.rows[0].count);
  }

  // Get count of new posts since a given timestamp (for "New posts available" button)
  static async getNewPostsCount(userId, sinceDate, feedType = 'discover') {
    let query;

    let params;

    if (feedType === 'discover') {
      // Count new posts in Discover feed (all public posts)
      query = `
        SELECT COUNT(*) as count FROM (
          -- New original posts
          SELECT p.id FROM posts p
          WHERE p.visibility = 'public'
          AND (p.is_deleted = false OR p.is_deleted IS NULL)
          AND p.created_at > $1

          UNION ALL

          -- New reposts/quotes
          SELECT ps.id FROM post_shares ps
          JOIN posts p ON ps.original_post_id = p.id
          WHERE p.visibility = 'public'
          AND (p.is_deleted = false OR p.is_deleted IS NULL)
          AND ps.created_at > $1
        ) new_posts
      `;
      params = [sinceDate];
    } else {
      // Count new posts in Following feed (posts from followed users + own posts)
      query = `
        SELECT COUNT(*) as count FROM (
          -- New original posts from followed users or self
          SELECT p.id FROM posts p
          WHERE (
            p.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1)
            OR p.user_id = $1
          )
          AND p.visibility IN ('public', 'followers_only')
          AND (p.is_deleted = false OR p.is_deleted IS NULL)
          AND p.created_at > $2

          UNION ALL

          -- New reposts/quotes from followed users
          SELECT ps.id FROM post_shares ps
          JOIN posts p ON ps.original_post_id = p.id
          WHERE ps.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1)
          AND ps.user_id != $1
          AND (p.is_deleted = false OR p.is_deleted IS NULL)
          AND ps.created_at > $2
        ) new_posts
      `;
      params = [userId, sinceDate];
    }

    const result = await pool.query(query, params);
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

  // ==================== SHARE ENGAGEMENT ====================

  // Like a share (quote post)
  static async likeShare(shareId, userId) {
    const result = await pool.query(
      'INSERT INTO share_likes (share_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
      [shareId, userId]
    );
    if (result.rows[0]) {
      await pool.query(
        'UPDATE post_shares SET likes_count = likes_count + 1 WHERE id = $1',
        [shareId]
      );
    }
    return result.rows[0];
  }

  // Unlike a share (quote post)
  static async unlikeShare(shareId, userId) {
    const result = await pool.query(
      'DELETE FROM share_likes WHERE share_id = $1 AND user_id = $2 RETURNING *',
      [shareId, userId]
    );
    if (result.rows[0]) {
      await pool.query(
        'UPDATE post_shares SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = $1',
        [shareId]
      );
    }
    return result.rows[0];
  }

  // Get likes for a share
  static async getShareLikes(shareId, limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT
        sl.user_id,
        sl.created_at,
        u.role::text as role,
        COALESCE(pp.first_name, cp.first_name, op.first_name) as first_name,
        COALESCE(pp.last_name, cp.last_name, op.last_name) as last_name,
        COALESCE(pp.username, cp.username, op.username) as username,
        COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as profile_image,
        COALESCE(pp.college_division, cp.college_division) as division,
        pp.transfer
       FROM share_likes sl
       JOIN users u ON sl.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       LEFT JOIN other_profiles op ON u.id = op.user_id
       WHERE sl.share_id = $1
       ORDER BY sl.created_at DESC
       LIMIT $2 OFFSET $3`,
      [shareId, limit, offset]
    );
    return result.rows;
  }

  // Save a share (quote post)
  static async saveShare(shareId, userId) {
    const result = await pool.query(
      'INSERT INTO share_saves (share_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
      [shareId, userId]
    );
    if (result.rows[0]) {
      await pool.query(
        'UPDATE post_shares SET saves_count = saves_count + 1 WHERE id = $1',
        [shareId]
      );
    }
    return result.rows[0];
  }

  // Unsave a share (quote post)
  static async unsaveShare(shareId, userId) {
    const result = await pool.query(
      'DELETE FROM share_saves WHERE share_id = $1 AND user_id = $2 RETURNING *',
      [shareId, userId]
    );
    if (result.rows[0]) {
      await pool.query(
        'UPDATE post_shares SET saves_count = GREATEST(saves_count - 1, 0) WHERE id = $1',
        [shareId]
      );
    }
    return result.rows[0];
  }

  // Add comment to a share (quote post)
  static async addShareComment(shareId, userId, content, parentCommentId = null) {
    const result = await pool.query(
      `INSERT INTO share_comments (share_id, user_id, content, parent_comment_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [shareId, userId, content, parentCommentId]
    );
    if (result.rows[0]) {
      await pool.query(
        'UPDATE post_shares SET comments_count = comments_count + 1 WHERE id = $1',
        [shareId]
      );
    }
    return result.rows[0];
  }

  // Get comments for a share
  static async getShareComments(shareId, limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT
        c.id,
        c.content,
        c.created_at,
        c.likes_count,
        c.parent_comment_id,
        c.user_id,
        u.role::text as role,
        COALESCE(pp.first_name, cp.first_name, op.first_name) as first_name,
        COALESCE(pp.last_name, cp.last_name, op.last_name) as last_name,
        COALESCE(pp.username, cp.username, op.username) as username,
        COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as profile_image,
        COALESCE(pp.college_division, cp.college_division) as division,
        pp.transfer,
        COALESCE(pp.position, cp.position_title) as position,
        COALESCE(pp.team_name, cp.team_name) as team_name,
        pp.height,
        pp.weight,
        pp.graduation_year as grad_year,
        pp.eligibility,
        COALESCE(pp.state, cp.state) as state,
        op.subheader
       FROM share_comments c
       JOIN users u ON c.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       LEFT JOIN other_profiles op ON u.id = op.user_id
       WHERE c.share_id = $1 AND c.parent_comment_id IS NULL
       ORDER BY c.created_at ASC
       LIMIT $2 OFFSET $3`,
      [shareId, limit, offset]
    );
    return result.rows;
  }

  // Delete a share comment
  static async deleteShareComment(commentId, userId) {
    const result = await pool.query(
      `DELETE FROM share_comments
       WHERE id = $1 AND user_id = $2
       RETURNING share_id`,
      [commentId, userId]
    );
    if (result.rows[0]) {
      await pool.query(
        'UPDATE post_shares SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = $1',
        [result.rows[0].share_id]
      );
    }
    return result.rows[0];
  }

  // Like a share comment
  static async likeShareComment(commentId, userId) {
    const result = await pool.query(
      'INSERT INTO share_comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
      [commentId, userId]
    );
    if (result.rows[0]) {
      await pool.query(
        'UPDATE share_comments SET likes_count = likes_count + 1 WHERE id = $1',
        [commentId]
      );
    }
    return result.rows[0];
  }

  // Unlike a share comment
  static async unlikeShareComment(commentId, userId) {
    const result = await pool.query(
      'DELETE FROM share_comment_likes WHERE comment_id = $1 AND user_id = $2 RETURNING *',
      [commentId, userId]
    );
    if (result.rows[0]) {
      await pool.query(
        'UPDATE share_comments SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = $1',
        [commentId]
      );
    }
    return result.rows[0];
  }

  // Check if user liked a share
  static async hasUserLikedShare(shareId, userId) {
    const result = await pool.query(
      'SELECT 1 FROM share_likes WHERE share_id = $1 AND user_id = $2',
      [shareId, userId]
    );
    return result.rows.length > 0;
  }

  // Check if user saved a share
  static async hasUserSavedShare(shareId, userId) {
    const result = await pool.query(
      'SELECT 1 FROM share_saves WHERE share_id = $1 AND user_id = $2',
      [shareId, userId]
    );
    return result.rows.length > 0;
  }
}

module.exports = Post;
