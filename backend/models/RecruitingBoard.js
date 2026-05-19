const pool = require('../config/database');

class RecruitingBoard {
  // Default position configuration
  static DEFAULT_OFFENSE_POSITIONS = [
    { group: 'ol-group', positions: ['LT', 'LG', 'C', 'RG', 'RT'] },
    { group: 'skill-group', positions: ['QB', 'RB', 'WR', 'TE'] }
  ];

  static DEFAULT_DEFENSE_POSITIONS = [
    { group: 'dl-group', positions: ['DE', 'DT', 'NG', 'OLB', 'ILB'] },
    { group: 'secondary-group', positions: ['FS', 'SS', 'CB'] }
  ];

  // ==================== Personal Board Methods (legacy single-board API) ====================
  // Kept for compatibility with the player-profile "Add to Recruiting Board" button which
  // still hits the old class-year-keyed personal endpoints. Will be migrated when the
  // player-profile add-to-board flow is reworked.

  // Get or create personal board for a coach
  static async getOrCreatePersonalBoard(userId) {
    // Check if personal board exists
    let result = await pool.query(
      `SELECT * FROM recruiting_boards
       WHERE owner_user_id = $1 AND is_personal = TRUE AND class_year = 0`,
      [userId]
    );

    if (result.rows[0]) {
      return result.rows[0];
    }

    // Create personal board config row
    result = await pool.query(
      `INSERT INTO recruiting_boards (owner_user_id, class_year, offense_positions, defense_positions, players, is_personal, collab)
       VALUES ($1, 0, $2, $3, '[]'::jsonb, TRUE, '[]'::jsonb)
       RETURNING *`,
      [userId, JSON.stringify(this.DEFAULT_OFFENSE_POSITIONS), JSON.stringify(this.DEFAULT_DEFENSE_POSITIONS)]
    );

    return result.rows[0];
  }

  // Get position config for a board (personal or shared)
  static async getPositionConfig(userId, boardId = null) {
    let result;

    if (boardId) {
      // Get config for specific shared board
      result = await pool.query(
        `SELECT offense_positions, defense_positions, board_name FROM recruiting_boards
         WHERE id = $1 AND class_year = 0`,
        [boardId]
      );
    } else {
      // Get personal board config
      result = await pool.query(
        `SELECT offense_positions, defense_positions FROM recruiting_boards
         WHERE owner_user_id = $1 AND is_personal = TRUE AND class_year = 0`,
        [userId]
      );
    }

    if (result.rows[0]) {
      return {
        offensePositions: result.rows[0].offense_positions,
        defensePositions: result.rows[0].defense_positions,
        boardName: result.rows[0].board_name
      };
    }

    // Return defaults if no config exists
    return {
      offensePositions: this.DEFAULT_OFFENSE_POSITIONS,
      defensePositions: this.DEFAULT_DEFENSE_POSITIONS,
      isDefault: true
    };
  }

  // Save position config for a board
  static async savePositionConfig(userId, offensePositions, defensePositions, boardId = null) {
    if (boardId) {
      // Update shared board config
      const result = await pool.query(
        `UPDATE recruiting_boards
         SET offense_positions = $1, defense_positions = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND class_year = 0
         RETURNING *`,
        [JSON.stringify(offensePositions), JSON.stringify(defensePositions), boardId]
      );
      return result.rows[0];
    } else {
      // Update personal board config
      const result = await pool.query(
        `UPDATE recruiting_boards
         SET offense_positions = $1, defense_positions = $2, updated_at = CURRENT_TIMESTAMP
         WHERE owner_user_id = $3 AND is_personal = TRUE AND class_year = 0
         RETURNING *`,
        [JSON.stringify(offensePositions), JSON.stringify(defensePositions), userId]
      );
      return result.rows[0];
    }
  }

  // ==================== Named Personal Boards (multi-board, no class year) ====================
  // These methods power the redesigned Personal Boards UI where a coach can have up to
  // PERSONAL_BOARD_CAP named boards. Each board is one row at class_year=0 with its own
  // position config and players JSONB. The legacy single-board / per-class-year methods
  // above still exist for any callers (e.g. the player-profile "Add to board" button)
  // that haven't been migrated yet.

  static PERSONAL_BOARD_CAP = 5;

  // List a coach's named personal boards, oldest first.
  static async listPersonalBoards(userId) {
    const result = await pool.query(
      `SELECT id, board_name, offense_positions, defense_positions, created_at, updated_at
       FROM recruiting_boards
       WHERE owner_user_id = $1 AND is_personal = TRUE AND class_year = 0
       ORDER BY created_at ASC`,
      [userId]
    );
    return result.rows;
  }

  // Create a new named personal board. Caps at PERSONAL_BOARD_CAP per coach.
  static async createPersonalBoard(userId, boardName) {
    const trimmed = (boardName || '').trim();
    if (!trimmed) throw new Error('Board name is required');
    if (trimmed.length > 100) throw new Error('Board name must be 100 characters or less');

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS n FROM recruiting_boards
       WHERE owner_user_id = $1 AND is_personal = TRUE AND class_year = 0`,
      [userId]
    );
    if (countResult.rows[0].n >= this.PERSONAL_BOARD_CAP) {
      throw new Error(`Personal board limit reached (max ${this.PERSONAL_BOARD_CAP})`);
    }

    const result = await pool.query(
      `INSERT INTO recruiting_boards
         (owner_user_id, class_year, board_name, offense_positions, defense_positions, players, is_personal, collab)
       VALUES ($1, 0, $2, $3, $4, '[]'::jsonb, TRUE, '[]'::jsonb)
       RETURNING id, board_name, offense_positions, defense_positions, created_at, updated_at`,
      [
        userId,
        trimmed,
        JSON.stringify(this.DEFAULT_OFFENSE_POSITIONS),
        JSON.stringify(this.DEFAULT_DEFENSE_POSITIONS)
      ]
    );
    return result.rows[0];
  }

  // Delete a named personal board (asserts ownership).
  static async deletePersonalBoard(boardId, userId) {
    const result = await pool.query(
      `DELETE FROM recruiting_boards
       WHERE id = $1 AND owner_user_id = $2 AND is_personal = TRUE AND class_year = 0
       RETURNING id`,
      [boardId, userId]
    );
    if (!result.rows[0]) throw new Error('Board not found or not owned by user');
    return { success: true };
  }

  // Rename a named personal board (asserts ownership).
  static async renamePersonalBoard(boardId, userId, newName) {
    const trimmed = (newName || '').trim();
    if (!trimmed) throw new Error('Board name is required');
    if (trimmed.length > 100) throw new Error('Board name must be 100 characters or less');

    const result = await pool.query(
      `UPDATE recruiting_boards
       SET board_name = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND owner_user_id = $3 AND is_personal = TRUE AND class_year = 0
       RETURNING id, board_name`,
      [trimmed, boardId, userId]
    );
    if (!result.rows[0]) throw new Error('Board not found or not owned by user');
    return result.rows[0];
  }

  // Get a personal board by ID (asserts ownership).
  static async getPersonalBoardById(boardId, userId) {
    const result = await pool.query(
      `SELECT id, board_name, offense_positions, defense_positions, players, created_at, updated_at
       FROM recruiting_boards
       WHERE id = $1 AND owner_user_id = $2 AND is_personal = TRUE AND class_year = 0`,
      [boardId, userId]
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    if (typeof row.players === 'string') row.players = JSON.parse(row.players);
    return row;
  }

  // Save position config to a specific personal board.
  static async savePersonalBoardConfig(boardId, userId, offensePositions, defensePositions) {
    const result = await pool.query(
      `UPDATE recruiting_boards
       SET offense_positions = $1, defense_positions = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND owner_user_id = $4 AND is_personal = TRUE AND class_year = 0
       RETURNING id`,
      [JSON.stringify(offensePositions), JSON.stringify(defensePositions), boardId, userId]
    );
    if (!result.rows[0]) throw new Error('Board not found or not owned by user');
    return { success: true };
  }

  // Get players from a specific personal board (returns the entire roster, no class-year filter).
  static async getPlayersFromPersonalBoardById(boardId, userId) {
    const board = await this.getPersonalBoardById(boardId, userId);
    if (!board) return [];
    return board.players || [];
  }

  // Add a player to a specific personal board.
  //
  // Accepts EITHER playerData.user_id (DR-account recruit) OR
  // playerData.pool_entry_id (questionnaire-only recruit, pulled forward from
  // Plan 6). At least one is required by the calling route. The duplicate
  // check matches on whichever identifier is present.
  static async addPlayerToPersonalBoardById(boardId, userId, playerData) {
    const board = await this.getPersonalBoardById(boardId, userId);
    if (!board) throw new Error('Board not found or not owned by user');

    const players = board.players || [];
    if (this._isPlayerAlreadyOnBoard(players, playerData)) {
      throw new Error('Player already on board for this position');
    }

    const toStore = {
      ...playerData,
      // Tag the source so the football field can render the right card variant.
      source: playerData.user_id ? 'dr_profile' : 'questionnaire',
      added_at: new Date().toISOString(),
    };
    delete toStore.class_year; // class_year is not used on the new flat boards
    players.push(toStore);

    await pool.query(
      `UPDATE recruiting_boards
       SET players = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND owner_user_id = $3 AND is_personal = TRUE AND class_year = 0`,
      [JSON.stringify(players), boardId, userId]
    );
    return { success: true };
  }

  // Remove a player from a specific personal board.
  static async removePlayerFromPersonalBoardById(boardId, userId, playerId, position) {
    const board = await this.getPersonalBoardById(boardId, userId);
    if (!board) throw new Error('Board not found or not owned by user');

    const players = board.players || [];
    const updated = players.filter(
      p => !(this._matchPlayerByAnyId(p, playerId) && (!position || p.position === position))
    );

    await pool.query(
      `UPDATE recruiting_boards
       SET players = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND owner_user_id = $3 AND is_personal = TRUE AND class_year = 0`,
      [JSON.stringify(updated), boardId, userId]
    );
    return { success: true };
  }

  // Update a player's position on a specific personal board (drag/drop between columns).
  static async updatePlayerPositionOnPersonalBoardById(boardId, userId, playerId, oldPosition, newPosition) {
    const board = await this.getPersonalBoardById(boardId, userId);
    if (!board) throw new Error('Board not found or not owned by user');

    const players = board.players || [];
    const idx = players.findIndex(
      p => this._matchPlayerByAnyId(p, playerId) && p.position === oldPosition
    );
    if (idx === -1) throw new Error('Player not found in specified position');

    players[idx].position = newPosition;

    await pool.query(
      `UPDATE recruiting_boards
       SET players = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND owner_user_id = $3 AND is_personal = TRUE AND class_year = 0`,
      [JSON.stringify(players), boardId, userId]
    );
    return { success: true };
  }

  // Update the editable final-synthesis fields on an existing player on a
  // personal board. grading_history is NEVER mutated by this method — it's a
  // frozen audit trail from the original promotion. Only final_grade /
  // final_color_tag / final_notes / promoted_by_user_id / promoted_by_name /
  // promoted_at are overwritten (the last three re-stamped to whoever is
  // editing).
  static async updateFinalOnPersonalBoardById(boardId, userId, playerId, position, finalData) {
    const board = await this.getPersonalBoardById(boardId, userId);
    if (!board) throw new Error('Board not found or not owned by user');

    const players = board.players || [];
    const idx = players.findIndex(
      p => this._matchPlayerByAnyId(p, playerId) && p.position === position
    );
    if (idx === -1) throw new Error('Player not found in specified position');

    players[idx].final_grade = (finalData.final_grade !== undefined) ? finalData.final_grade : players[idx].final_grade;
    players[idx].final_color_tag = (finalData.final_color_tag !== undefined) ? finalData.final_color_tag : players[idx].final_color_tag;
    players[idx].final_notes = (finalData.final_notes !== undefined) ? finalData.final_notes : players[idx].final_notes;
    players[idx].promoted_by_user_id = finalData.promoted_by_user_id;
    players[idx].promoted_by_name = finalData.promoted_by_name;
    players[idx].promoted_at = finalData.promoted_at;

    await pool.query(
      `UPDATE recruiting_boards
       SET players = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND owner_user_id = $3 AND is_personal = TRUE AND class_year = 0`,
      [JSON.stringify(players), boardId, userId]
    );
    return { success: true };
  }

  // ==================== Group Boards (Phase 2 — Google-Docs-style sharing) ====================
  // Mirror of the personal-board API above, but the ownership predicate is
  // `group_id = $X` instead of `owner_user_id = $X AND is_personal = TRUE`.
  // Permission gating happens at the route layer via requireGroupAccess(), so the
  // model methods are simple data-access primitives — they trust that the caller
  // already verified the user is allowed to act on this group.

  static BOARDS_PER_GROUP_CAP = 5;

  // List all boards in a group, oldest first.
  static async listGroupBoards(groupId) {
    const result = await pool.query(
      `SELECT id, board_name, offense_positions, defense_positions, created_at, updated_at
       FROM recruiting_boards
       WHERE group_id = $1 AND is_personal = FALSE AND class_year = 0
       ORDER BY created_at ASC`,
      [groupId]
    );
    return result.rows;
  }

  // Create a new board inside a group. Caps at BOARDS_PER_GROUP_CAP.
  static async createGroupBoard(groupId, boardName) {
    const trimmed = (boardName || '').trim();
    if (!trimmed) throw new Error('Board name is required');
    if (trimmed.length > 100) throw new Error('Board name must be 100 characters or less');

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS n FROM recruiting_boards
       WHERE group_id = $1 AND is_personal = FALSE AND class_year = 0`,
      [groupId]
    );
    if (countResult.rows[0].n >= this.BOARDS_PER_GROUP_CAP) {
      throw new Error(`Group board limit reached (max ${this.BOARDS_PER_GROUP_CAP})`);
    }

    const result = await pool.query(
      `INSERT INTO recruiting_boards
         (group_id, class_year, board_name, offense_positions, defense_positions, players, is_personal, collab)
       VALUES ($1, 0, $2, $3, $4, '[]'::jsonb, FALSE, '[]'::jsonb)
       RETURNING id, board_name, offense_positions, defense_positions, created_at, updated_at`,
      [
        groupId,
        trimmed,
        JSON.stringify(this.DEFAULT_OFFENSE_POSITIONS),
        JSON.stringify(this.DEFAULT_DEFENSE_POSITIONS)
      ]
    );
    return result.rows[0];
  }

  // Delete a board (asserts the board belongs to the given group).
  static async deleteGroupBoard(boardId, groupId) {
    const result = await pool.query(
      `DELETE FROM recruiting_boards
       WHERE id = $1 AND group_id = $2 AND is_personal = FALSE AND class_year = 0
       RETURNING id`,
      [boardId, groupId]
    );
    if (!result.rows[0]) throw new Error('Board not found in this group');
    return { success: true };
  }

  // Rename a board (asserts membership in the given group).
  static async renameGroupBoard(boardId, groupId, newName) {
    const trimmed = (newName || '').trim();
    if (!trimmed) throw new Error('Board name is required');
    if (trimmed.length > 100) throw new Error('Board name must be 100 characters or less');

    const result = await pool.query(
      `UPDATE recruiting_boards
       SET board_name = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND group_id = $3 AND is_personal = FALSE AND class_year = 0
       RETURNING id, board_name`,
      [trimmed, boardId, groupId]
    );
    if (!result.rows[0]) throw new Error('Board not found in this group');
    return result.rows[0];
  }

  // Get a single board (with config + players) inside a group.
  static async getGroupBoardById(boardId, groupId) {
    const result = await pool.query(
      `SELECT id, board_name, offense_positions, defense_positions, players, created_at, updated_at
       FROM recruiting_boards
       WHERE id = $1 AND group_id = $2 AND is_personal = FALSE AND class_year = 0`,
      [boardId, groupId]
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    if (typeof row.players === 'string') row.players = JSON.parse(row.players);
    return row;
  }

  // Save position config for a group board.
  static async saveGroupBoardConfig(boardId, groupId, offensePositions, defensePositions) {
    const result = await pool.query(
      `UPDATE recruiting_boards
       SET offense_positions = $1, defense_positions = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND group_id = $4 AND is_personal = FALSE AND class_year = 0
       RETURNING id`,
      [JSON.stringify(offensePositions), JSON.stringify(defensePositions), boardId, groupId]
    );
    if (!result.rows[0]) throw new Error('Board not found in this group');
    return { success: true };
  }

  // Get players from a group board.
  static async getPlayersFromGroupBoardById(boardId, groupId) {
    const board = await this.getGroupBoardById(boardId, groupId);
    if (!board) return [];
    return board.players || [];
  }

  // Add a player to a group board. Accepts user_id OR pool_entry_id; see
  // addPlayerToPersonalBoardById for the dual-source rationale.
  static async addPlayerToGroupBoardById(boardId, groupId, playerData) {
    const board = await this.getGroupBoardById(boardId, groupId);
    if (!board) throw new Error('Board not found in this group');

    const players = board.players || [];
    if (this._isPlayerAlreadyOnBoard(players, playerData)) {
      throw new Error('Player already on board for this position');
    }

    const toStore = {
      ...playerData,
      source: playerData.user_id ? 'dr_profile' : 'questionnaire',
      added_at: new Date().toISOString(),
    };
    delete toStore.class_year;
    players.push(toStore);

    await pool.query(
      `UPDATE recruiting_boards
       SET players = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND group_id = $3 AND is_personal = FALSE AND class_year = 0`,
      [JSON.stringify(players), boardId, groupId]
    );
    return { success: true };
  }

  // Remove a player from a group board.
  static async removePlayerFromGroupBoardById(boardId, groupId, playerId, position) {
    const board = await this.getGroupBoardById(boardId, groupId);
    if (!board) throw new Error('Board not found in this group');

    const players = board.players || [];
    const updated = players.filter(
      p => !(this._matchPlayerByAnyId(p, playerId) && (!position || p.position === position))
    );

    await pool.query(
      `UPDATE recruiting_boards
       SET players = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND group_id = $3 AND is_personal = FALSE AND class_year = 0`,
      [JSON.stringify(updated), boardId, groupId]
    );
    return { success: true };
  }

  // Update a player's position on a group board (drag/drop).
  static async updatePlayerPositionOnGroupBoardById(boardId, groupId, playerId, oldPosition, newPosition) {
    const board = await this.getGroupBoardById(boardId, groupId);
    if (!board) throw new Error('Board not found in this group');

    const players = board.players || [];
    const idx = players.findIndex(
      p => this._matchPlayerByAnyId(p, playerId) && p.position === oldPosition
    );
    if (idx === -1) throw new Error('Player not found in specified position');

    players[idx].position = newPosition;

    await pool.query(
      `UPDATE recruiting_boards
       SET players = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND group_id = $3 AND is_personal = FALSE AND class_year = 0`,
      [JSON.stringify(players), boardId, groupId]
    );
    return { success: true };
  }

  // Group-board equivalent of updateFinalOnPersonalBoardById. Same semantics:
  // grading_history is frozen, only the final synthesis + audit stamps mutate.
  // Permission gating happens at the route layer (requireGroupAccess('editor')).
  static async updateFinalOnGroupBoardById(boardId, groupId, playerId, position, finalData) {
    const board = await this.getGroupBoardById(boardId, groupId);
    if (!board) throw new Error('Board not found in this group');

    const players = board.players || [];
    const idx = players.findIndex(
      p => this._matchPlayerByAnyId(p, playerId) && p.position === position
    );
    if (idx === -1) throw new Error('Player not found in specified position');

    players[idx].final_grade = (finalData.final_grade !== undefined) ? finalData.final_grade : players[idx].final_grade;
    players[idx].final_color_tag = (finalData.final_color_tag !== undefined) ? finalData.final_color_tag : players[idx].final_color_tag;
    players[idx].final_notes = (finalData.final_notes !== undefined) ? finalData.final_notes : players[idx].final_notes;
    players[idx].promoted_by_user_id = finalData.promoted_by_user_id;
    players[idx].promoted_by_name = finalData.promoted_by_name;
    players[idx].promoted_at = finalData.promoted_at;

    await pool.query(
      `UPDATE recruiting_boards
       SET players = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND group_id = $3 AND is_personal = FALSE AND class_year = 0`,
      [JSON.stringify(players), boardId, groupId]
    );
    return { success: true };
  }

  // ==================== Cross-board lookups ====================

  // Check if a player is on any of the coach's boards: personal boards + every
  // group board in every group the coach belongs to. Used by the player-profile
  // "Add to Recruiting Board" button to show which boards a player is already on.
  static async checkPlayerOnBoards(userId, playerId) {
    const entries = [];

    // Personal boards (multi-named or legacy single — both keyed by owner_user_id).
    const personalResult = await pool.query(
      `SELECT id, board_name, players FROM recruiting_boards
       WHERE owner_user_id = $1 AND is_personal = TRUE AND class_year = 0`,
      [userId]
    );

    for (const row of personalResult.rows) {
      let players = row.players || [];
      if (typeof players === 'string') players = JSON.parse(players);
      const matches = players.filter(p => String(p.user_id) === String(playerId));
      for (const entry of matches) {
        entries.push({
          position: entry.position,
          board_type: 'personal',
          board_id: row.id,
          board_name: row.board_name || 'Personal Board'
        });
      }
    }

    // Group boards: every board in every group the coach is a member of.
    const groupBoardsResult = await pool.query(
      `SELECT rb.id, rb.board_name, rb.players, rb.group_id, g.group_name, m.permission
       FROM recruiting_boards rb
       JOIN board_group_members m ON m.group_id = rb.group_id AND m.user_id = $1
       JOIN board_groups g ON g.id = rb.group_id
       WHERE rb.is_personal = FALSE AND rb.class_year = 0`,
      [userId]
    );

    for (const row of groupBoardsResult.rows) {
      let players = row.players || [];
      if (typeof players === 'string') players = JSON.parse(players);
      const matches = players.filter(p => String(p.user_id) === String(playerId));
      for (const entry of matches) {
        entries.push({
          position: entry.position,
          board_type: 'group',
          board_id: row.id,
          group_id: row.group_id,
          board_name: `${row.board_name} (${row.group_name})`,
          my_permission: row.permission
        });
      }
    }

    return {
      isOnBoard: entries.length > 0,
      entries
    };
  }

  /**
   * Find every shared (group) board the coach is a member of that contains the
   * given recruit. Drives the Final Grade tab in the unified info modal. Each
   * promotion carries enough state to render + save the final synthesis without
   * a second fetch: position (required by the PUT route), final_*, audit
   * fields, can_edit (true if coach has 'editor' permission in the group).
   *
   * Personal boards are intentionally NOT included — those are private per
   * coach and don't need a shared Final Grade workflow.
   */
  static async getBoardPromotionsForRecruit(userId, { poolEntryId, linkedPlayerUserId }) {
    if (!poolEntryId && !linkedPlayerUserId) return [];
    const result = await pool.query(
      `SELECT rb.id AS board_id, rb.board_name, rb.players,
              rb.group_id, g.group_name, m.permission
         FROM recruiting_boards rb
         JOIN board_group_members m ON m.group_id = rb.group_id AND m.user_id = $1
         JOIN board_groups g ON g.id = rb.group_id
        WHERE rb.is_personal = FALSE AND rb.class_year = 0`,
      [userId]
    );

    const promotions = [];
    for (const row of result.rows) {
      let players = row.players || [];
      if (typeof players === 'string') players = JSON.parse(players);
      for (const p of players) {
        const matchesUser = linkedPlayerUserId && p.user_id != null && String(p.user_id) === String(linkedPlayerUserId);
        const matchesPool = poolEntryId && p.pool_entry_id != null && String(p.pool_entry_id) === String(poolEntryId);
        if (!matchesUser && !matchesPool) continue;
        promotions.push({
          group_id: row.group_id,
          group_name: row.group_name,
          board_id: row.board_id,
          board_name: row.board_name,
          position: p.position,
          final_grade: p.final_grade != null ? p.final_grade : null,
          final_color_tag: p.final_color_tag || null,
          final_notes: p.final_notes || null,
          promoted_by_user_id: p.promoted_by_user_id || null,
          promoted_by_name: p.promoted_by_name || null,
          promoted_at: p.promoted_at || null,
          can_edit: row.permission === 'editor',
        });
      }
    }
    return promotions;
  }

  /**
   * Duplicate-on-board guard. Matches on either user_id (DR-account recruits)
   * or pool_entry_id (questionnaire-only recruits) — whichever the incoming
   * playerData carries. Also gates on position so the same player CAN appear
   * at multiple positions on the same board (existing Plan 1 behavior).
   */
  static _isPlayerAlreadyOnBoard(players, playerData) {
    if (!Array.isArray(players) || players.length === 0) return false;
    if (playerData.user_id) {
      return players.some(p => p.user_id === playerData.user_id && p.position === playerData.position);
    }
    if (playerData.pool_entry_id) {
      return players.some(p => p.pool_entry_id === playerData.pool_entry_id && p.position === playerData.position);
    }
    return false;
  }

  /**
   * Match a stored player by the front-end-supplied `playerId`. Used by the
   * remove and move-position endpoints, which pass a single UUID that's
   * either the player's user_id (DR-account recruit) OR pool_entry_id
   * (questionnaire-only recruit pulled forward from Plan 6).
   */
  static _matchPlayerByAnyId(p, playerId) {
    const id = String(playerId);
    return String(p.user_id) === id || String(p.pool_entry_id) === id;
  }
}

module.exports = RecruitingBoard;
