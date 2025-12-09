const pool = require('../config/database');

class Message {
  static async createConversation(participantIds) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const convResult = await client.query(
        'INSERT INTO conversations DEFAULT VALUES RETURNING *'
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
    const result = await pool.query(
      `SELECT DISTINCT c.* FROM conversations c
       JOIN conversation_participants cp1 ON c.id = cp1.conversation_id
       JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
       WHERE cp1.user_id = $1 AND cp2.user_id = $2
       LIMIT 1`,
      [user1Id, user2Id]
    );

    if (result.rows[0]) {
      return result.rows[0];
    }

    return await this.createConversation([user1Id, user2Id]);
  }

  static async sendMessage(conversationId, senderId, content) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        'INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3) RETURNING *',
        [conversationId, senderId, content]
      );

      await client.query(
        'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [conversationId]
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

  static async getConversationMessages(conversationId, limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT m.*,
              COALESCE(pp.first_name, cp.first_name) as sender_first_name,
              COALESCE(pp.last_name, cp.last_name) as sender_last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url) as sender_image
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset]
    );
    return result.rows;
  }

  static async getUserConversations(userId, limit = 20, offset = 0) {
    const result = await pool.query(
      `SELECT c.*,
              array_agg(DISTINCT jsonb_build_object(
                'id', u.id,
                'first_name', COALESCE(pp.first_name, cp.first_name),
                'last_name', COALESCE(pp.last_name, cp.last_name),
                'profile_image', COALESCE(pp.profile_image_url, cp.profile_image_url),
                'role', u.role,
                'position', pp.position,
                'height', pp.height,
                'weight', pp.weight,
                'state', COALESCE(pp.state, cp.state),
                'high_school', pp.high_school,
                'graduation_year', pp.graduation_year,
                'college_name', cp.college_name,
                'position_title', cp.position_title,
                'college_division', COALESCE(pp.college_division, cp.college_division),
                'player_status', pp.player_status
              )) FILTER (WHERE u.id != $1) as participants,
              (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
              (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
              (SELECT sender_id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_sender_id,
              cp_user.last_read_at
       FROM conversations c
       JOIN conversation_participants cp_user ON c.id = cp_user.conversation_id AND cp_user.user_id = $1
       JOIN conversation_participants cp_other ON c.id = cp_other.conversation_id
       JOIN users u ON cp_other.user_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       WHERE cp_user.user_id = $1
       GROUP BY c.id, cp_user.last_read_at
       ORDER BY c.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  static async markConversationAsRead(conversationId, userId) {
    await pool.query(
      `UPDATE conversation_participants
       SET last_read_at = CURRENT_TIMESTAMP
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
}

module.exports = Message;
