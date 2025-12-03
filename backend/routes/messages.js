const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const { authMiddleware } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { messageLimiter } = require('../middleware/rateLimit');

// Get user's conversations
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const conversations = await Message.getUserConversations(req.userId, limit, offset);
    res.json({ conversations, count: conversations.length });
  } catch (error) {
    console.error('Get conversations error:', error);
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
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Get messages in a conversation
router.get('/conversations/:conversationId', authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;

    const isParticipant = await Message.isParticipant(conversationId, req.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const messages = await Message.getConversationMessages(conversationId, limit, offset);
    await Message.markAsRead(conversationId, req.userId);

    res.json({ messages, count: messages.length });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send message
router.post('/conversations/:conversationId/messages', authMiddleware, messageLimiter, [
  body('content').trim().notEmpty().withMessage('Message content required')
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

    res.status(201).json({ message });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Mark conversation as read
router.post('/conversations/:conversationId/read', authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;

    const isParticipant = await Message.isParticipant(conversationId, req.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    await Message.markAsRead(conversationId, req.userId);
    res.json({ message: 'Marked as read' });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

module.exports = router;
