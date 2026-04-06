const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const PlayerProfile = require('../models/PlayerProfile');
const CoachProfile = require('../models/CoachProfile');
const User = require('../models/User');
const pool = require('../config/database');
const { authMiddleware, validateUUID } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { messageLimiter } = require('../middleware/rateLimit');
const { sanitizeBody } = require('../middleware/validation');
const { getSignedS3Url } = require('../utils/s3');
const AiEngagement = require('../models/AiEngagement');
const logger = require('../utils/logger');

// Helper function to add signed URLs to conversations/messages with profile images
async function addSignedUrlsToConversations(conversations) {
  if (!conversations || !Array.isArray(conversations)) return conversations;

  return await Promise.all(conversations.map(async (conv) => {
    // Handle other_user_profile_image
    if (conv.other_user_profile_image && conv.other_user_profile_image.startsWith('profiles/')) {
      try {
        conv.other_user_profile_image = await getSignedS3Url(conv.other_user_profile_image);
      } catch (error) {
        logger.error('Error generating signed URL:', error);
        conv.other_user_profile_image = null;
      }
    }

    // Handle participants array profile images
    if (conv.participants && Array.isArray(conv.participants)) {
      conv.participants = await Promise.all(conv.participants.map(async (participant) => {
        if (participant.profile_image && participant.profile_image.startsWith('profiles/')) {
          try {
            participant.profile_image = await getSignedS3Url(participant.profile_image);
          } catch (error) {
            logger.error('Error generating signed URL for participant:', error);
            participant.profile_image = null;
          }
        }
        return participant;
      }));
    }

    return conv;
  }));
}

// Get unread message count
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const count = await Message.getUnreadCount(req.userId);
    res.json({ unreadCount: count });
  } catch (error) {
    logger.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// Get user's conversations
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    let conversations = await Message.getUserConversations(req.userId, limit, offset);
    conversations = await addSignedUrlsToConversations(conversations);
    res.json({ conversations, count: conversations.length });
  } catch (error) {
    logger.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Get or create conversation with another user
router.post('/conversations', authMiddleware, [
  body('otherUserId').isUUID().withMessage('Valid user ID required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { otherUserId } = req.body;

    if (otherUserId === req.userId) {
      return res.status(400).json({ error: 'Cannot create conversation with yourself' });
    }

    const conversation = await Message.getOrCreateConversation(req.userId, otherUserId);
    res.json({ conversation });
  } catch (error) {
    logger.error('Create conversation error:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Get messages in a conversation
router.get('/conversations/:conversationId', authMiddleware, validateUUID('conversationId'), async (req, res) => {
  try {
    const { conversationId } = req.params;

    const isParticipant = await Message.isParticipant(conversationId, req.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const markRead = req.query.markRead !== 'false'; // Default to true, only skip if explicitly 'false'

    const messages = await Message.getConversationMessages(conversationId, limit, offset);

    // Mark conversation as read when user opens it (but not during polling)
    if (markRead) {
      await Message.markConversationAsRead(conversationId, req.userId);
    }

    res.json({ messages, count: messages.length });
  } catch (error) {
    logger.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send message
router.post('/conversations/:conversationId/messages', authMiddleware, validateUUID('conversationId'), messageLimiter, sanitizeBody, [
  body('content').trim().notEmpty().withMessage('Message content required').isLength({ max: 5000 }).withMessage('Message must be 5000 characters or less')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { conversationId } = req.params;

    const isParticipant = await Message.isParticipant(conversationId, req.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    const message = await Message.sendMessage(conversationId, req.userId, req.body.content);

    // Socket.IO will handle real-time delivery
    if (req.app.get('io')) {
      req.app.get('io').to(conversationId).emit('new_message', message);
    }

    // Create notification for the recipient(s)
    try {
      // Get sender info
      const senderUser = await User.findById(req.userId);
      let senderName = 'Someone';

      if (senderUser.role === 'player') {
        const profile = await PlayerProfile.findByUserId(req.userId);
        if (profile) senderName = `${profile.first_name} ${profile.last_name}`;
      } else if (senderUser.role === 'coach') {
        const profile = await CoachProfile.findByUserId(req.userId);
        if (profile) senderName = `${profile.first_name} ${profile.last_name}`;
      }

      // Get other participants in the conversation
      const participantsResult = await pool.query(
        `SELECT user_id FROM conversation_participants WHERE conversation_id = $1 AND user_id != $2`,
        [conversationId, req.userId]
      );

      // Create notification for each recipient
      for (const row of participantsResult.rows) {
        await Notification.createMessageNotification(
          row.user_id,
          req.userId,
          senderName,
          req.body.content,
          conversationId
        );
      }

      // Track AI engagement for each recipient (fire-and-forget)
      for (const row of participantsResult.rows) {
        AiEngagement.trackIfAiDriven(req.userId, row.user_id, 'message')
          .catch(err => logger.error('Engagement track error:', err.message));
      }
    } catch (notifError) {
      logger.error('Failed to create message notification:', notifError);
      // Don't fail the message send if notification fails
    }

    res.status(201).json({ message });
  } catch (error) {
    logger.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Hide/delete conversation for current user only
router.delete('/conversations/:conversationId', authMiddleware, validateUUID('conversationId'), async (req, res) => {
  try {
    const { conversationId } = req.params;

    const isParticipant = await Message.isParticipant(conversationId, req.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    await Message.hideConversation(conversationId, req.userId);
    res.json({ success: true, message: 'Conversation hidden' });
  } catch (error) {
    logger.error('Hide conversation error:', error);
    res.status(500).json({ error: 'Failed to hide conversation' });
  }
});

module.exports = router;
