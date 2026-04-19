const pool = require('../config/database');
const { getSignedS3Url, getSignedVideoUrl } = require('../utils/s3');

async function resolveMessageMediaUrl(key, type) {
  if (!key) return null;
  return type === 'video' ? await getSignedVideoUrl(key) : await getSignedS3Url(key);
}

class Message {
  static async createConversation(participantIds, createdBy = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Store the creator as the first participant if not explicitly provided
      const creatorId = createdBy || participantIds[0];

      const convResult = await client.query(
        'INSERT INTO conversations (created_by) VALUES ($1) RETURNING *',
        [creatorId]
      );
      const conversation = convResult.rows[0];

      for (const userId of participantIds) {
        await client.query(
          'INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2)',
          [conversation.id, userId]
        );
      }

      await client.query('COMMIT');
      return conversation;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getOrCreateConversation(user1Id, user2Id) {
    // user1Id is the person initiating/viewing the conversation
    const result = await pool.query(
      `SELECT DISTINCT c.* FROM conversations c
       JOIN conversation_participants cp1 ON c.id = cp1.conversation_id
       JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
       WHERE cp1.user_id = $1 AND cp2.user_id = $2
       LIMIT 1`,
      [user1Id, user2Id]
    );

    if (result.rows[0]) {
      // Unhide the conversation for the initiating user (in case it was previously hidden)
      await pool.query(
        `UPDATE conversation_participants
         SET hidden_at = NULL
         WHERE conversation_id = $1 AND user_id = $2`,
        [result.rows[0].id, user1Id]
      );
      return result.rows[0];
    }

    // user1Id is the creator (the one who initiated the conversation)
    return await this.createConversation([user1Id, user2Id], user1Id);
  }

  static async sendMessage(conversationId, senderId, content, mediaUrl = null, mediaType = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        'INSERT INTO messages (conversation_id, sender_id, content, media_url, media_type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [conversationId, senderId, content, mediaUrl, mediaType]
      );

      await client.query(
        'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [conversationId]
      );

      await client.query('COMMIT');

      const row = result.rows[0];
      if (row.media_url) {
        row.media_url = await resolveMessageMediaUrl(row.media_url, row.media_type);
      }
      return row;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getConversationMessages(conversationId, limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT m.*,
              COALESCE(pp.first_name, cp.first_name, op.first_name) as sender_first_name,
              COALESCE(pp.last_name, cp.last_name, op.last_name) as sender_last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as sender_image
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       LEFT JOIN other_profiles op ON u.id = op.user_id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset]
    );
    await Promise.all(result.rows.map(async (row) => {
      if (row.media_url) {
        row.media_url = await resolveMessageMediaUrl(row.media_url, row.media_type);
      }
    }));
    return result.rows;
  }

  static async getUserConversations(userId, limit = 20, offset = 0) {
    // Only show conversations that:
    // 1. Have at least one message, OR
    // 2. Were created by the current user (empty conversations only visible to initiator)
    // 3. Are not hidden by the user, OR have a new message after hidden_at
    const result = await pool.query(
      `SELECT c.*,
              array_agg(DISTINCT jsonb_build_object(
                'id', u.id,
                'first_name', COALESCE(pp.first_name, cp.first_name, op.first_name),
                'last_name', COALESCE(pp.last_name, cp.last_name, op.last_name),
                'profile_image', COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url),
                'role', u.role,
                'position', pp.position,
                'height', pp.height,
                'weight', pp.weight,
                'eligibility', pp.eligibility,
                'transfer', pp.transfer,
                'star_rating', pp.star_rating,
                'state', COALESCE(pp.state, cp.state),
                'team_name', COALESCE(pp.team_name, cp.team_name),
                'graduation_year', pp.graduation_year,
                'position_title', cp.position_title,
                'college_division', COALESCE(pp.college_division, cp.college_division),
                'player_status', pp.player_status,
                'subheader', op.subheader
              )) FILTER (WHERE u.id != $1) as participants,
              (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
              (SELECT media_type FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_media_type,
              (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
              (SELECT sender_id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_sender_id,
              cp_user.last_read_at
       FROM conversations c
       JOIN conversation_participants cp_user ON c.id = cp_user.conversation_id AND cp_user.user_id = $1
       JOIN conversation_participants cp_other ON c.id = cp_other.conversation_id
       JOIN users u ON cp_other.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       LEFT JOIN other_profiles op ON u.id = op.user_id
       WHERE cp_user.user_id = $1
         AND (
           EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id)
           OR c.created_by = $1
         )
         AND (
           cp_user.hidden_at IS NULL
           OR EXISTS (
             SELECT 1 FROM messages m
             WHERE m.conversation_id = c.id
             AND m.created_at > cp_user.hidden_at
           )
         )
       GROUP BY c.id, cp_user.last_read_at
       ORDER BY c.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  static async markConversationAsRead(conversationId, userId) {
    // Use NOW() which respects the database timezone setting
    // rather than passing a JavaScript timestamp which may be interpreted differently
    await pool.query(
      `UPDATE conversation_participants
       SET last_read_at = NOW()
       WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId]
    );
  }

  static async isParticipant(conversationId, userId) {
    const result = await pool.query(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId]
    );
    return result.rows.length > 0;
  }

  static async getUnreadCount(userId) {
    // Count conversations where:
    // 1. User is a participant
    // 2. There's at least one message
    // 3. Last message was NOT sent by this user
    // 4. Last message time is newer than user's last_read_at (or last_read_at is null)
    // 5. Conversation is not hidden, or has new messages after hidden_at
    const result = await pool.query(
      `SELECT COUNT(DISTINCT c.id) as unread_count
       FROM conversations c
       JOIN conversation_participants cp ON c.id = cp.conversation_id AND cp.user_id = $1
       WHERE EXISTS (
         SELECT 1 FROM messages m
         WHERE m.conversation_id = c.id
         AND m.sender_id != $1
         AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
       )
       AND (
         cp.hidden_at IS NULL
         OR EXISTS (
           SELECT 1 FROM messages m
           WHERE m.conversation_id = c.id
           AND m.created_at > cp.hidden_at
         )
       )`,
      [userId]
    );
    return parseInt(result.rows[0].unread_count) || 0;
  }

  static async hideConversation(conversationId, userId) {
    // Hide the conversation for this user by setting hidden_at timestamp
    await pool.query(
      `UPDATE conversation_participants
       SET hidden_at = CURRENT_TIMESTAMP
       WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId]
    );
  }
}

module.exports = Message;
