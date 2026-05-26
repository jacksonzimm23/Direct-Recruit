const pool = require('../config/database');

/**
 * BoardGroup — Phase 2 of the recruiting-board redesign.
 *
 * A group is a named collection of college coaches. Each member has either
 * 'viewer' or 'editor' permission. Inside a group, members collectively manage
 * up to BOARDS_PER_GROUP_CAP named recruiting boards (rows in recruiting_boards
 * with group_id set). The owner is also stored as an 'editor' row in
 * board_group_members so a single WHERE user_id = $X yields every group the
 * coach can see. Application code enforces "only the owner may transfer /
 * delete-group / change owner permission".
 */
class BoardGroup {
  static GROUPS_PER_USER_CAP = 1;

  // ---------- Reads ----------

  // List every group the coach is a member of, oldest-joined first.
  static async listGroupsForUser(userId) {
    const result = await pool.query(
      `SELECT g.id, g.group_name, g.owner_user_id, g.created_at,
              m.permission AS my_permission,
              (g.owner_user_id = $1) AS is_owner,
              (SELECT COUNT(*) FROM board_group_members WHERE group_id = g.id)::int AS member_count
       FROM board_groups g
       JOIN board_group_members m ON m.group_id = g.id AND m.user_id = $1
       ORDER BY m.added_at ASC`,
      [userId]
    );
    return result.rows;
  }

  // Get a group's full details (members + my permission). Returns null if not a member.
  static async getGroupById(groupId, userId) {
    const myRow = await this.getMembership(groupId, userId);
    if (!myRow) return null;

    const groupResult = await pool.query(
      `SELECT id, group_name, owner_user_id, created_at, updated_at FROM board_groups WHERE id = $1`,
      [groupId]
    );
    if (!groupResult.rows[0]) return null;
    const group = groupResult.rows[0];

    const membersResult = await pool.query(
      `SELECT m.user_id, m.permission, m.added_at,
              cp.first_name, cp.last_name, cp.username, cp.profile_image_url, cp.team_name, cp.state, cp.college_division
       FROM board_group_members m
       JOIN coach_profiles cp ON cp.user_id = m.user_id
       WHERE m.group_id = $1
       ORDER BY (m.user_id = $2) DESC, m.added_at ASC`,
      [groupId, group.owner_user_id]
    );

    return {
      ...group,
      my_permission: myRow.permission,
      is_owner: String(group.owner_user_id) === String(userId),
      members: membersResult.rows
    };
  }

  // Returns { permission, is_owner } or null.
  static async getMembership(groupId, userId) {
    const result = await pool.query(
      `SELECT m.permission, (g.owner_user_id = $2) AS is_owner
       FROM board_group_members m
       JOIN board_groups g ON g.id = m.group_id
       WHERE m.group_id = $1 AND m.user_id = $2`,
      [groupId, userId]
    );
    return result.rows[0] || null;
  }

  // Has the user been invited to a particular group? Returns true if a pending
  // notification exists. Used to populate the staged-list exclusion + the
  // search exclusion.
  static async hasPendingInvite(groupId, userId) {
    const result = await pool.query(
      `SELECT 1 FROM notifications
       WHERE user_id = $1
         AND related_entity_id = $2
         AND related_entity_type IN ('group_invite', 'group_invite_editor')
         AND is_read = FALSE
       LIMIT 1`,
      [userId, groupId]
    );
    return result.rows.length > 0;
  }

  // ---------- Writes (group lifecycle) ----------

  // Create a new group. The creator becomes owner + 'editor' member. Enforces
  // the per-user group cap (GROUPS_PER_USER_CAP — currently 1).
  static async createGroup(userId, groupName) {
    const trimmed = (groupName || '').trim();
    if (!trimmed) throw new Error('Group name is required');
    if (trimmed.length > 100) throw new Error('Group name must be 100 characters or less');

    const cap = await pool.query(
      `SELECT COUNT(*)::int AS n FROM board_group_members WHERE user_id = $1`,
      [userId]
    );
    if (cap.rows[0].n >= this.GROUPS_PER_USER_CAP) {
      throw new Error(`Group limit reached (max ${this.GROUPS_PER_USER_CAP})`);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const groupResult = await client.query(
        `INSERT INTO board_groups (group_name, owner_user_id) VALUES ($1, $2)
         RETURNING id, group_name, owner_user_id, created_at, updated_at`,
        [trimmed, userId]
      );
      const group = groupResult.rows[0];
      await client.query(
        `INSERT INTO board_group_members (group_id, user_id, permission)
         VALUES ($1, $2, 'editor')`,
        [group.id, userId]
      );
      await client.query('COMMIT');
      return { ...group, my_permission: 'editor', is_owner: true, member_count: 1 };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Delete a group. Editor-or-owner only. Cascades boards via FK.
  static async deleteGroup(groupId, userId) {
    const my = await this.getMembership(groupId, userId);
    if (!my || my.permission !== 'editor') {
      throw new Error('Only editors or the owner can delete this group');
    }
    await pool.query(`DELETE FROM board_groups WHERE id = $1`, [groupId]);
    return { success: true };
  }

  // Rename a group. Editor-or-owner only.
  static async renameGroup(groupId, userId, newName) {
    const trimmed = (newName || '').trim();
    if (!trimmed) throw new Error('Group name is required');
    if (trimmed.length > 100) throw new Error('Group name must be 100 characters or less');

    const my = await this.getMembership(groupId, userId);
    if (!my || my.permission !== 'editor') {
      throw new Error('Only editors or the owner can rename this group');
    }
    const result = await pool.query(
      `UPDATE board_groups SET group_name = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING id, group_name`,
      [trimmed, groupId]
    );
    return result.rows[0];
  }

  // Transfer ownership to another existing member. Owner only. The new owner
  // is automatically promoted to 'editor' (in case they were a viewer). The
  // outgoing owner becomes a regular 'editor'.
  static async transferOwnership(groupId, currentOwnerId, newOwnerId) {
    const groupResult = await pool.query(
      `SELECT owner_user_id FROM board_groups WHERE id = $1`,
      [groupId]
    );
    if (!groupResult.rows[0]) throw new Error('Group not found');
    if (String(groupResult.rows[0].owner_user_id) !== String(currentOwnerId)) {
      throw new Error('Only the owner can transfer ownership');
    }

    const targetMember = await pool.query(
      `SELECT 1 FROM board_group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, newOwnerId]
    );
    if (!targetMember.rows[0]) throw new Error('New owner must already be a member of the group');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE board_groups SET owner_user_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [newOwnerId, groupId]
      );
      await client.query(
        `UPDATE board_group_members SET permission = 'editor' WHERE group_id = $1 AND user_id = $2`,
        [groupId, newOwnerId]
      );
      // Outgoing owner stays in the group as an editor (already was, since
      // owner is always stored as 'editor'); no action needed.
      await client.query('COMMIT');
      return { success: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Leave a group. If the leaver is the owner and there are other editors,
  // ownership auto-transfers to a random editor. If the leaver is the only
  // member, the group is deleted. Returns { transferred_to, deleted }.
  static async leaveGroup(groupId, userId) {
    const groupResult = await pool.query(
      `SELECT owner_user_id FROM board_groups WHERE id = $1`,
      [groupId]
    );
    if (!groupResult.rows[0]) throw new Error('Group not found');
    const isOwner = String(groupResult.rows[0].owner_user_id) === String(userId);

    const my = await this.getMembership(groupId, userId);
    if (!my) throw new Error('You are not a member of this group');

    if (!isOwner) {
      await pool.query(
        `DELETE FROM board_group_members WHERE group_id = $1 AND user_id = $2`,
        [groupId, userId]
      );
      return { transferred_to: null, deleted: false };
    }

    // Owner is leaving. Find a candidate editor (any other editor row).
    const candidate = await pool.query(
      `SELECT user_id FROM board_group_members
       WHERE group_id = $1 AND user_id != $2 AND permission = 'editor'
       ORDER BY added_at ASC LIMIT 1`,
      [groupId, userId]
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (candidate.rows[0]) {
        const newOwnerId = candidate.rows[0].user_id;
        await client.query(
          `UPDATE board_groups SET owner_user_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [newOwnerId, groupId]
        );
        await client.query(
          `DELETE FROM board_group_members WHERE group_id = $1 AND user_id = $2`,
          [groupId, userId]
        );
        await client.query('COMMIT');
        return { transferred_to: newOwnerId, deleted: false };
      } else {
        // No editor candidate; check if any viewers exist.
        const viewerCount = await client.query(
          `SELECT COUNT(*)::int AS n FROM board_group_members WHERE group_id = $1 AND user_id != $2`,
          [groupId, userId]
        );
        if (viewerCount.rows[0].n > 0) {
          // Promote the oldest viewer to editor + owner.
          const viewerCandidate = await client.query(
            `SELECT user_id FROM board_group_members
             WHERE group_id = $1 AND user_id != $2
             ORDER BY added_at ASC LIMIT 1`,
            [groupId, userId]
          );
          const newOwnerId = viewerCandidate.rows[0].user_id;
          await client.query(
            `UPDATE board_group_members SET permission = 'editor' WHERE group_id = $1 AND user_id = $2`,
            [groupId, newOwnerId]
          );
          await client.query(
            `UPDATE board_groups SET owner_user_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [newOwnerId, groupId]
          );
          await client.query(
            `DELETE FROM board_group_members WHERE group_id = $1 AND user_id = $2`,
            [groupId, userId]
          );
          await client.query('COMMIT');
          return { transferred_to: newOwnerId, deleted: false };
        }
        // Last member leaving -> delete the group entirely.
        await client.query(`DELETE FROM board_groups WHERE id = $1`, [groupId]);
        await client.query('COMMIT');
        return { transferred_to: null, deleted: true };
      }
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Remove a member from a group using an EXISTING transaction client. Mirrors
  // the ownership-transfer logic in leaveGroup() but does not open or commit
  // its own transaction — the caller is responsible for BEGIN/COMMIT/ROLLBACK.
  //
  // Used by the team-switch redaction in routes/settings.js when a coach
  // changes schools: every old-school group membership is cleaned up inside
  // the same transaction that flips the coach's profile.
  //
  // Returns { transferred_to, deleted } matching leaveGroup's shape.
  static async removeMemberWithOwnerTransfer(client, groupId, userId) {
    const groupResult = await client.query(
      `SELECT owner_user_id FROM board_groups WHERE id = $1`,
      [groupId]
    );
    if (!groupResult.rows[0]) {
      // Group already gone — treat as a no-op success.
      return { transferred_to: null, deleted: true };
    }
    const isOwner = String(groupResult.rows[0].owner_user_id) === String(userId);

    const memberCheck = await client.query(
      `SELECT 1 FROM board_group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );
    if (!memberCheck.rows[0]) {
      // Not a member — nothing to do.
      return { transferred_to: null, deleted: false };
    }

    if (!isOwner) {
      await client.query(
        `DELETE FROM board_group_members WHERE group_id = $1 AND user_id = $2`,
        [groupId, userId]
      );
      return { transferred_to: null, deleted: false };
    }

    // Owner leaving — try to promote another editor first.
    const editorCandidate = await client.query(
      `SELECT user_id FROM board_group_members
       WHERE group_id = $1 AND user_id != $2 AND permission = 'editor'
       ORDER BY added_at ASC LIMIT 1`,
      [groupId, userId]
    );
    if (editorCandidate.rows[0]) {
      const newOwnerId = editorCandidate.rows[0].user_id;
      await client.query(
        `UPDATE board_groups SET owner_user_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [newOwnerId, groupId]
      );
      await client.query(
        `DELETE FROM board_group_members WHERE group_id = $1 AND user_id = $2`,
        [groupId, userId]
      );
      return { transferred_to: newOwnerId, deleted: false };
    }

    // No editor candidate — promote a viewer if any.
    const viewerCandidate = await client.query(
      `SELECT user_id FROM board_group_members
       WHERE group_id = $1 AND user_id != $2
       ORDER BY added_at ASC LIMIT 1`,
      [groupId, userId]
    );
    if (viewerCandidate.rows[0]) {
      const newOwnerId = viewerCandidate.rows[0].user_id;
      await client.query(
        `UPDATE board_group_members SET permission = 'editor' WHERE group_id = $1 AND user_id = $2`,
        [groupId, newOwnerId]
      );
      await client.query(
        `UPDATE board_groups SET owner_user_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [newOwnerId, groupId]
      );
      await client.query(
        `DELETE FROM board_group_members WHERE group_id = $1 AND user_id = $2`,
        [groupId, userId]
      );
      return { transferred_to: newOwnerId, deleted: false };
    }

    // Last member leaving — delete the group (recruiting_boards rows cascade).
    await client.query(`DELETE FROM board_groups WHERE id = $1`, [groupId]);
    return { transferred_to: null, deleted: true };
  }

  // ---------- Writes (membership) ----------

  // Add a member directly (no invite step). Used internally when an invite is
  // accepted. Editor-or-owner only on the requester side. Enforces invitee's
  // per-user group cap (GROUPS_PER_USER_CAP — currently 1).
  static async addMember(groupId, requesterId, targetId, permission) {
    if (permission !== 'viewer' && permission !== 'editor') {
      throw new Error('Permission must be "viewer" or "editor"');
    }
    if (requesterId !== targetId) {
      const my = await this.getMembership(groupId, requesterId);
      if (!my || my.permission !== 'editor') {
        throw new Error('Only editors or the owner can add members');
      }
    }

    const cap = await pool.query(
      `SELECT COUNT(*)::int AS n FROM board_group_members WHERE user_id = $1`,
      [targetId]
    );
    if (cap.rows[0].n >= this.GROUPS_PER_USER_CAP) {
      throw new Error(`Target user has reached the group limit (max ${this.GROUPS_PER_USER_CAP})`);
    }

    await pool.query(
      `INSERT INTO board_group_members (group_id, user_id, permission)
       VALUES ($1, $2, $3)
       ON CONFLICT (group_id, user_id) DO NOTHING`,
      [groupId, targetId, permission]
    );
    return { success: true };
  }

  // Remove a member. Editor-or-owner only. Cannot target the owner.
  static async removeMember(groupId, requesterId, targetId) {
    const my = await this.getMembership(groupId, requesterId);
    if (!my || my.permission !== 'editor') {
      throw new Error('Only editors or the owner can remove members');
    }

    const groupResult = await pool.query(
      `SELECT owner_user_id FROM board_groups WHERE id = $1`,
      [groupId]
    );
    if (!groupResult.rows[0]) throw new Error('Group not found');
    if (String(groupResult.rows[0].owner_user_id) === String(targetId)) {
      throw new Error('Cannot remove the group owner');
    }

    const result = await pool.query(
      `DELETE FROM board_group_members WHERE group_id = $1 AND user_id = $2 RETURNING user_id`,
      [groupId, targetId]
    );
    if (!result.rows[0]) throw new Error('Member not found in group');
    return { success: true };
  }

  // Change a member's permission. Editor-or-owner only. Cannot modify the
  // owner's permission (use transferOwnership for that).
  static async updatePermission(groupId, requesterId, targetId, newPermission) {
    if (newPermission !== 'viewer' && newPermission !== 'editor') {
      throw new Error('Permission must be "viewer" or "editor"');
    }
    const my = await this.getMembership(groupId, requesterId);
    if (!my || my.permission !== 'editor') {
      throw new Error('Only editors or the owner can change permissions');
    }
    const groupResult = await pool.query(
      `SELECT owner_user_id FROM board_groups WHERE id = $1`,
      [groupId]
    );
    if (!groupResult.rows[0]) throw new Error('Group not found');
    if (String(groupResult.rows[0].owner_user_id) === String(targetId)) {
      throw new Error("Cannot change the owner's permission; transfer ownership first");
    }

    const result = await pool.query(
      `UPDATE board_group_members SET permission = $1
       WHERE group_id = $2 AND user_id = $3
       RETURNING user_id, permission`,
      [newPermission, groupId, targetId]
    );
    if (!result.rows[0]) throw new Error('Member not found in group');
    return result.rows[0];
  }
}

module.exports = BoardGroup;
