const pool = require('../config/database');

// Two-way block relationships. Storage is directional (blocker_id -> blocked_id)
// but every query that uses these treats blocks as bidirectional via UNION.
//
// create() does more than INSERT — it also:
//   1. Auto-unfollows BOTH directions (with follower/following count decrements
//      across player_profiles, coach_profiles, other_profiles — same pattern
//      as Follow.unfollow())
//   2. Soft-hides any existing 1:1 conversation between the two users on both
//      sides (conversation_participants.hidden_at = NOW())
//
// All four steps run in a single transaction so a failure rolls back cleanly.
class BlockedUser {
  static async create(blockerId, blockedId) {
    if (blockerId === blockedId) {
      throw new Error('Cannot block yourself');
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Insert the block row (idempotent — re-blocking is a no-op for the row)
      const blockResult = await client.query(
        `INSERT INTO blocked_users (blocker_id, blocked_id)
         VALUES ($1, $2)
         ON CONFLICT (blocker_id, blocked_id) DO NOTHING
         RETURNING *`,
        [blockerId, blockedId]
      );
      const newBlockInserted = blockResult.rows.length > 0;

      // 2. Auto-unfollow direction A (blocker -> blocked)
      const unfollowA = await client.query(
        'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 RETURNING *',
        [blockerId, blockedId]
      );
      if (unfollowA.rows.length > 0) {
        // Decrement blocker's following_count + blocked's followers_count
        // (mirror Follow.unfollow pattern: GREATEST(... - 1, 0) across all 3 profile tables)
        for (const table of ['player_profiles', 'coach_profiles', 'other_profiles']) {
          await client.query(
            `UPDATE ${table} SET following_count = GREATEST(following_count - 1, 0) WHERE user_id = $1`,
            [blockerId]
          );
          await client.query(
            `UPDATE ${table} SET followers_count = GREATEST(followers_count - 1, 0) WHERE user_id = $1`,
            [blockedId]
          );
        }
      }

      // 3. Auto-unfollow direction B (blocked -> blocker)
      const unfollowB = await client.query(
        'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 RETURNING *',
        [blockedId, blockerId]
      );
      if (unfollowB.rows.length > 0) {
        for (const table of ['player_profiles', 'coach_profiles', 'other_profiles']) {
          await client.query(
            `UPDATE ${table} SET following_count = GREATEST(following_count - 1, 0) WHERE user_id = $1`,
            [blockedId]
          );
          await client.query(
            `UPDATE ${table} SET followers_count = GREATEST(followers_count - 1, 0) WHERE user_id = $1`,
            [blockerId]
          );
        }
      }

      // 4. Hide any conversation containing both users on both sides
      await client.query(
        `UPDATE conversation_participants
         SET hidden_at = NOW()
         WHERE user_id IN ($1, $2)
           AND conversation_id IN (
             SELECT cp1.conversation_id
             FROM conversation_participants cp1
             JOIN conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
             WHERE cp1.user_id = $1 AND cp2.user_id = $2
           )`,
        [blockerId, blockedId]
      );

      await client.query('COMMIT');
      return { inserted: newBlockInserted };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Remove a block. Does NOT auto-restore follows or unhide conversations —
  // unblocking restores future visibility only, not past state. Matches
  // Instagram / Twitter behavior.
  static async remove(blockerId, blockedId) {
    const result = await pool.query(
      'DELETE FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2 RETURNING *',
      [blockerId, blockedId]
    );
    return result.rows[0] || null;
  }

  // Two-way block check: returns true if either direction is blocked.
  static async isBlocked(userIdA, userIdB) {
    const result = await pool.query(
      `SELECT 1 FROM blocked_users
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1)
       LIMIT 1`,
      [userIdA, userIdB]
    );
    return result.rows.length > 0;
  }

  // Strict direction check: did userA explicitly block userB?
  // Used by the frontend to decide whether to show "Block" vs "Unblock"
  // button on userB's profile (only the blocker can unblock).
  static async didBlock(blockerId, blockedId) {
    const result = await pool.query(
      'SELECT 1 FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2',
      [blockerId, blockedId]
    );
    return result.rows.length > 0;
  }

  // List blocked users for the Settings → Blocked Users management section
  // (sub-plan #2d). Joins to whichever profile table has the user's row.
  // Returns: [{ user_id, first_name, last_name, username, profile_image_url, role, created_at }]
  static async listForUser(blockerId, limit = 100) {
    const result = await pool.query(
      `SELECT b.blocked_id AS user_id,
              b.created_at,
              u.role,
              COALESCE(pp.first_name, cp.first_name, op.first_name) AS first_name,
              COALESCE(pp.last_name, cp.last_name, op.last_name) AS last_name,
              COALESCE(pp.username, cp.username, op.username) AS username,
              COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) AS profile_image_url
       FROM blocked_users b
       JOIN users u ON u.id = b.blocked_id
       LEFT JOIN player_profiles pp ON pp.user_id = b.blocked_id
       LEFT JOIN coach_profiles cp ON cp.user_id = b.blocked_id
       LEFT JOIN other_profiles op ON op.user_id = b.blocked_id
       WHERE b.blocker_id = $1
       ORDER BY b.created_at DESC
       LIMIT $2`,
      [blockerId, limit]
    );
    return result.rows;
  }
}

module.exports = BlockedUser;
