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

  // ==================== Personal Board Methods ====================

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

  // ==================== Shared Board Methods ====================

  // Create a new shared board
  static async createSharedBoard(ownerUserId, boardName, initialCollaborators = []) {
    const result = await pool.query(
      `INSERT INTO recruiting_boards (owner_user_id, class_year, board_name, offense_positions, defense_positions, players, is_personal, collab)
       VALUES ($1, 0, $2, $3, $4, '[]'::jsonb, FALSE, $5)
       RETURNING *`,
      [
        ownerUserId,
        boardName,
        JSON.stringify(this.DEFAULT_OFFENSE_POSITIONS),
        JSON.stringify(this.DEFAULT_DEFENSE_POSITIONS),
        JSON.stringify(initialCollaborators)
      ]
    );
    return result.rows[0];
  }

  // Get all shared boards owned by a user
  static async getOwnedSharedBoards(userId) {
    const result = await pool.query(
      `SELECT rb.*,
              cp.first_name as owner_first_name,
              cp.last_name as owner_last_name,
              cp.profile_image_url as owner_profile_image,
              cp.college_name as owner_college
       FROM recruiting_boards rb
       LEFT JOIN coach_profiles cp ON rb.owner_user_id = cp.user_id
       WHERE rb.owner_user_id = $1 AND rb.is_personal = FALSE AND rb.class_year = 0
       ORDER BY rb.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  // Get all shared boards where user is a collaborator
  static async getCollaboratorBoards(userId) {
    const result = await pool.query(
      `SELECT rb.id, rb.owner_user_id, rb.board_name, rb.collab,
              cp.first_name as owner_first_name,
              cp.last_name as owner_last_name,
              cp.profile_image_url as owner_profile_image,
              cp.college_name as owner_college
       FROM recruiting_boards rb
       JOIN coach_profiles cp ON rb.owner_user_id = cp.user_id
       WHERE rb.class_year = 0
         AND rb.is_personal = FALSE
         AND rb.collab::jsonb ? $1`,
      [userId]
    );
    return result.rows;
  }

  // Get shared board by ID with details
  static async getSharedBoardById(boardId) {
    const result = await pool.query(
      `SELECT rb.*,
              cp.first_name as owner_first_name,
              cp.last_name as owner_last_name,
              cp.profile_image_url as owner_profile_image,
              cp.college_name as owner_college
       FROM recruiting_boards rb
       LEFT JOIN coach_profiles cp ON rb.owner_user_id = cp.user_id
       WHERE rb.id = $1 AND rb.class_year = 0`,
      [boardId]
    );

    if (!result.rows[0]) return null;

    const row = result.rows[0];
    let collab = row.collab || [];
    if (typeof collab === 'string') {
      collab = JSON.parse(collab);
    }

    return {
      ...row,
      collab
    };
  }

  // Update shared board name
  static async updateBoardName(boardId, ownerUserId, newName) {
    const result = await pool.query(
      `UPDATE recruiting_boards
       SET board_name = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND owner_user_id = $3 AND class_year = 0
       RETURNING *`,
      [newName, boardId, ownerUserId]
    );
    return result.rows[0];
  }

  // Delete a shared board
  static async deleteSharedBoard(boardId, ownerUserId) {
    // Delete all class year rows for this board first
    await pool.query(
      `DELETE FROM recruiting_boards
       WHERE owner_user_id = $1 AND board_name = (
         SELECT board_name FROM recruiting_boards WHERE id = $2
       )`,
      [ownerUserId, boardId]
    );

    return { success: true };
  }

  // ==================== Collaborator Methods ====================

  // Add collaborator to a shared board
  static async addCollaborator(boardId, ownerUserId, collaboratorUserId) {
    const board = await this.getSharedBoardById(boardId);

    if (!board) {
      throw new Error('Board not found');
    }

    if (String(board.owner_user_id) !== String(ownerUserId)) {
      throw new Error('Only the board owner can add collaborators');
    }

    let collab = board.collab || [];

    if (collab.some(id => String(id) === String(collaboratorUserId))) {
      throw new Error('User is already a collaborator');
    }

    collab.push(collaboratorUserId);

    await pool.query(
      `UPDATE recruiting_boards
       SET collab = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [JSON.stringify(collab), boardId]
    );

    return { success: true };
  }

  // Remove collaborator from a shared board
  static async removeCollaborator(boardId, ownerUserId, collaboratorUserId) {
    const board = await this.getSharedBoardById(boardId);

    if (!board) {
      throw new Error('Board not found');
    }

    if (String(board.owner_user_id) !== String(ownerUserId)) {
      throw new Error('Only the board owner can remove collaborators');
    }

    let collab = board.collab || [];
    collab = collab.filter(id => String(id) !== String(collaboratorUserId));

    await pool.query(
      `UPDATE recruiting_boards
       SET collab = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [JSON.stringify(collab), boardId]
    );

    return { success: true };
  }

  // Leave a shared board (for collaborators)
  static async leaveBoard(boardId, collaboratorUserId) {
    const board = await this.getSharedBoardById(boardId);

    if (!board) {
      throw new Error('Board not found');
    }

    let collab = board.collab || [];
    collab = collab.filter(id => String(id) !== String(collaboratorUserId));

    await pool.query(
      `UPDATE recruiting_boards
       SET collab = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [JSON.stringify(collab), boardId]
    );

    return { success: true };
  }

  // Transfer ownership of a shared board
  static async transferOwnership(boardId, currentOwnerUserId, newOwnerUserId) {
    const board = await this.getSharedBoardById(boardId);

    if (!board) {
      throw new Error('Board not found');
    }

    if (String(board.owner_user_id) !== String(currentOwnerUserId)) {
      throw new Error('Only the board owner can transfer ownership');
    }

    // Remove new owner from collaborators and add current owner
    let collab = board.collab || [];
    collab = collab.filter(id => String(id) !== String(newOwnerUserId));
    collab.push(currentOwnerUserId);

    await pool.query(
      `UPDATE recruiting_boards
       SET owner_user_id = $1, collab = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [newOwnerUserId, JSON.stringify(collab), boardId]
    );

    return { success: true };
  }

  // Get collaborators with details for a board
  static async getCollaboratorsWithDetails(boardId) {
    const board = await this.getSharedBoardById(boardId);

    if (!board || !board.collab || board.collab.length === 0) {
      return [];
    }

    const result = await pool.query(
      `SELECT cp.user_id, cp.first_name, cp.last_name, cp.profile_image_url, cp.college_name, cp.username
       FROM coach_profiles cp
       WHERE cp.user_id = ANY($1::uuid[])`,
      [board.collab]
    );

    return result.rows;
  }

  // Check if user has access to a board
  static async hasAccessToBoard(userId, boardId) {
    const board = await this.getSharedBoardById(boardId);

    if (!board) {
      return { hasAccess: false, role: null };
    }

    if (String(board.owner_user_id) === String(userId)) {
      return { hasAccess: true, role: 'owner' };
    }

    const collab = board.collab || [];
    if (collab.some(id => String(id) === String(userId))) {
      return { hasAccess: true, role: 'collaborator' };
    }

    return { hasAccess: false, role: null };
  }

  // ==================== Player Methods ====================

  // Get board by owner and year (for personal boards)
  static async getPersonalBoardByYear(userId, classYear) {
    // Always get the single personal board config row (class_year=0)
    const result = await pool.query(
      `SELECT * FROM recruiting_boards
       WHERE owner_user_id = $1 AND is_personal = TRUE AND class_year = 0`,
      [userId]
    );

    if (!result.rows[0]) return null;

    const board = result.rows[0];

    // Filter players by class_year if classYear > 0
    if (classYear > 0) {
      let players = board.players || [];
      if (typeof players === 'string') {
        players = JSON.parse(players);
      }
      // Return a copy with filtered players for this class year
      return {
        ...board,
        players: players.filter(p => p.class_year === classYear)
      };
    }

    return board;
  }

  // Get shared board by ID and year
  static async getSharedBoardByYear(boardId, classYear) {
    // First get the board name from the config row
    const configResult = await pool.query(
      `SELECT board_name, owner_user_id FROM recruiting_boards WHERE id = $1`,
      [boardId]
    );

    if (!configResult.rows[0]) return null;

    const { board_name, owner_user_id } = configResult.rows[0];

    const result = await pool.query(
      `SELECT * FROM recruiting_boards
       WHERE owner_user_id = $1 AND board_name = $2 AND class_year = $3`,
      [owner_user_id, board_name, classYear]
    );
    return result.rows[0];
  }

  // Add player to personal board
  static async addPlayerToPersonalBoard(userId, classYear, playerData) {
    // Always use the single config row (class_year=0)
    let board = await this.getOrCreatePersonalBoard(userId);

    // Get ALL players from the config row (not filtered by year)
    let players = board.players || [];
    if (typeof players === 'string') {
      players = JSON.parse(players);
    }

    // Check if player already exists for this position AND class year
    if (players.some(p => p.user_id === playerData.user_id && p.position === playerData.position && p.class_year === classYear)) {
      throw new Error('Player already on board for this position');
    }

    // Store class_year in player data
    playerData.class_year = classYear;
    playerData.added_at = new Date().toISOString();
    players.push(playerData);

    const result = await pool.query(
      `UPDATE recruiting_boards
       SET players = $1, updated_at = CURRENT_TIMESTAMP
       WHERE owner_user_id = $2 AND is_personal = TRUE AND class_year = 0
       RETURNING *`,
      [JSON.stringify(players), userId]
    );

    return result.rows[0];
  }

  // Add player to shared board
  static async addPlayerToSharedBoard(boardId, classYear, playerData) {
    // Get the board config to find owner and board_name
    const configResult = await pool.query(
      `SELECT board_name, owner_user_id FROM recruiting_boards WHERE id = $1`,
      [boardId]
    );

    if (!configResult.rows[0]) {
      throw new Error('Board not found');
    }

    const { board_name, owner_user_id } = configResult.rows[0];

    let board = await pool.query(
      `SELECT * FROM recruiting_boards
       WHERE owner_user_id = $1 AND board_name = $2 AND class_year = $3`,
      [owner_user_id, board_name, classYear]
    );

    if (!board.rows[0]) {
      // Create board for this class year
      const result = await pool.query(
        `INSERT INTO recruiting_boards (owner_user_id, class_year, board_name, offense_positions, defense_positions, players, is_personal, collab)
         VALUES ($1, $2, $3, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, FALSE, '[]'::jsonb)
         RETURNING *`,
        [owner_user_id, classYear, board_name]
      );
      board = { rows: [result.rows[0]] };
    }

    let players = board.rows[0].players || [];
    if (typeof players === 'string') {
      players = JSON.parse(players);
    }

    if (players.some(p => p.user_id === playerData.user_id && p.position === playerData.position)) {
      throw new Error('Player already on board for this position');
    }

    playerData.added_at = new Date().toISOString();
    players.push(playerData);

    const result = await pool.query(
      `UPDATE recruiting_boards
       SET players = $1, updated_at = CURRENT_TIMESTAMP
       WHERE owner_user_id = $2 AND board_name = $3 AND class_year = $4
       RETURNING *`,
      [JSON.stringify(players), owner_user_id, board_name, classYear]
    );

    return result.rows[0];
  }

  // Get players from personal board
  static async getPlayersFromPersonalBoard(userId, classYear) {
    // Get the single config row (class_year=0)
    const board = await this.getOrCreatePersonalBoard(userId);
    if (!board || !board.players) return [];

    let players = board.players;
    if (typeof players === 'string') {
      players = JSON.parse(players);
    }

    // Filter by class_year
    return players.filter(p => p.class_year === classYear);
  }

  // Get players from shared board
  static async getPlayersFromSharedBoard(boardId, classYear) {
    const configResult = await pool.query(
      `SELECT board_name, owner_user_id FROM recruiting_boards WHERE id = $1`,
      [boardId]
    );

    if (!configResult.rows[0]) return [];

    const { board_name, owner_user_id } = configResult.rows[0];

    const result = await pool.query(
      `SELECT players FROM recruiting_boards
       WHERE owner_user_id = $1 AND board_name = $2 AND class_year = $3`,
      [owner_user_id, board_name, classYear]
    );

    if (!result.rows[0] || !result.rows[0].players) return [];

    let players = result.rows[0].players;
    if (typeof players === 'string') {
      players = JSON.parse(players);
    }
    return players;
  }

  // Remove player from personal board
  static async removePlayerFromPersonalBoard(userId, classYear, playerId, position) {
    // Get the single config row (class_year=0)
    const board = await this.getOrCreatePersonalBoard(userId);
    if (!board) throw new Error('Board not found');

    // Get ALL players from config row
    let players = board.players || [];
    if (typeof players === 'string') {
      players = JSON.parse(players);
    }

    // Filter out the player, also matching class_year
    const updatedPlayers = players.filter(
      p => !(p.user_id === playerId && p.class_year === classYear && (!position || p.position === position))
    );

    const result = await pool.query(
      `UPDATE recruiting_boards
       SET players = $1, updated_at = CURRENT_TIMESTAMP
       WHERE owner_user_id = $2 AND is_personal = TRUE AND class_year = 0
       RETURNING *`,
      [JSON.stringify(updatedPlayers), userId]
    );

    return result.rows[0];
  }

  // Remove player from shared board
  static async removePlayerFromSharedBoard(boardId, classYear, playerId, position) {
    const configResult = await pool.query(
      `SELECT board_name, owner_user_id FROM recruiting_boards WHERE id = $1`,
      [boardId]
    );

    if (!configResult.rows[0]) throw new Error('Board not found');

    const { board_name, owner_user_id } = configResult.rows[0];

    const boardResult = await pool.query(
      `SELECT players FROM recruiting_boards
       WHERE owner_user_id = $1 AND board_name = $2 AND class_year = $3`,
      [owner_user_id, board_name, classYear]
    );

    if (!boardResult.rows[0]) throw new Error('Board not found');

    let players = boardResult.rows[0].players || [];
    if (typeof players === 'string') {
      players = JSON.parse(players);
    }

    const updatedPlayers = players.filter(
      p => !(p.user_id === playerId && (!position || p.position === position))
    );

    const result = await pool.query(
      `UPDATE recruiting_boards
       SET players = $1, updated_at = CURRENT_TIMESTAMP
       WHERE owner_user_id = $2 AND board_name = $3 AND class_year = $4
       RETURNING *`,
      [JSON.stringify(updatedPlayers), owner_user_id, board_name, classYear]
    );

    return result.rows[0];
  }

  // Update player position on personal board
  static async updatePlayerPositionOnPersonalBoard(userId, classYear, playerId, oldPosition, newPosition) {
    // Get the single config row (class_year=0)
    const board = await this.getOrCreatePersonalBoard(userId);
    if (!board) throw new Error('Board not found');

    // Get ALL players from config row
    let players = board.players || [];
    if (typeof players === 'string') {
      players = JSON.parse(players);
    }

    // Find the player, also matching class_year
    const playerIndex = players.findIndex(
      p => String(p.user_id) === String(playerId) && p.position === oldPosition && p.class_year === classYear
    );

    if (playerIndex === -1) throw new Error('Player not found in specified position');

    players[playerIndex].position = newPosition;

    const result = await pool.query(
      `UPDATE recruiting_boards
       SET players = $1, updated_at = CURRENT_TIMESTAMP
       WHERE owner_user_id = $2 AND is_personal = TRUE AND class_year = 0
       RETURNING *`,
      [JSON.stringify(players), userId]
    );

    return result.rows[0];
  }

  // Update player position on shared board
  static async updatePlayerPositionOnSharedBoard(boardId, classYear, playerId, oldPosition, newPosition) {
    const configResult = await pool.query(
      `SELECT board_name, owner_user_id FROM recruiting_boards WHERE id = $1`,
      [boardId]
    );

    if (!configResult.rows[0]) throw new Error('Board not found');

    const { board_name, owner_user_id } = configResult.rows[0];

    const boardResult = await pool.query(
      `SELECT players FROM recruiting_boards
       WHERE owner_user_id = $1 AND board_name = $2 AND class_year = $3`,
      [owner_user_id, board_name, classYear]
    );

    if (!boardResult.rows[0]) throw new Error('Board not found');

    let players = boardResult.rows[0].players || [];
    if (typeof players === 'string') {
      players = JSON.parse(players);
    }

    const playerIndex = players.findIndex(
      p => String(p.user_id) === String(playerId) && p.position === oldPosition
    );

    if (playerIndex === -1) throw new Error('Player not found in specified position');

    players[playerIndex].position = newPosition;

    const result = await pool.query(
      `UPDATE recruiting_boards
       SET players = $1, updated_at = CURRENT_TIMESTAMP
       WHERE owner_user_id = $2 AND board_name = $3 AND class_year = $4
       RETURNING *`,
      [JSON.stringify(players), owner_user_id, board_name, classYear]
    );

    return result.rows[0];
  }

  // Check if a player is on any of the coach's boards (personal, owned shared, or collaborator boards)
  static async checkPlayerOnBoards(userId, playerId) {
    const entries = [];

    // Check personal board - now stored in single config row (class_year=0)
    const personalResult = await pool.query(
      `SELECT id, players FROM recruiting_boards
       WHERE owner_user_id = $1 AND is_personal = TRUE AND class_year = 0`,
      [userId]
    );

    if (personalResult.rows[0]) {
      let players = personalResult.rows[0].players || [];
      if (typeof players === 'string') {
        players = JSON.parse(players);
      }

      const playerEntries = players.filter(p => String(p.user_id) === String(playerId));
      for (const entry of playerEntries) {
        entries.push({
          class_year: entry.class_year, // Now stored in player object
          position: entry.position,
          board_type: 'personal',
          board_id: null,
          board_name: 'Personal Board'
        });
      }
    }

    // Check owned shared boards - first get the config rows (class_year=0), then look up player rows
    const ownedBoardsConfig = await pool.query(
      `SELECT id, board_name, owner_user_id FROM recruiting_boards
       WHERE owner_user_id = $1 AND is_personal = FALSE AND class_year = 0`,
      [userId]
    );

    for (const config of ownedBoardsConfig.rows) {
      // Get player rows for this board (same owner_user_id and board_name, class_year > 0)
      const playerRowsResult = await pool.query(
        `SELECT class_year, players FROM recruiting_boards
         WHERE owner_user_id = $1 AND board_name = $2 AND is_personal = FALSE AND class_year > 0`,
        [config.owner_user_id, config.board_name]
      );

      for (const row of playerRowsResult.rows) {
        let players = row.players || [];
        if (typeof players === 'string') {
          players = JSON.parse(players);
        }

        const playerEntries = players.filter(p => String(p.user_id) === String(playerId));
        for (const entry of playerEntries) {
          entries.push({
            class_year: row.class_year,
            position: entry.position,
            board_type: 'shared',
            board_id: config.id, // Use the config row's ID
            board_name: config.board_name
          });
        }
      }
    }

    // Check collaborator boards - first get config rows where user is collaborator
    const collaboratorBoardsConfig = await pool.query(
      `SELECT rb.id, rb.board_name, rb.owner_user_id, cp.first_name, cp.last_name
       FROM recruiting_boards rb
       LEFT JOIN coach_profiles cp ON rb.owner_user_id = cp.user_id
       WHERE rb.is_personal = FALSE
         AND rb.class_year = 0
         AND rb.collab::jsonb ? $1`,
      [userId]
    );

    for (const config of collaboratorBoardsConfig.rows) {
      // Get player rows for this board
      const playerRowsResult = await pool.query(
        `SELECT class_year, players FROM recruiting_boards
         WHERE owner_user_id = $1 AND board_name = $2 AND is_personal = FALSE AND class_year > 0`,
        [config.owner_user_id, config.board_name]
      );

      for (const row of playerRowsResult.rows) {
        let players = row.players || [];
        if (typeof players === 'string') {
          players = JSON.parse(players);
        }

        const playerEntries = players.filter(p => String(p.user_id) === String(playerId));
        for (const entry of playerEntries) {
          const ownerName = config.first_name && config.last_name
            ? `${config.first_name} ${config.last_name}`
            : 'Unknown';
          entries.push({
            class_year: row.class_year,
            position: entry.position,
            board_type: 'shared',
            board_id: config.id, // Use the config row's ID
            board_name: `${config.board_name} (${ownerName})`
          });
        }
      }
    }

    return {
      isOnBoard: entries.length > 0,
      entries
    };
  }
}

module.exports = RecruitingBoard;
