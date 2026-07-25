const pool = require('../config/database');

class Notification {
  // Create a new notification
  static async create({ userId, type, title, message, relatedUserId = null, relatedEntityId = null, relatedEntityType = null }) {
    const result = await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, related_user_id, related_entity_id, related_entity_type, is_read)
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
       RETURNING *`,
      [userId, type, title, message, relatedUserId, relatedEntityId, relatedEntityType]
    );
    return result.rows[0];
  }

  // Get notifications for a user with optional filtering
  static async getForUser(userId, { type = null, limit = 50, offset = 0 } = {}) {
    let query = `
      SELECT
        n.*,
        CASE
          WHEN u.role = 'player' THEN pp.first_name
          WHEN u.role = 'coach' THEN cp.first_name
          WHEN u.role = 'other' THEN op.first_name
        END as related_user_first_name,
        CASE
          WHEN u.role = 'player' THEN pp.last_name
          WHEN u.role = 'coach' THEN cp.last_name
          WHEN u.role = 'other' THEN op.last_name
        END as related_user_last_name,
        CASE
          WHEN u.role = 'player' THEN pp.username
          WHEN u.role = 'coach' THEN cp.username
          WHEN u.role = 'other' THEN op.username
        END as related_user_username,
        CASE
          WHEN u.role = 'player' THEN pp.profile_image_url
          WHEN u.role = 'coach' THEN cp.profile_image_url
          WHEN u.role = 'other' THEN op.profile_picture_url
        END as related_user_profile_image,
        CASE
          WHEN u.role = 'player' THEN pp.position
          WHEN u.role = 'coach' THEN cp.position_title
          WHEN u.role = 'other' THEN op.subheader
        END as related_user_position,
        CASE
          WHEN u.role = 'player' THEN pp.team_name
          WHEN u.role = 'coach' THEN cp.team_name
          ELSE NULL
        END as related_user_school,
        u.role as related_user_role,
        CASE
          WHEN u.role = 'player' THEN pp.college_division
          WHEN u.role = 'coach' THEN cp.college_division
          ELSE NULL
        END as related_user_college_division,
        CASE
          WHEN u.role = 'player' THEN pp.transfer
          ELSE NULL
        END as related_user_transfer
      FROM notifications n
      LEFT JOIN users u ON n.related_user_id = u.id
      LEFT JOIN player_profiles pp ON u.id = pp.user_id AND u.role = 'player'
      LEFT JOIN coach_profiles cp ON u.id = cp.user_id AND u.role = 'coach'
      LEFT JOIN other_profiles op ON u.id = op.user_id AND u.role = 'other'
      WHERE n.user_id = $1
        AND (n.related_entity_type IS NULL
             OR n.related_entity_type NOT IN ('group_invite', 'group_invite_editor'))
    `;

    const params = [userId];

    if (type) {
      params.push(type);
      query += ` AND n.type = $${params.length}`;
    }

    query += ` ORDER BY n.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  }

  // Get unread count for a user.
  // Excludes group_invite types — those are surfaced via a dedicated Invites
  // modal + their own badge counter, NOT the standard Notifications badge.
  static async getUnreadCount(userId, type = null) {
    let query = `SELECT COUNT(*) FROM notifications
                  WHERE user_id = $1
                    AND is_read = FALSE
                    AND (related_entity_type IS NULL
                         OR related_entity_type NOT IN ('group_invite', 'group_invite_editor'))`;
    const params = [userId];

    if (type) {
      params.push(type);
      query += ` AND type = $${params.length}`;
    }

    const result = await pool.query(query, params);
    return parseInt(result.rows[0].count);
  }

  // Get counts by type for a user
  static async getCountsByType(userId) {
    const result = await pool.query(
      `SELECT type, COUNT(*) as total,
              SUM(CASE WHEN is_read = FALSE THEN 1 ELSE 0 END) as unread
       FROM notifications
       WHERE user_id = $1
       GROUP BY type`,
      [userId]
    );

    const counts = {
      all: { total: 0, unread: 0 },
      'profile-view': { total: 0, unread: 0 },
      'message': { total: 0, unread: 0 },
      'follow': { total: 0, unread: 0 },
      'interaction': { total: 0, unread: 0 }
    };

    result.rows.forEach(row => {
      counts[row.type] = {
        total: parseInt(row.total),
        unread: parseInt(row.unread)
      };
      counts.all.total += parseInt(row.total);
      counts.all.unread += parseInt(row.unread);
    });

    return counts;
  }

  // Mark a single notification as read
  static async markAsRead(notificationId, userId) {
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [notificationId, userId]
    );
    return result.rows[0];
  }

  // Mark all notifications as read for a user
  static async markAllAsRead(userId, type = null) {
    let query = `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`;
    const params = [userId];

    if (type) {
      params.push(type);
      query += ` AND type = $${params.length}`;
    }

    query += ` RETURNING *`;

    const result = await pool.query(query, params);
    return result.rows.length;
  }

  // Delete a notification
  static async delete(notificationId, userId) {
    const result = await pool.query(
      `DELETE FROM notifications
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [notificationId, userId]
    );
    return result.rows[0];
  }

  // Delete all notifications for a user (optional: by type)
  static async deleteAll(userId, type = null) {
    let query = `DELETE FROM notifications WHERE user_id = $1`;
    const params = [userId];

    if (type) {
      params.push(type);
      query += ` AND type = $${params.length}`;
    }

    const result = await pool.query(query, params);
    return result.rowCount;
  }

  // Delete all notifications referencing a specific entity (e.g. when a post is deleted)
  static async deleteByEntityId(entityId) {
    const result = await pool.query(
      `DELETE FROM notifications WHERE related_entity_id = $1`,
      [entityId]
    );
    return result.rowCount;
  }

  // Check if a notification already exists (to prevent duplicates)
  static async exists({ userId, type, relatedUserId, relatedEntityId, title = null, withinHours = 24 }) {
    const result = await pool.query(
      `SELECT id FROM notifications
       WHERE user_id = $1
         AND type = $2
         AND ($3::uuid IS NULL OR related_user_id = $3)
         AND ($4::uuid IS NULL OR related_entity_id = $4)
         AND ($6::text IS NULL OR title = $6)
         AND created_at > NOW() - INTERVAL '1 hour' * $5::numeric
       LIMIT 1`,
      [userId, type, relatedUserId, relatedEntityId, withinHours, title]
    );
    return result.rows.length > 0;
  }

  // Create notification helper methods for specific types
  static async createProfileViewNotification(viewedUserId, viewerUserId, viewerName, viewerSchool) {
    // Don't notify if viewing own profile
    if (viewedUserId === viewerUserId) return null;

    // Check if notification already exists within last 24 hours
    const exists = await this.exists({
      userId: viewedUserId,
      type: 'profile-view',
      relatedUserId: viewerUserId,
      withinHours: 24
    });

    if (exists) return null;

    const schoolText = viewerSchool ? ` from ${viewerSchool}` : '';

    return this.create({
      userId: viewedUserId,
      type: 'profile-view',
      title: 'Profile View',
      message: `${viewerName}${schoolText} viewed your profile`,
      relatedUserId: viewerUserId
    });
  }

  static async createFollowNotification(followedUserId, followerUserId, followerName) {
    // Don't notify if following self (shouldn't happen but safety check)
    if (followedUserId === followerUserId) return null;

    return this.create({
      userId: followedUserId,
      type: 'follow',
      title: 'New Follower',
      message: `${followerName} started following you`,
      relatedUserId: followerUserId
    });
  }

  static async deleteFollowRequestNotification(targetUserId, requesterUserId) {
    const result = await pool.query(
      `DELETE FROM notifications
       WHERE user_id = $1
         AND related_user_id = $2
         AND title = 'Follow Request'`,
      [targetUserId, requesterUserId]
    );
    return result.rowCount > 0;
  }

  static async createFollowRequestNotification(targetUserId, requesterUserId, requesterName) {
    // Don't notify if requesting to follow self (shouldn't happen but safety check)
    if (targetUserId === requesterUserId) return null;

    // Security #35: dedup is enforced at the call site by the route, which
    // only invokes this method when sendFollowRequest reports a fresh INSERT
    // (vs. an ON CONFLICT UPDATE on a dupe-click resend). The previous
    // SELECT-then-INSERT pre-check ran outside any transaction and didn't
    // actually close the race.
    return this.create({
      userId: targetUserId,
      type: 'follow',
      title: 'Follow Request',
      message: `${requesterName} requested to follow you`,
      relatedUserId: requesterUserId
    });
  }

  static async createFollowRequestAcceptedNotification(requesterUserId, accepterUserId, accepterName) {
    // Don't notify if accepting own request (shouldn't happen but safety check)
    if (requesterUserId === accepterUserId) return null;

    return this.create({
      userId: requesterUserId,
      type: 'follow',
      title: 'Follow Request Accepted',
      message: `${accepterName} accepted your follow request`,
      relatedUserId: accepterUserId
    });
  }

  static async createMessageNotification(recipientUserId, senderUserId, senderName, messagePreview, conversationId) {
    // Don't notify if messaging self
    if (recipientUserId === senderUserId) return null;

    // Check if notification exists within last 5 minutes (to avoid spam for rapid messages)
    const exists = await this.exists({
      userId: recipientUserId,
      type: 'message',
      relatedUserId: senderUserId,
      withinHours: 0.083 // ~5 minutes
    });

    if (exists) return null;

    return this.create({
      userId: recipientUserId,
      type: 'message',
      title: 'New Message',
      message: `${senderName} sent you a message`,
      relatedUserId: senderUserId,
      relatedEntityId: conversationId,
      relatedEntityType: 'conversation'
    });
  }

  static async createLikeNotification(postOwnerId, likerUserId, likerName, postId) {
    // Don't notify if liking own post
    if (postOwnerId === likerUserId) return null;

    // Check if notification exists within last hour
    const exists = await this.exists({
      userId: postOwnerId,
      type: 'interaction',
      relatedUserId: likerUserId,
      relatedEntityId: postId,
      withinHours: 1
    });

    if (exists) return null;

    return this.create({
      userId: postOwnerId,
      type: 'interaction',
      title: 'Post Liked',
      message: `${likerName} liked your post`,
      relatedUserId: likerUserId,
      relatedEntityId: postId,
      relatedEntityType: 'post'
    });
  }

  static async createCommentNotification(postOwnerId, commenterUserId, commenterName, postId, commentPreview) {
    // Don't notify if commenting on own post
    if (postOwnerId === commenterUserId) return null;

    const preview = commentPreview.length > 50 ? commentPreview.substring(0, 50) + '...' : commentPreview;

    return this.create({
      userId: postOwnerId,
      type: 'interaction',
      title: 'New Comment',
      message: `${commenterName} commented on your post: "${preview}"`,
      relatedUserId: commenterUserId,
      relatedEntityId: postId,
      relatedEntityType: 'post'
    });
  }

  static async createShareNotification(postOwnerId, sharerUserId, sharerName, postId, shareType = 'repost') {
    // Don't notify if sharing own post
    if (postOwnerId === sharerUserId) return null;

    // Check if notification exists within last hour
    const exists = await this.exists({
      userId: postOwnerId,
      type: 'interaction',
      relatedUserId: sharerUserId,
      relatedEntityId: postId,
      withinHours: 1
    });

    if (exists) return null;

    const action = shareType === 'quote' ? 'quoted' : 'shared';

    return this.create({
      userId: postOwnerId,
      type: 'interaction',
      title: 'Post Shared',
      message: `${sharerName} ${action} your post`,
      relatedUserId: sharerUserId,
      relatedEntityId: postId,
      relatedEntityType: 'post'
    });
  }

  static async createCommentLikeNotification(commentOwnerId, likerUserId, likerName, commentId, postId) {
    // Don't notify if liking own comment
    if (commentOwnerId === likerUserId) return null;

    // Check if notification exists within last hour
    const exists = await this.exists({
      userId: commentOwnerId,
      type: 'interaction',
      relatedUserId: likerUserId,
      relatedEntityId: commentId,
      withinHours: 1
    });

    if (exists) return null;

    return this.create({
      userId: commentOwnerId,
      type: 'interaction',
      title: 'Comment Liked',
      message: `${likerName} liked your comment`,
      relatedUserId: likerUserId,
      relatedEntityId: postId,
      relatedEntityType: 'post'
    });
  }

  static async createCommentReplyNotification(commentOwnerId, replierUserId, replierName, postId, replyPreview) {
    // Don't notify if replying to own comment
    if (commentOwnerId === replierUserId) return null;

    const preview = replyPreview.length > 50 ? replyPreview.substring(0, 50) + '...' : replyPreview;

    return this.create({
      userId: commentOwnerId,
      type: 'interaction',
      title: 'New Reply',
      message: `${replierName} replied to your comment: "${preview}"`,
      relatedUserId: replierUserId,
      relatedEntityId: postId,
      relatedEntityType: 'post'
    });
  }

  // Create notification when someone likes a share (quote post)
  static async createShareLikeNotification(shareOwnerId, likerUserId, likerName, shareId) {
    // Don't notify if liking own share
    if (shareOwnerId === likerUserId) return null;

    // Check if notification exists within last hour
    const exists = await this.exists({
      userId: shareOwnerId,
      type: 'interaction',
      relatedUserId: likerUserId,
      relatedEntityId: shareId,
      withinHours: 1
    });

    if (exists) return null;

    return this.create({
      userId: shareOwnerId,
      type: 'interaction',
      title: 'New Like',
      message: `${likerName} liked your quote post`,
      relatedUserId: likerUserId,
      relatedEntityId: shareId,
      relatedEntityType: 'share'
    });
  }

  // Create notification when someone comments on a share (quote post)
  static async createShareCommentNotification(shareOwnerId, commenterUserId, commenterName, shareId) {
    // Don't notify if commenting on own share
    if (shareOwnerId === commenterUserId) return null;

    return this.create({
      userId: shareOwnerId,
      type: 'interaction',
      title: 'New Comment',
      message: `${commenterName} commented on your quote post`,
      relatedUserId: commenterUserId,
      relatedEntityId: shareId,
      relatedEntityType: 'share'
    });
  }
  // Create notification when a watched player enters the transfer portal
  static async createPortalEntryNotification(coachUserId, playerUserId, playerName, playerPosition, playerSchool) {
    const posText = playerPosition ? ` (${playerPosition})` : '';
    const schoolText = playerSchool ? `, ${playerSchool}` : '';
    return this.create({
      userId: coachUserId,
      type: 'interaction',
      title: 'Portal Entry',
      message: `${playerName}${posText}${schoolText} has entered the transfer portal`,
      relatedUserId: playerUserId,
      relatedEntityType: 'portal_watchlist'
    });
  }
  // Create notification when a player appears in an AI search result.
  //
  // Deliberately anonymous: it never names the coach or school. Both the in-app
  // row and the APNs push are built from this title/message (see utils/notifications.js),
  // and the push preview can show on a lock screen — the identity of a program
  // looking at a recruit is not something to leak there. It also keeps the
  // notification honest: WHICH schools searched is the paid AI Rep payload.
  //
  // Title stays 'AI Search Match' — all six roles' notifications.js switch on that
  // exact string for the icon, row rendering, and the click-through to AI Rep.
  static async createAiSearchMatchNotification(playerUserId, coachDivision, aiType) {
    const isPortal = aiType === 'portal_intelligence';
    // RA = the AI Rep "Search Appearances" feed (hsplayer/transferplayer).
    // PI = portal-intelligence sweep (current college players); left as-is.
    const message = isPortal
      ? `${coachDivision ? `A ${coachDivision}` : 'A'} coach's portal intelligence search matched your profile`
      : 'Your profile turned up in a college coach\'s AI search. Open AI Rep to see your search appearances.';

    // Dedupe: don't send more than 1 per player per 6 hours. A popular recruit can
    // surface in many searches an hour; without this the bell (and the lock screen)
    // would be unusable.
    const alreadyExists = await this.exists({
      userId: playerUserId,
      type: 'interaction',
      title: 'AI Search Match',
      withinHours: 6
    });
    if (alreadyExists) return null;

    return this.create({
      userId: playerUserId,
      type: 'interaction',
      title: 'AI Search Match',
      message,
      relatedUserId: null,
      relatedEntityType: 'ai_search'
    });
  }
}

module.exports = Notification;
