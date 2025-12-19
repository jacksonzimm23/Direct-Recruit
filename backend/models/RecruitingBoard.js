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

  // Get the coach's shared position configuration (uses class_year = 0 as config row)
  static async getPositionConfig(coachUserId) {
    const result = await pool.query(
      `SELECT offense_positions, defense_positions FROM recruiting_boards
       WHERE coach_user_id = $1 AND class_year = 0`,
      [coachUserId]
    );

    if (result.rows[0]) {
      return {
        offensePositions: result.rows[0].offense_positions,
        defensePositions: result.rows[0].defense_positions
      };
    }

    // Return defaults if no config exists
    return {
      offensePositions: this.DEFAULT_OFFENSE_POSITIONS,
      defensePositions: this.DEFAULT_DEFENSE_POSITIONS,
      isDefault: true
    };
  }

  // Save the coach's shared position configuration
  static async savePositionConfig(coachUserId, offensePositions, defensePositions) {
    const result = await pool.query(
      `INSERT INTO recruiting_boards (coach_user_id, class_year, offense_positions, defense_positions, players)
       VALUES ($1, 0, $2, $3, '[]'::jsonb)
       ON CONFLICT (coach_user_id, class_year)
       DO UPDATE SET
         offense_positions = $2,
         defense_positions = $3,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [coachUserId, JSON.stringify(offensePositions), JSON.stringify(defensePositions)]
    );
    return result.rows[0];
  }

  // Get board for a specific class year (only players, positions come from shared config)
  static async getByCoachAndYear(coachUserId, classYear) {
    const result = await pool.query(
      `SELECT * FROM recruiting_boards
       WHERE coach_user_id = $1 AND class_year = $2`,
      [coachUserId, classYear]
    );
    return result.rows[0];
  }

  // Get all boards for a coach (excluding the config row at class_year = 0)
  static async getAllByCoach(coachUserId) {
    const result = await pool.query(
      `SELECT * FROM recruiting_boards
       WHERE coach_user_id = $1 AND class_year > 0
       ORDER BY class_year`,
      [coachUserId]
    );
    return result.rows;
  }

  // Delete a board
  static async delete(coachUserId, classYear) {
    const result = await pool.query(
      `DELETE FROM recruiting_boards
       WHERE coach_user_id = $1 AND class_year = $2
       RETURNING *`,
      [coachUserId, classYear]
    );
    return result.rows[0];
  }

  // Add a player to the board
  static async addPlayer(coachUserId, classYear, playerData) {
    // First, get or create the board for this year
    let board = await this.getByCoachAndYear(coachUserId, classYear);

    if (!board) {
      // Create a new board for this class year (positions are stored separately)
      const createResult = await pool.query(
        `INSERT INTO recruiting_boards (coach_user_id, class_year, offense_positions, defense_positions, players)
         VALUES ($1, $2, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)
         RETURNING *`,
        [coachUserId, classYear]
      );
      board = createResult.rows[0];
    }

    // Get current players array
    let players = board.players || [];
    if (typeof players === 'string') {
      players = JSON.parse(players);
    }

    // Check if player already exists for this position
    const existingPlayer = players.find(
      p => p.user_id === playerData.user_id && p.position === playerData.position
    );
    if (existingPlayer) {
      throw new Error('Player already on board for this position');
    }

    // Add timestamp to player data
    playerData.added_at = new Date().toISOString();

    // Add player to array
    players.push(playerData);

    // Update the board with new players array
    const result = await pool.query(
      `UPDATE recruiting_boards
       SET players = $1, updated_at = CURRENT_TIMESTAMP
       WHERE coach_user_id = $2 AND class_year = $3
       RETURNING *`,
      [JSON.stringify(players), coachUserId, classYear]
    );

    return result.rows[0];
  }

  // Get players for a board
  static async getPlayers(coachUserId, classYear) {
    const board = await this.getByCoachAndYear(coachUserId, classYear);
    if (!board || !board.players) {
      return [];
    }

    let players = board.players;
    if (typeof players === 'string') {
      players = JSON.parse(players);
    }

    return players;
  }

  // Remove a player from the board
  static async removePlayer(coachUserId, classYear, playerId, position) {
    const board = await this.getByCoachAndYear(coachUserId, classYear);
    if (!board) {
      throw new Error('Board not found');
    }

    let players = board.players || [];
    if (typeof players === 'string') {
      players = JSON.parse(players);
    }

    // Filter out the player with matching user_id and position
    const updatedPlayers = players.filter(
      p => !(p.user_id === playerId && (!position || p.position === position))
    );

    // Update the board
    const result = await pool.query(
      `UPDATE recruiting_boards
       SET players = $1, updated_at = CURRENT_TIMESTAMP
       WHERE coach_user_id = $2 AND class_year = $3
       RETURNING *`,
      [JSON.stringify(updatedPlayers), coachUserId, classYear]
    );

    return result.rows[0];
  }

  // Check if a player is on any of the coach's recruiting boards
  static async checkPlayerOnBoard(coachUserId, playerId) {
    // Get all boards for this coach (excluding config row at class_year = 0)
    const result = await pool.query(
      `SELECT class_year, players FROM recruiting_boards
       WHERE coach_user_id = $1 AND class_year > 0`,
      [coachUserId]
    );

    const entries = [];

    for (const row of result.rows) {
      let players = row.players || [];
      if (typeof players === 'string') {
        players = JSON.parse(players);
      }

      // Find all entries for this player in this board
      const playerEntries = players.filter(p => String(p.user_id) === String(playerId));
      for (const entry of playerEntries) {
        entries.push({
          class_year: row.class_year,
          position: entry.position
        });
      }
    }

    return {
      isOnBoard: entries.length > 0,
      entries: entries
    };
  }

  // ==================== Collaborator Methods ====================

  // Get board info including owner and collaborators
  static async getBoardInfo(coachUserId) {
    // First, try to find a board where the user is the owner (handles transferred ownership)
    // This checks for boards where owner_user_id = coachUserId but coach_user_id might be different
    let result = await pool.query(
      `SELECT rb.*,
              cp.first_name as owner_first_name,
              cp.last_name as owner_last_name,
              cp.profile_image_url as owner_profile_image,
              cp.college_name as owner_college
       FROM recruiting_boards rb
       LEFT JOIN coach_profiles cp ON rb.owner_user_id = cp.user_id
       WHERE rb.owner_user_id = $1 AND rb.class_year = 0`,
      [coachUserId]
    );

    // If not found as owner, check if they have their own board (coach_user_id = coachUserId)
    if (!result.rows[0]) {
      result = await pool.query(
        `SELECT rb.*,
                cp.first_name as owner_first_name,
                cp.last_name as owner_last_name,
                cp.profile_image_url as owner_profile_image,
                cp.college_name as owner_college
         FROM recruiting_boards rb
         LEFT JOIN coach_profiles cp ON rb.owner_user_id = cp.user_id
         WHERE rb.coach_user_id = $1 AND rb.class_year = 0`,
        [coachUserId]
      );
    }

    if (!result.rows[0]) {
      // No config exists yet, return default owner info
      return {
        owner_user_id: coachUserId,
        coach_user_id: coachUserId, // Default to same as owner when no board exists
        collab: [],
        isOwner: true
      };
    }

    const row = result.rows[0];
    let collab = row.collab || [];
    if (typeof collab === 'string') {
      collab = JSON.parse(collab);
    }

    return {
      owner_user_id: row.owner_user_id || coachUserId,
      coach_user_id: row.coach_user_id, // Include the original board creator ID
      owner_first_name: row.owner_first_name,
      owner_last_name: row.owner_last_name,
      owner_profile_image: row.owner_profile_image,
      owner_college: row.owner_college,
      collab: collab,
      isOwner: String(row.owner_user_id || coachUserId) === String(coachUserId)
    };
  }

  // Initialize board owner if not set
  static async initializeBoardOwner(coachUserId) {
    // Check if config row exists
    const existing = await pool.query(
      `SELECT id, owner_user_id FROM recruiting_boards WHERE coach_user_id = $1 AND class_year = 0`,
      [coachUserId]
    );

    if (existing.rows[0]) {
      // Update owner if not set
      if (!existing.rows[0].owner_user_id) {
        await pool.query(
          `UPDATE recruiting_boards SET owner_user_id = $1 WHERE coach_user_id = $1 AND class_year = 0`,
          [coachUserId]
        );
      }
    } else {
      // Create config row with owner
      await pool.query(
        `INSERT INTO recruiting_boards (coach_user_id, class_year, offense_positions, defense_positions, players, owner_user_id, collab)
         VALUES ($1, 0, $2, $3, '[]'::jsonb, $1, '[]'::jsonb)`,
        [coachUserId, JSON.stringify(this.DEFAULT_OFFENSE_POSITIONS), JSON.stringify(this.DEFAULT_DEFENSE_POSITIONS)]
      );
    }
  }

  // Get collaborator details with profile info
  static async getCollaboratorsWithDetails(coachUserId, boardInfo = null) {
    // Use provided boardInfo or fetch it
    if (!boardInfo) {
      boardInfo = await this.getBoardInfo(coachUserId);
    }

    if (!boardInfo.collab || boardInfo.collab.length === 0) {
      return [];
    }

    // Get profile info for each collaborator
    const result = await pool.query(
      `SELECT cp.user_id, cp.first_name, cp.last_name, cp.profile_image_url, cp.college_name, cp.username
       FROM coach_profiles cp
       WHERE cp.user_id = ANY($1::uuid[])`,
      [boardInfo.collab]
    );

    return result.rows;
  }

  // Add a collaborator to the board
  static async addCollaborator(ownerUserId, collaboratorUserId) {
    // First verify the owner actually owns this board
    const boardInfo = await this.getBoardInfo(ownerUserId);
    if (String(boardInfo.owner_user_id) !== String(ownerUserId)) {
      throw new Error('Only the board owner can add collaborators');
    }

    // Get current collaborators
    let collab = boardInfo.collab || [];

    // Check if already a collaborator
    if (collab.includes(collaboratorUserId) || collab.includes(String(collaboratorUserId))) {
      throw new Error('User is already a collaborator');
    }

    // Add collaborator
    collab.push(collaboratorUserId);

    // Update the database using coach_user_id from boardInfo (handles transferred ownership)
    await pool.query(
      `UPDATE recruiting_boards
       SET collab = $1, updated_at = CURRENT_TIMESTAMP
       WHERE coach_user_id = $2 AND class_year = 0`,
      [JSON.stringify(collab), boardInfo.coach_user_id]
    );

    return { success: true };
  }

  // Remove a collaborator from the board
  static async removeCollaborator(ownerUserId, collaboratorUserId) {
    const boardInfo = await this.getBoardInfo(ownerUserId);
    if (String(boardInfo.owner_user_id) !== String(ownerUserId)) {
      throw new Error('Only the board owner can remove collaborators');
    }

    let collab = boardInfo.collab || [];
    collab = collab.filter(id => String(id) !== String(collaboratorUserId));

    // Update using coach_user_id from boardInfo (handles transferred ownership)
    await pool.query(
      `UPDATE recruiting_boards
       SET collab = $1, updated_at = CURRENT_TIMESTAMP
       WHERE coach_user_id = $2 AND class_year = 0`,
      [JSON.stringify(collab), boardInfo.coach_user_id]
    );

    return { success: true };
  }

  // Leave a shared board (for collaborators)
  static async leaveBoard(collaboratorUserId, ownerUserId) {
    // Get board info by owner to find the correct board
    const boardInfo = await this.getBoardInfo(ownerUserId);

    let collab = boardInfo.collab || [];
    collab = collab.filter(id => String(id) !== String(collaboratorUserId));

    // Update using coach_user_id from boardInfo (handles transferred ownership)
    await pool.query(
      `UPDATE recruiting_boards
       SET collab = $1, updated_at = CURRENT_TIMESTAMP
       WHERE coach_user_id = $2 AND class_year = 0`,
      [JSON.stringify(collab), boardInfo.coach_user_id]
    );

    return { success: true };
  }

  // Transfer board ownership
  static async transferOwnership(currentOwnerUserId, newOwnerUserId) {
    const boardInfo = await this.getBoardInfo(currentOwnerUserId);
    if (String(boardInfo.owner_user_id) !== String(currentOwnerUserId)) {
      throw new Error('Only the board owner can transfer ownership');
    }

    // Remove new owner from collaborators and add current owner
    let collab = boardInfo.collab || [];
    collab = collab.filter(id => String(id) !== String(newOwnerUserId));
    collab.push(currentOwnerUserId);

    // Update using coach_user_id from boardInfo (handles transferred ownership)
    await pool.query(
      `UPDATE recruiting_boards
       SET owner_user_id = $1, collab = $2, updated_at = CURRENT_TIMESTAMP
       WHERE coach_user_id = $3 AND class_year = 0`,
      [newOwnerUserId, JSON.stringify(collab), boardInfo.coach_user_id]
    );

    return { success: true };
  }

  // Get all boards where user is a collaborator
  static async getSharedBoards(userId) {
    const result = await pool.query(
      `SELECT rb.coach_user_id, rb.owner_user_id, rb.collab,
              cp.first_name as owner_first_name,
              cp.last_name as owner_last_name,
              cp.profile_image_url as owner_profile_image,
              cp.college_name as owner_college
       FROM recruiting_boards rb
       JOIN coach_profiles cp ON rb.owner_user_id = cp.user_id
       WHERE rb.class_year = 0
         AND rb.collab::jsonb ? $1`,
      [userId]
    );

    return result.rows;
  }

  // Check if user has access to a board (either owner or collaborator)
  static async hasAccessToBoard(userId, boardOwnerUserId) {
    const boardInfo = await this.getBoardInfo(boardOwnerUserId);

    // Check if user is owner
    if (String(boardInfo.owner_user_id) === String(userId)) {
      return { hasAccess: true, role: 'owner' };
    }

    // Check if user is collaborator
    const collab = boardInfo.collab || [];
    if (collab.some(id => String(id) === String(userId))) {
      return { hasAccess: true, role: 'collaborator' };
    }

    return { hasAccess: false, role: null };
  }

  // Update a player's position when dragged to a different column
  static async updatePlayerPosition(coachUserId, classYear, playerId, oldPosition, newPosition) {
    const board = await this.getByCoachAndYear(coachUserId, classYear);
    if (!board) {
      throw new Error('Board not found');
    }

    let players = board.players || [];
    if (typeof players === 'string') {
      players = JSON.parse(players);
    }

    // Find the player with matching user_id and old position
    const playerIndex = players.findIndex(
      p => String(p.user_id) === String(playerId) && p.position === oldPosition
    );

    if (playerIndex === -1) {
      throw new Error('Player not found in specified position');
    }

    // Update the position
    players[playerIndex].position = newPosition;

    // Save updated players array
    const result = await pool.query(
      `UPDATE recruiting_boards
       SET players = $1, updated_at = CURRENT_TIMESTAMP
       WHERE coach_user_id = $2 AND class_year = $3
       RETURNING *`,
      [JSON.stringify(players), coachUserId, classYear]
    );

    return result.rows[0];
  }
}

module.exports = RecruitingBoard;
