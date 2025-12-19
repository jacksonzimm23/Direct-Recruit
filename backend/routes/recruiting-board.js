const express = require('express');
const router = express.Router();
const RecruitingBoard = require('../models/RecruitingBoard');
const Notification = require('../models/Notification');
const { authMiddleware, requireRole } = require('../middleware/auth');
const pool = require('../config/database');

// ==================== Collaborator Routes (must be before parameterized routes) ====================

// Get board info (owner, collaborators)
router.get('/board-info', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    // Initialize board owner if needed
    await RecruitingBoard.initializeBoardOwner(req.userId);

    const boardInfo = await RecruitingBoard.getBoardInfo(req.userId);
    // Pass boardInfo to avoid fetching it again
    const collaborators = await RecruitingBoard.getCollaboratorsWithDetails(req.userId, boardInfo);

    // Get pending invites from notifications
    const pendingResult = await pool.query(
      `SELECT n.id, n.related_user_id, n.created_at, n.is_read,
              cp.first_name, cp.last_name, cp.profile_image_url, cp.username, cp.college_name
       FROM notifications n
       JOIN coach_profiles cp ON n.related_user_id = cp.user_id
       WHERE n.user_id = $1
         AND n.type = 'interaction'
         AND n.related_entity_type = 'board_invite_sent'
         AND n.is_read = FALSE`,
      [req.userId]
    );

    console.log(`[board-info] User ${req.userId} - boardInfo.collab:`, boardInfo.collab);
    console.log(`[board-info] User ${req.userId} - coach_user_id: ${boardInfo.coach_user_id}, owner_user_id: ${boardInfo.owner_user_id}`);
    console.log(`[board-info] User ${req.userId} - Found ${pendingResult.rows.length} pending invites, ${collaborators.length} collaborators`);

    res.json({
      ...boardInfo,
      collaborators,
      pendingInvites: pendingResult.rows
    });
  } catch (error) {
    console.error('Error getting board info:', error);
    res.status(500).json({ error: 'Failed to get board info' });
  }
});

// Get shared boards (boards user is collaborator on)
router.get('/shared-boards', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const sharedBoards = await RecruitingBoard.getSharedBoards(req.userId);
    res.json({ sharedBoards });
  } catch (error) {
    console.error('Error getting shared boards:', error);
    res.status(500).json({ error: 'Failed to get shared boards' });
  }
});

// Search for coaches (for inviting collaborators)
router.get('/search-coaches', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.length < 2) {
      return res.json({ coaches: [] });
    }

    // Get current board info to exclude owner and existing collaborators
    const boardInfo = await RecruitingBoard.getBoardInfo(req.userId);
    const excludeIds = [req.userId, ...(boardInfo.collab || [])];

    // Search for college coaches by name or username (college coaches have college_division set)
    const result = await pool.query(
      `SELECT cp.user_id, cp.first_name, cp.last_name, cp.username, cp.profile_image_url, cp.college_name
       FROM coach_profiles cp
       JOIN users u ON cp.user_id = u.id
       WHERE u.role = 'coach'
         AND cp.college_division IS NOT NULL
         AND cp.user_id != ALL($1::uuid[])
         AND (
           LOWER(cp.first_name || ' ' || cp.last_name) LIKE LOWER($2)
           OR LOWER(cp.username) LIKE LOWER($2)
         )
       ORDER BY cp.last_name, cp.first_name
       LIMIT 10`,
      [excludeIds, `%${query}%`]
    );

    res.json({ coaches: result.rows });
  } catch (error) {
    console.error('Error searching coaches:', error);
    res.status(500).json({ error: 'Failed to search coaches' });
  }
});

// Check if a player is on the coach's recruiting board (moved before /:classYear)
router.get('/check/:playerId', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { playerId } = req.params;
    const result = await RecruitingBoard.checkPlayerOnBoard(req.userId, playerId);
    res.json(result);
  } catch (error) {
    console.error('Error checking player on recruiting board:', error);
    res.status(500).json({ error: 'Failed to check player status' });
  }
});

// ==================== Non-parameterized Routes ====================

// Get shared position configuration (applies to all class years)
router.get('/config', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const config = await RecruitingBoard.getPositionConfig(req.userId);
    res.json(config);
  } catch (error) {
    console.error('Error fetching position config:', error);
    res.status(500).json({ error: 'Failed to fetch position configuration' });
  }
});

// Save shared position configuration (applies to all class years)
router.put('/config', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { offensePositions, defensePositions } = req.body;

    if (!offensePositions || !defensePositions) {
      return res.status(400).json({ error: 'Both offense and defense positions are required' });
    }

    await RecruitingBoard.savePositionConfig(req.userId, offensePositions, defensePositions);

    res.json({
      message: 'Position configuration saved',
      offensePositions,
      defensePositions
    });
  } catch (error) {
    console.error('Error saving position config:', error);
    res.status(500).json({ error: 'Failed to save position configuration' });
  }
});

// Get board configuration for a specific class year (returns shared positions + players for that year)
router.get('/:classYear', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { classYear } = req.params;

    // Get shared position config
    const config = await RecruitingBoard.getPositionConfig(req.userId);

    res.json({
      classYear: parseInt(classYear),
      offensePositions: config.offensePositions,
      defensePositions: config.defensePositions,
      isDefault: config.isDefault || false
    });
  } catch (error) {
    console.error('Error fetching recruiting board:', error);
    res.status(500).json({ error: 'Failed to fetch recruiting board' });
  }
});

// Save board configuration (now saves to shared config, ignores classYear for positions)
router.put('/:classYear', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { offensePositions, defensePositions } = req.body;

    if (!offensePositions || !defensePositions) {
      return res.status(400).json({ error: 'Both offense and defense positions are required' });
    }

    // Save to shared config (class_year = 0)
    await RecruitingBoard.savePositionConfig(req.userId, offensePositions, defensePositions);

    res.json({
      message: 'Board configuration saved',
      offensePositions,
      defensePositions
    });
  } catch (error) {
    console.error('Error saving recruiting board:', error);
    res.status(500).json({ error: 'Failed to save recruiting board' });
  }
});

// Get all boards for the coach
router.get('/', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const boards = await RecruitingBoard.getAllByCoach(req.userId);
    const config = await RecruitingBoard.getPositionConfig(req.userId);

    // Return boards with shared position config
    res.json(boards.map(board => ({
      classYear: board.class_year,
      offensePositions: config.offensePositions,
      defensePositions: config.defensePositions,
      players: board.players
    })));
  } catch (error) {
    console.error('Error fetching recruiting boards:', error);
    res.status(500).json({ error: 'Failed to fetch recruiting boards' });
  }
});

// Delete a board (only removes players for that year, not positions)
router.delete('/:classYear', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { classYear } = req.params;
    await RecruitingBoard.delete(req.userId, parseInt(classYear));
    res.json({ message: 'Board players cleared' });
  } catch (error) {
    console.error('Error deleting recruiting board:', error);
    res.status(500).json({ error: 'Failed to clear board' });
  }
});

// Add a player to the recruiting board
router.post('/:classYear/players', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { classYear } = req.params;
    const playerData = req.body;

    // Validate required fields
    if (!playerData.user_id || !playerData.position) {
      return res.status(400).json({ error: 'Player user_id and position are required' });
    }

    // Add the player to the board
    await RecruitingBoard.addPlayer(req.userId, parseInt(classYear), playerData);

    res.json({
      message: 'Player added to recruiting board',
      player: playerData
    });
  } catch (error) {
    console.error('Error adding player to recruiting board:', error);
    if (error.message === 'Player already on board for this position') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to add player to recruiting board' });
  }
});

// Get players for a specific class year
router.get('/:classYear/players', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { classYear } = req.params;
    const players = await RecruitingBoard.getPlayers(req.userId, parseInt(classYear));
    res.json(players);
  } catch (error) {
    console.error('Error fetching players:', error);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// Remove a player from the recruiting board
router.delete('/:classYear/players/:playerId', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { classYear, playerId } = req.params;
    const { position } = req.query;

    await RecruitingBoard.removePlayer(req.userId, parseInt(classYear), playerId, position);
    res.json({ message: 'Player removed from recruiting board' });
  } catch (error) {
    console.error('Error removing player from recruiting board:', error);
    res.status(500).json({ error: 'Failed to remove player from recruiting board' });
  }
});

// Update a player's position on the recruiting board (when dragged to different column)
router.put('/:classYear/players/:playerId/position', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { classYear, playerId } = req.params;
    const { oldPosition, newPosition } = req.body;

    if (!oldPosition || !newPosition) {
      return res.status(400).json({ error: 'Both oldPosition and newPosition are required' });
    }

    await RecruitingBoard.updatePlayerPosition(req.userId, parseInt(classYear), playerId, oldPosition, newPosition);
    res.json({ message: 'Player position updated' });
  } catch (error) {
    console.error('Error updating player position:', error);
    res.status(500).json({ error: 'Failed to update player position' });
  }
});

// ==================== POST/PUT/DELETE Collaborator Routes ====================

// Send collaboration invite
router.post('/invite', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { inviteeUserId } = req.body;

    if (!inviteeUserId) {
      return res.status(400).json({ error: 'Invitee user ID is required' });
    }

    // Verify sender owns the board
    const boardInfo = await RecruitingBoard.getBoardInfo(req.userId);
    if (String(boardInfo.owner_user_id) !== String(req.userId)) {
      return res.status(403).json({ error: 'Only the board owner can invite collaborators' });
    }

    // Check if already a collaborator
    if (boardInfo.collab && boardInfo.collab.some(id => String(id) === String(inviteeUserId))) {
      return res.status(400).json({ error: 'User is already a collaborator' });
    }

    // Check if invite already pending
    const existingInvite = await pool.query(
      `SELECT id FROM notifications
       WHERE user_id = $1
         AND related_user_id = $2
         AND type = 'interaction'
         AND related_entity_type = 'board_invite'
         AND is_read = FALSE`,
      [inviteeUserId, req.userId]
    );

    if (existingInvite.rows.length > 0) {
      return res.status(400).json({ error: 'An invite is already pending for this user' });
    }

    // Get sender info for notification
    const senderResult = await pool.query(
      `SELECT cp.first_name, cp.last_name, cp.college_name
       FROM coach_profiles cp
       WHERE cp.user_id = $1`,
      [req.userId]
    );
    const sender = senderResult.rows[0];
    const senderName = `${sender.first_name} ${sender.last_name}`;

    // Get invitee info for sender's notification
    const inviteeResult = await pool.query(
      `SELECT cp.first_name, cp.last_name
       FROM coach_profiles cp
       WHERE cp.user_id = $1`,
      [inviteeUserId]
    );
    const invitee = inviteeResult.rows[0];
    const inviteeName = invitee ? `${invitee.first_name} ${invitee.last_name}` : 'a coach';

    // Create notification for invitee
    await Notification.create({
      userId: inviteeUserId,
      type: 'interaction',
      title: 'Recruiting Board Invite',
      message: `${senderName} has invited you to collaborate on their recruiting board`,
      relatedUserId: req.userId,
      relatedEntityId: req.userId, // Board owner's ID acts as board identifier
      relatedEntityType: 'board_invite'
    });

    // Create tracking notification for sender (to show pending status)
    const senderNotification = await Notification.create({
      userId: req.userId,
      type: 'interaction',
      title: 'Recruiting Board Invite Sent',
      message: `Recruiting board invite sent to ${inviteeName}`,
      relatedUserId: inviteeUserId,
      relatedEntityId: inviteeUserId,
      relatedEntityType: 'board_invite_sent'
    });

    console.log(`[invite] Created sender tracking notification: ${senderNotification.id} for user ${req.userId} -> invitee ${inviteeUserId}`);

    res.json({ success: true, message: 'Invite sent successfully' });
  } catch (error) {
    console.error('Error sending invite:', error);
    res.status(500).json({ error: 'Failed to send invite' });
  }
});

// Accept collaboration invite
router.post('/invite/accept', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { notificationId, ownerUserId } = req.body;

    if (!ownerUserId) {
      return res.status(400).json({ error: 'Owner user ID is required' });
    }

    // Get board info to find the correct board (ownerUserId is the invite sender who owns the board)
    const boardInfo = await RecruitingBoard.getBoardInfo(ownerUserId);

    console.log(`[invite/accept] Looking up board for ownerUserId: ${ownerUserId}`);
    console.log(`[invite/accept] Found boardInfo:`, JSON.stringify(boardInfo, null, 2));

    if (!boardInfo.coach_user_id) {
      console.error(`[invite/accept] No coach_user_id found in boardInfo!`);
      return res.status(400).json({ error: 'Board not found for this owner' });
    }

    // Get current collaborators
    let collab = boardInfo.collab || [];

    // Check if already a collaborator
    if (collab.some(id => String(id) === String(req.userId))) {
      return res.status(400).json({ error: 'You are already a collaborator on this board' });
    }

    // Add the accepting user to collaborators
    collab.push(req.userId);

    console.log(`[invite/accept] Updating collab array to:`, collab);
    console.log(`[invite/accept] Using coach_user_id: ${boardInfo.coach_user_id}`);

    // Update the database using coach_user_id from boardInfo (handles transferred ownership)
    const updateResult = await pool.query(
      `UPDATE recruiting_boards
       SET collab = $1, updated_at = CURRENT_TIMESTAMP
       WHERE coach_user_id = $2 AND class_year = 0
       RETURNING *`,
      [JSON.stringify(collab), boardInfo.coach_user_id]
    );

    console.log(`[invite/accept] Update result rows:`, updateResult.rowCount);
    if (updateResult.rows[0]) {
      console.log(`[invite/accept] Updated board collab:`, updateResult.rows[0].collab);
    }

    // Mark the invite notification as read
    if (notificationId) {
      await Notification.markAsRead(notificationId, req.userId);
    }

    // Delete the sender's tracking notification
    await pool.query(
      `DELETE FROM notifications
       WHERE user_id = $1
         AND related_user_id = $2
         AND related_entity_type = 'board_invite_sent'`,
      [ownerUserId, req.userId]
    );

    // Get accepter info for notification
    const accepterResult = await pool.query(
      `SELECT cp.first_name, cp.last_name
       FROM coach_profiles cp
       WHERE cp.user_id = $1`,
      [req.userId]
    );
    const accepter = accepterResult.rows[0];
    const accepterName = `${accepter.first_name} ${accepter.last_name}`;

    // Notify owner that invite was accepted
    await Notification.create({
      userId: ownerUserId,
      type: 'interaction',
      title: 'Invite Accepted',
      message: `${accepterName} has accepted your recruiting board invite`,
      relatedUserId: req.userId,
      relatedEntityType: 'board_invite_accepted'
    });

    res.json({ success: true, message: 'Invite accepted' });
  } catch (error) {
    console.error('Error accepting invite:', error);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

// Decline collaboration invite
router.post('/invite/decline', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { notificationId, ownerUserId } = req.body;

    // Mark the invite notification as read
    if (notificationId) {
      await Notification.markAsRead(notificationId, req.userId);
    }

    // Delete the sender's tracking notification
    if (ownerUserId) {
      await pool.query(
        `DELETE FROM notifications
         WHERE user_id = $1
           AND related_user_id = $2
           AND related_entity_type = 'board_invite_sent'`,
        [ownerUserId, req.userId]
      );

      // Get decliner info for notification
      const declinerResult = await pool.query(
        `SELECT cp.first_name, cp.last_name
         FROM coach_profiles cp
         WHERE cp.user_id = $1`,
        [req.userId]
      );
      const decliner = declinerResult.rows[0];
      const declinerName = `${decliner.first_name} ${decliner.last_name}`;

      // Notify owner that invite was declined
      await Notification.create({
        userId: ownerUserId,
        type: 'interaction',
        title: 'Invite Declined',
        message: `${declinerName} has declined your recruiting board invite`,
        relatedUserId: req.userId,
        relatedEntityType: 'board_invite_declined'
      });
    }

    res.json({ success: true, message: 'Invite declined' });
  } catch (error) {
    console.error('Error declining invite:', error);
    res.status(500).json({ error: 'Failed to decline invite' });
  }
});

// Remove a collaborator
router.delete('/collaborator/:collaboratorId', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { collaboratorId } = req.params;

    await RecruitingBoard.removeCollaborator(req.userId, collaboratorId);
    res.json({ success: true, message: 'Collaborator removed' });
  } catch (error) {
    console.error('Error removing collaborator:', error);
    res.status(500).json({ error: error.message || 'Failed to remove collaborator' });
  }
});

// Leave a shared board
router.post('/leave', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { ownerUserId } = req.body;

    if (!ownerUserId) {
      return res.status(400).json({ error: 'Owner user ID is required' });
    }

    await RecruitingBoard.leaveBoard(req.userId, ownerUserId);
    res.json({ success: true, message: 'Left board successfully' });
  } catch (error) {
    console.error('Error leaving board:', error);
    res.status(500).json({ error: 'Failed to leave board' });
  }
});

// Transfer ownership
router.post('/transfer-ownership', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { newOwnerUserId } = req.body;

    if (!newOwnerUserId) {
      return res.status(400).json({ error: 'New owner user ID is required' });
    }

    await RecruitingBoard.transferOwnership(req.userId, newOwnerUserId);

    // Get transfer info for notifications
    const transfererResult = await pool.query(
      `SELECT cp.first_name, cp.last_name
       FROM coach_profiles cp
       WHERE cp.user_id = $1`,
      [req.userId]
    );
    const transferer = transfererResult.rows[0];
    const transfererName = `${transferer.first_name} ${transferer.last_name}`;

    // Notify new owner
    await Notification.create({
      userId: newOwnerUserId,
      type: 'interaction',
      title: 'Board Ownership Transferred',
      message: `${transfererName} has transferred recruiting board ownership to you`,
      relatedUserId: req.userId,
      relatedEntityType: 'board_ownership_transfer'
    });

    res.json({ success: true, message: 'Ownership transferred successfully' });
  } catch (error) {
    console.error('Error transferring ownership:', error);
    res.status(500).json({ error: error.message || 'Failed to transfer ownership' });
  }
});

// Cancel a pending invite
router.delete('/invite/:inviteeId', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { inviteeId } = req.params;

    // Delete the invite notification sent to the invitee
    await pool.query(
      `DELETE FROM notifications
       WHERE user_id = $1
         AND related_user_id = $2
         AND related_entity_type = 'board_invite'`,
      [inviteeId, req.userId]
    );

    // Delete the sender's tracking notification
    await pool.query(
      `DELETE FROM notifications
       WHERE user_id = $1
         AND related_user_id = $2
         AND related_entity_type = 'board_invite_sent'`,
      [req.userId, inviteeId]
    );

    res.json({ success: true, message: 'Invite cancelled' });
  } catch (error) {
    console.error('Error cancelling invite:', error);
    res.status(500).json({ error: 'Failed to cancel invite' });
  }
});

module.exports = router;
