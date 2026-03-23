const express = require('express');
const router = express.Router();
const RecruitingBoard = require('../models/RecruitingBoard');
const Notification = require('../models/Notification');
const { authMiddleware, requireRole, validateUUID } = require('../middleware/auth');
const pool = require('../config/database');
const { getSignedS3Url } = require('../utils/s3');
const logger = require('../utils/logger');

// Helper function to add signed URLs to profiles/players
async function addSignedUrlsToPlayers(players) {
  if (!players || !Array.isArray(players)) return players;

  return await Promise.all(players.map(async (player) => {
    if (player.profile_image_url && player.profile_image_url.startsWith('profiles/')) {
      try {
        player.profile_image_url = await getSignedS3Url(player.profile_image_url);
      } catch (error) {
        logger.error('Error generating signed URL:', error);
        player.profile_image_url = null;
      }
    }
    return player;
  }));
}

// ==================== Personal Board Routes ====================

// Initialize/get personal board
router.get('/personal/init', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const board = await RecruitingBoard.getOrCreatePersonalBoard(req.userId);
    res.json({ board });
  } catch (error) {
    logger.error('Error initializing personal board:', error);
    res.status(500).json({ error: 'Failed to initialize personal board' });
  }
});

// Get personal board config
router.get('/personal/config', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const config = await RecruitingBoard.getPositionConfig(req.userId);
    res.json(config);
  } catch (error) {
    logger.error('Error fetching personal board config:', error);
    res.status(500).json({ error: 'Failed to fetch position configuration' });
  }
});

// Save personal board config
router.put('/personal/config', authMiddleware, requireRole('coach'), async (req, res) => {
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
    logger.error('Error saving personal board config:', error);
    res.status(500).json({ error: 'Failed to save position configuration' });
  }
});

// Get players for personal board by class year
router.get('/personal/:classYear/players', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { classYear } = req.params;
    let players = await RecruitingBoard.getPlayersFromPersonalBoard(req.userId, parseInt(classYear));
    players = await addSignedUrlsToPlayers(players);
    res.json(players);
  } catch (error) {
    logger.error('Error fetching personal board players:', error);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// Add player to personal board
router.post('/personal/:classYear/players', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { classYear } = req.params;
    const playerData = req.body;

    if (!playerData.user_id || !playerData.position) {
      return res.status(400).json({ error: 'Player user_id and position are required' });
    }

    await RecruitingBoard.addPlayerToPersonalBoard(req.userId, parseInt(classYear), playerData);

    res.json({
      message: 'Player added to recruiting board',
      player: playerData
    });
  } catch (error) {
    logger.error('Error adding player to personal board:', error);
    if (error.message === 'Player already on board for this position') {
      return res.status(400).json({ error: 'Player is already on the board for this position' });
    }
    res.status(500).json({ error: 'Failed to add player to recruiting board' });
  }
});

// Remove player from personal board
router.delete('/personal/:classYear/players/:playerId', authMiddleware, requireRole('coach'), validateUUID('playerId'), async (req, res) => {
  try {
    const { classYear, playerId } = req.params;
    const { position } = req.query;

    await RecruitingBoard.removePlayerFromPersonalBoard(req.userId, parseInt(classYear), playerId, position);
    res.json({ message: 'Player removed from recruiting board' });
  } catch (error) {
    logger.error('Error removing player from personal board:', error);
    res.status(500).json({ error: 'Failed to remove player from recruiting board' });
  }
});

// Update player position on personal board
router.put('/personal/:classYear/players/:playerId/position', authMiddleware, requireRole('coach'), validateUUID('playerId'), async (req, res) => {
  try {
    const { classYear, playerId } = req.params;
    const { oldPosition, newPosition } = req.body;

    if (!oldPosition || !newPosition) {
      return res.status(400).json({ error: 'Both oldPosition and newPosition are required' });
    }

    await RecruitingBoard.updatePlayerPositionOnPersonalBoard(req.userId, parseInt(classYear), playerId, oldPosition, newPosition);
    res.json({ message: 'Player position updated' });
  } catch (error) {
    logger.error('Error updating player position:', error);
    res.status(500).json({ error: 'Failed to update player position' });
  }
});

// ==================== Shared Board Routes ====================

// Create a new shared board
router.post('/shared', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { boardName } = req.body;

    if (!boardName || boardName.trim().length === 0) {
      return res.status(400).json({ error: 'Board name is required' });
    }

    const board = await RecruitingBoard.createSharedBoard(req.userId, boardName.trim());
    res.json({ success: true, board });
  } catch (error) {
    logger.error('Error creating shared board:', error);
    res.status(500).json({ error: 'Failed to create shared board' });
  }
});

// Get all shared boards (owned + collaborator)
router.get('/shared', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const ownedBoards = await RecruitingBoard.getOwnedSharedBoards(req.userId);
    const collaboratorBoards = await RecruitingBoard.getCollaboratorBoards(req.userId);

    res.json({
      ownedBoards,
      collaboratorBoards
    });
  } catch (error) {
    logger.error('Error getting shared boards:', error);
    res.status(500).json({ error: 'Failed to get shared boards' });
  }
});

// Get a specific shared board by ID
router.get('/shared/:boardId', authMiddleware, requireRole('coach'), validateUUID('boardId'), async (req, res) => {
  try {
    const { boardId } = req.params;

    // Check access
    const accessInfo = await RecruitingBoard.hasAccessToBoard(req.userId, boardId);
    if (!accessInfo.hasAccess) {
      return res.status(403).json({ error: 'You do not have access to this board' });
    }

    const board = await RecruitingBoard.getSharedBoardById(boardId);
    const config = await RecruitingBoard.getPositionConfig(null, boardId);
    const collaborators = await RecruitingBoard.getCollaboratorsWithDetails(boardId);

    res.json({
      ...board,
      offensePositions: config.offensePositions,
      defensePositions: config.defensePositions,
      collaborators,
      userRole: accessInfo.role
    });
  } catch (error) {
    logger.error('Error getting shared board:', error);
    res.status(500).json({ error: 'Failed to get shared board' });
  }
});

// Update shared board name
router.put('/shared/:boardId/name', authMiddleware, requireRole('coach'), validateUUID('boardId'), async (req, res) => {
  try {
    const { boardId } = req.params;
    const { boardName } = req.body;

    if (!boardName || boardName.trim().length === 0) {
      return res.status(400).json({ error: 'Board name is required' });
    }

    const board = await RecruitingBoard.updateBoardName(boardId, req.userId, boardName.trim());

    if (!board) {
      return res.status(403).json({ error: 'Only the board owner can rename the board' });
    }

    res.json({ success: true, board });
  } catch (error) {
    logger.error('Error updating board name:', error);
    res.status(500).json({ error: 'Failed to update board name' });
  }
});

// Delete a shared board
router.delete('/shared/:boardId', authMiddleware, requireRole('coach'), validateUUID('boardId'), async (req, res) => {
  try {
    const { boardId } = req.params;
    await RecruitingBoard.deleteSharedBoard(boardId, req.userId);
    res.json({ success: true, message: 'Board deleted' });
  } catch (error) {
    logger.error('Error deleting shared board:', error);
    res.status(500).json({ error: 'Failed to delete board' });
  }
});

// Save shared board config
router.put('/shared/:boardId/config', authMiddleware, requireRole('coach'), validateUUID('boardId'), async (req, res) => {
  try {
    const { boardId } = req.params;
    const { offensePositions, defensePositions } = req.body;

    // Check access
    const accessInfo = await RecruitingBoard.hasAccessToBoard(req.userId, boardId);
    if (!accessInfo.hasAccess) {
      return res.status(403).json({ error: 'You do not have access to this board' });
    }

    if (!offensePositions || !defensePositions) {
      return res.status(400).json({ error: 'Both offense and defense positions are required' });
    }

    await RecruitingBoard.savePositionConfig(null, offensePositions, defensePositions, boardId);

    res.json({
      message: 'Position configuration saved',
      offensePositions,
      defensePositions
    });
  } catch (error) {
    logger.error('Error saving shared board config:', error);
    res.status(500).json({ error: 'Failed to save position configuration' });
  }
});

// Get players for shared board by class year
router.get('/shared/:boardId/:classYear/players', authMiddleware, requireRole('coach'), validateUUID('boardId'), async (req, res) => {
  try {
    const { boardId, classYear } = req.params;

    // Check access
    const accessInfo = await RecruitingBoard.hasAccessToBoard(req.userId, boardId);
    if (!accessInfo.hasAccess) {
      return res.status(403).json({ error: 'You do not have access to this board' });
    }

    let players = await RecruitingBoard.getPlayersFromSharedBoard(boardId, parseInt(classYear));
    players = await addSignedUrlsToPlayers(players);
    res.json(players);
  } catch (error) {
    logger.error('Error fetching shared board players:', error);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// Add player to shared board
router.post('/shared/:boardId/:classYear/players', authMiddleware, requireRole('coach'), validateUUID('boardId'), async (req, res) => {
  try {
    const { boardId, classYear } = req.params;
    const playerData = req.body;

    // Check access
    const accessInfo = await RecruitingBoard.hasAccessToBoard(req.userId, boardId);
    if (!accessInfo.hasAccess) {
      return res.status(403).json({ error: 'You do not have access to this board' });
    }

    if (!playerData.user_id || !playerData.position) {
      return res.status(400).json({ error: 'Player user_id and position are required' });
    }

    await RecruitingBoard.addPlayerToSharedBoard(boardId, parseInt(classYear), playerData);

    res.json({
      message: 'Player added to recruiting board',
      player: playerData
    });
  } catch (error) {
    logger.error('Error adding player to shared board:', error);
    if (error.message === 'Player already on board for this position') {
      return res.status(400).json({ error: 'Player is already on the board for this position' });
    }
    res.status(500).json({ error: 'Failed to add player to recruiting board' });
  }
});

// Remove player from shared board
router.delete('/shared/:boardId/:classYear/players/:playerId', authMiddleware, requireRole('coach'), validateUUID('boardId', 'playerId'), async (req, res) => {
  try {
    const { boardId, classYear, playerId } = req.params;
    const { position } = req.query;

    // Check access
    const accessInfo = await RecruitingBoard.hasAccessToBoard(req.userId, boardId);
    if (!accessInfo.hasAccess) {
      return res.status(403).json({ error: 'You do not have access to this board' });
    }

    await RecruitingBoard.removePlayerFromSharedBoard(boardId, parseInt(classYear), playerId, position);
    res.json({ message: 'Player removed from recruiting board' });
  } catch (error) {
    logger.error('Error removing player from shared board:', error);
    res.status(500).json({ error: 'Failed to remove player from recruiting board' });
  }
});

// Update player position on shared board
router.put('/shared/:boardId/:classYear/players/:playerId/position', authMiddleware, requireRole('coach'), validateUUID('boardId', 'playerId'), async (req, res) => {
  try {
    const { boardId, classYear, playerId } = req.params;
    const { oldPosition, newPosition } = req.body;

    // Check access
    const accessInfo = await RecruitingBoard.hasAccessToBoard(req.userId, boardId);
    if (!accessInfo.hasAccess) {
      return res.status(403).json({ error: 'You do not have access to this board' });
    }

    if (!oldPosition || !newPosition) {
      return res.status(400).json({ error: 'Both oldPosition and newPosition are required' });
    }

    await RecruitingBoard.updatePlayerPositionOnSharedBoard(boardId, parseInt(classYear), playerId, oldPosition, newPosition);
    res.json({ message: 'Player position updated' });
  } catch (error) {
    logger.error('Error updating player position:', error);
    res.status(500).json({ error: 'Failed to update player position' });
  }
});

// ==================== Collaborator Routes ====================

// Search for coaches (for inviting collaborators)
router.get('/search-coaches', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { query, boardId } = req.query;

    if (!query || query.length < 2) {
      return res.json({ coaches: [] });
    }

    // Get current board collaborators to exclude them
    let excludeIds = [req.userId];
    if (boardId) {
      const board = await RecruitingBoard.getSharedBoardById(boardId);
      if (board && board.collab) {
        excludeIds = [...excludeIds, ...board.collab];
      }
    }

    // Search for college coaches by name or username (fuzzy + LIKE fallback)
    const result = await pool.query(
      `SELECT cp.user_id, cp.first_name, cp.last_name, cp.username, cp.profile_image_url, cp.team_name
       FROM coach_profiles cp
       JOIN users u ON cp.user_id = u.id
       WHERE u.role = 'coach'
         AND cp.college_division IS NOT NULL
         AND cp.user_id != ALL($1::uuid[])
         AND (
           similarity(cp.first_name || ' ' || cp.last_name, $2) > 0.2
           OR similarity(cp.username, $2) > 0.2
           OR LOWER(cp.first_name || ' ' || cp.last_name) LIKE LOWER($3)
           OR LOWER(cp.username) LIKE LOWER($3)
         )
       ORDER BY GREATEST(similarity(cp.first_name || ' ' || cp.last_name, $2), similarity(cp.username, $2)) DESC, cp.last_name, cp.first_name
       LIMIT 10`,
      [excludeIds, query, `%${query}%`]
    );

    res.json({ coaches: result.rows });
  } catch (error) {
    logger.error('Error searching coaches:', error);
    res.status(500).json({ error: 'Failed to search coaches' });
  }
});

// Get pending invites for a board
router.get('/shared/:boardId/pending-invites', authMiddleware, requireRole('coach'), validateUUID('boardId'), async (req, res) => {
  try {
    const { boardId } = req.params;

    const pendingResult = await pool.query(
      `SELECT n.id, n.related_user_id, n.created_at, n.is_read,
              cp.first_name, cp.last_name, cp.profile_image_url, cp.username, cp.team_name
       FROM notifications n
       JOIN coach_profiles cp ON n.related_user_id = cp.user_id
       WHERE n.user_id = $1
         AND n.type = 'interaction'
         AND n.related_entity_type = 'board_invite_sent'
         AND n.related_entity_id = $2
         AND n.is_read = FALSE`,
      [req.userId, boardId]
    );

    res.json({ pendingInvites: pendingResult.rows });
  } catch (error) {
    logger.error('Error getting pending invites:', error);
    res.status(500).json({ error: 'Failed to get pending invites' });
  }
});

// Send collaboration invite for a shared board
router.post('/shared/:boardId/invite', authMiddleware, requireRole('coach'), validateUUID('boardId'), async (req, res) => {
  try {
    const { boardId } = req.params;
    const { inviteeUserId } = req.body;

    if (!inviteeUserId) {
      return res.status(400).json({ error: 'Invitee user ID is required' });
    }

    // Verify sender owns the board
    const board = await RecruitingBoard.getSharedBoardById(boardId);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    if (String(board.owner_user_id) !== String(req.userId)) {
      return res.status(403).json({ error: 'Only the board owner can invite collaborators' });
    }

    // Check if already a collaborator
    if (board.collab && board.collab.some(id => String(id) === String(inviteeUserId))) {
      return res.status(400).json({ error: 'User is already a collaborator' });
    }

    // Check if invite already pending
    const existingInvite = await pool.query(
      `SELECT id FROM notifications
       WHERE user_id = $1
         AND related_user_id = $2
         AND type = 'interaction'
         AND related_entity_type = 'board_invite'
         AND related_entity_id = $3
         AND is_read = FALSE`,
      [inviteeUserId, req.userId, boardId]
    );

    if (existingInvite.rows.length > 0) {
      return res.status(400).json({ error: 'An invite is already pending for this user' });
    }

    // Get sender info for notification
    const senderResult = await pool.query(
      `SELECT cp.first_name, cp.last_name, cp.team_name
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
      message: `${senderName} has invited you to collaborate on "${board.board_name}"`,
      relatedUserId: req.userId,
      relatedEntityId: boardId,
      relatedEntityType: 'board_invite'
    });

    // Create tracking notification for sender
    await Notification.create({
      userId: req.userId,
      type: 'interaction',
      title: 'Recruiting Board Invite Sent',
      message: `Invite sent to ${inviteeName} for "${board.board_name}"`,
      relatedUserId: inviteeUserId,
      relatedEntityId: boardId,
      relatedEntityType: 'board_invite_sent'
    });

    res.json({ success: true, message: 'Invite sent successfully' });
  } catch (error) {
    logger.error('Error sending invite:', error);
    res.status(500).json({ error: 'Failed to send invite' });
  }
});

// Accept collaboration invite
router.post('/invite/accept', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { notificationId, boardId } = req.body;

    if (!boardId) {
      return res.status(400).json({ error: 'Board ID is required' });
    }

    const board = await RecruitingBoard.getSharedBoardById(boardId);

    if (!board) {
      return res.status(400).json({ error: 'Board not found' });
    }

    // Get current collaborators
    let collab = board.collab || [];

    // Check if already a collaborator
    if (collab.some(id => String(id) === String(req.userId))) {
      return res.status(400).json({ error: 'You are already a collaborator on this board' });
    }

    // Add the accepting user to collaborators
    collab.push(req.userId);

    await pool.query(
      `UPDATE recruiting_boards
       SET collab = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [JSON.stringify(collab), boardId]
    );

    // Mark the invite notification as read
    if (notificationId) {
      await Notification.markAsRead(notificationId, req.userId);
    }

    // Delete the sender's tracking notification
    await pool.query(
      `DELETE FROM notifications
       WHERE user_id = $1
         AND related_user_id = $2
         AND related_entity_id = $3
         AND related_entity_type = 'board_invite_sent'`,
      [board.owner_user_id, req.userId, boardId]
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
      userId: board.owner_user_id,
      type: 'interaction',
      title: 'Invite Accepted',
      message: `${accepterName} has accepted your invite to "${board.board_name}"`,
      relatedUserId: req.userId,
      relatedEntityId: boardId,
      relatedEntityType: 'board_invite_accepted'
    });

    res.json({ success: true, message: 'Invite accepted' });
  } catch (error) {
    logger.error('Error accepting invite:', error);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

// Decline collaboration invite
router.post('/invite/decline', authMiddleware, requireRole('coach'), async (req, res) => {
  try {
    const { notificationId, boardId } = req.body;

    // Mark the invite notification as read
    if (notificationId) {
      await Notification.markAsRead(notificationId, req.userId);
    }

    if (boardId) {
      const board = await RecruitingBoard.getSharedBoardById(boardId);

      if (board) {
        // Delete the sender's tracking notification
        await pool.query(
          `DELETE FROM notifications
           WHERE user_id = $1
             AND related_user_id = $2
             AND related_entity_id = $3
             AND related_entity_type = 'board_invite_sent'`,
          [board.owner_user_id, req.userId, boardId]
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
          userId: board.owner_user_id,
          type: 'interaction',
          title: 'Invite Declined',
          message: `${declinerName} has declined your invite to "${board.board_name}"`,
          relatedUserId: req.userId,
          relatedEntityId: boardId,
          relatedEntityType: 'board_invite_declined'
        });
      }
    }

    res.json({ success: true, message: 'Invite declined' });
  } catch (error) {
    logger.error('Error declining invite:', error);
    res.status(500).json({ error: 'Failed to decline invite' });
  }
});

// Remove a collaborator from shared board
router.delete('/shared/:boardId/collaborator/:collaboratorId', authMiddleware, requireRole('coach'), validateUUID('boardId', 'collaboratorId'), async (req, res) => {
  try {
    const { boardId, collaboratorId } = req.params;

    // Get board info before removal for notification
    const board = await RecruitingBoard.getSharedBoardById(boardId);

    await RecruitingBoard.removeCollaborator(boardId, req.userId, collaboratorId);

    // Send notification to removed collaborator
    if (board) {
      // Get owner info for notification
      const ownerResult = await pool.query(
        `SELECT cp.first_name, cp.last_name
         FROM coach_profiles cp
         WHERE cp.user_id = $1`,
        [req.userId]
      );
      const owner = ownerResult.rows[0];
      const ownerName = owner ? `${owner.first_name} ${owner.last_name}` : 'The board owner';

      await Notification.create({
        userId: collaboratorId,
        type: 'interaction',
        title: 'Removed from Recruiting Board',
        message: `${ownerName} has removed you from "${board.board_name}"`,
        relatedUserId: req.userId,
        relatedEntityId: boardId,
        relatedEntityType: 'board_collaborator_removed'
      });
    }

    res.json({ success: true, message: 'Collaborator removed' });
  } catch (error) {
    logger.error('Error removing collaborator:', error);
    res.status(500).json({ error: 'Failed to remove collaborator' });
  }
});

// Leave a shared board
router.post('/shared/:boardId/leave', authMiddleware, requireRole('coach'), validateUUID('boardId'), async (req, res) => {
  try {
    const { boardId } = req.params;

    // Get board info before leaving for notification
    const board = await RecruitingBoard.getSharedBoardById(boardId);

    await RecruitingBoard.leaveBoard(boardId, req.userId);

    // Send notification to board owner
    if (board) {
      // Get leaving user's info for notification
      const leaverResult = await pool.query(
        `SELECT cp.first_name, cp.last_name
         FROM coach_profiles cp
         WHERE cp.user_id = $1`,
        [req.userId]
      );
      const leaver = leaverResult.rows[0];
      const leaverName = leaver ? `${leaver.first_name} ${leaver.last_name}` : 'A collaborator';

      await Notification.create({
        userId: board.owner_user_id,
        type: 'interaction',
        title: 'Collaborator Left Board',
        message: `${leaverName} has left "${board.board_name}"`,
        relatedUserId: req.userId,
        relatedEntityId: boardId,
        relatedEntityType: 'board_collaborator_left'
      });
    }

    res.json({ success: true, message: 'Left board successfully' });
  } catch (error) {
    logger.error('Error leaving board:', error);
    res.status(500).json({ error: 'Failed to leave board' });
  }
});

// Transfer ownership of shared board
router.post('/shared/:boardId/transfer-ownership', authMiddleware, requireRole('coach'), validateUUID('boardId'), async (req, res) => {
  try {
    const { boardId } = req.params;
    const { newOwnerUserId } = req.body;

    if (!newOwnerUserId) {
      return res.status(400).json({ error: 'New owner user ID is required' });
    }

    const board = await RecruitingBoard.getSharedBoardById(boardId);

    await RecruitingBoard.transferOwnership(boardId, req.userId, newOwnerUserId);

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
      message: `${transfererName} has transferred ownership of "${board.board_name}" to you`,
      relatedUserId: req.userId,
      relatedEntityId: boardId,
      relatedEntityType: 'board_ownership_transfer'
    });

    res.json({ success: true, message: 'Ownership transferred successfully' });
  } catch (error) {
    logger.error('Error transferring ownership:', error);
    res.status(500).json({ error: 'Failed to transfer ownership' });
  }
});

// Cancel a pending invite
router.delete('/shared/:boardId/invite/:inviteeId', authMiddleware, requireRole('coach'), validateUUID('boardId', 'inviteeId'), async (req, res) => {
  try {
    const { boardId, inviteeId } = req.params;

    // Delete the invite notification sent to the invitee
    await pool.query(
      `DELETE FROM notifications
       WHERE user_id = $1
         AND related_user_id = $2
         AND related_entity_id = $3
         AND related_entity_type = 'board_invite'`,
      [inviteeId, req.userId, boardId]
    );

    // Delete the sender's tracking notification
    await pool.query(
      `DELETE FROM notifications
       WHERE user_id = $1
         AND related_user_id = $2
         AND related_entity_id = $3
         AND related_entity_type = 'board_invite_sent'`,
      [req.userId, inviteeId, boardId]
    );

    res.json({ success: true, message: 'Invite cancelled' });
  } catch (error) {
    logger.error('Error cancelling invite:', error);
    res.status(500).json({ error: 'Failed to cancel invite' });
  }
});

// ==================== Utility Routes ====================

// Check if a player is on the coach's recruiting boards
router.get('/check/:playerId', authMiddleware, requireRole('coach'), validateUUID('playerId'), async (req, res) => {
  try {
    const { playerId } = req.params;
    const result = await RecruitingBoard.checkPlayerOnBoards(req.userId, playerId);
    res.json(result);
  } catch (error) {
    logger.error('Error checking player on recruiting board:', error);
    res.status(500).json({ error: 'Failed to check player status' });
  }
});

module.exports = router;
