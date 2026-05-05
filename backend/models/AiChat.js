const pool = require('../config/database');

const MAX_CHATS = 50;

class AiChat {
  // Get all chats for a coach (newest first)
  static async getChatsByCoach(coachUserId, chatType = 'recruit_assistant') {
    const result = await pool.query(
      `SELECT id, title, created_at, updated_at
       FROM ai_chats
       WHERE coach_user_id = $1 AND chat_type = $2
       ORDER BY updated_at DESC`,
      [coachUserId, chatType]
    );
    return result.rows;
  }

  // Create a new chat.
  // Security #39: race-free 50-chat cap mirroring the RaSavedPlayers
  // pattern from security #19 — pg_advisory_xact_lock serializes concurrent
  // creates for the same coach, atomic CTE gates the INSERT on the count
  // inside a single SQL statement. Returns {success, chat, error, count}.
  static async createChat(coachUserId, chatType = 'recruit_assistant', title = 'New Chat') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [`ai_chat:${coachUserId}`]
      );

      const result = await client.query(
        `WITH current_count AS (
           SELECT COUNT(*)::int AS cnt FROM ai_chats WHERE coach_user_id = $1
         ),
         inserted AS (
           INSERT INTO ai_chats (coach_user_id, chat_type, title)
           SELECT $1, $2, $3 FROM current_count WHERE cnt < ${MAX_CHATS}
           RETURNING *
         )
         SELECT cc.cnt AS pre_count,
                (SELECT row_to_json(i.*) FROM inserted i) AS chat
         FROM current_count cc`,
        [coachUserId, chatType, title]
      );

      await client.query('COMMIT');

      const { pre_count, chat } = result.rows[0];

      if (pre_count >= MAX_CHATS && !chat) {
        return { success: false, error: `Chat limit reached — maximum ${MAX_CHATS} active chats. Delete an old chat to create a new one.`, count: pre_count };
      }
      return { success: true, chat, count: pre_count + 1 };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Get a single chat with all messages (verifies ownership)
  static async getChatWithMessages(chatId, coachUserId) {
    const chatResult = await pool.query(
      `SELECT * FROM ai_chats WHERE id = $1 AND coach_user_id = $2`,
      [chatId, coachUserId]
    );

    if (chatResult.rows.length === 0) return null;

    const messagesResult = await pool.query(
      `SELECT id, role, content, metadata, created_at
       FROM ai_chat_messages
       WHERE chat_id = $1
       ORDER BY created_at ASC`,
      [chatId]
    );

    return {
      ...chatResult.rows[0],
      messages: messagesResult.rows
    };
  }

  // Add a message to a chat (verifies ownership)
  static async addMessage(chatId, coachUserId, role, content, metadata = null) {
    // Verify chat belongs to this coach
    const verify = await pool.query(
      `SELECT id FROM ai_chats WHERE id = $1 AND coach_user_id = $2`,
      [chatId, coachUserId]
    );
    if (verify.rows.length === 0) return null;

    const result = await pool.query(
      `INSERT INTO ai_chat_messages (chat_id, role, content, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [chatId, role, content, metadata ? JSON.stringify(metadata) : null]
    );

    // Update chat's updated_at
    await pool.query(
      `UPDATE ai_chats SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [chatId]
    );

    return result.rows[0];
  }

  // Update chat title
  static async updateTitle(chatId, coachUserId, title) {
    const result = await pool.query(
      `UPDATE ai_chats SET title = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND coach_user_id = $3
       RETURNING *`,
      [title, chatId, coachUserId]
    );
    return result.rows[0] || null;
  }

  // Delete a chat (verifies ownership, cascades to messages)
  static async deleteChat(chatId, coachUserId) {
    const result = await pool.query(
      `DELETE FROM ai_chats WHERE id = $1 AND coach_user_id = $2 RETURNING id`,
      [chatId, coachUserId]
    );
    return result.rows.length > 0;
  }
}

module.exports = AiChat;
