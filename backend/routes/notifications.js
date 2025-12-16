const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { authMiddleware } = require('../middleware/auth');

// Get notifications for current user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { type, limit = 50, offset = 0 } = req.query;

    const notifications = await Notification.getForUser(req.userId, {
      type: type || null,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({ notifications, count: notifications.length });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Get unread count
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const { type } = req.query;
    const count = await Notification.getUnreadCount(req.userId, type || null);
    res.json({ unreadCount: count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// Get counts by type
router.get('/counts', authMiddleware, async (req, res) => {
  try {
    const counts = await Notification.getCountsByType(req.userId);
    res.json({ counts });
  } catch (error) {
    console.error('Get counts error:', error);
    res.status(500).json({ error: 'Failed to fetch counts' });
  }
});

// Mark single notification as read
router.put('/:notificationId/read', authMiddleware, async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.markAsRead(notificationId, req.userId);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification marked as read', notification });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.put('/read-all', authMiddleware, async (req, res) => {
  try {
    const { type } = req.query;
    const count = await Notification.markAllAsRead(req.userId, type || null);
    res.json({ message: 'All notifications marked as read', count });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// Delete single notification
router.delete('/:notificationId', authMiddleware, async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.delete(notificationId, req.userId);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Delete all notifications (optional: by type)
router.delete('/', authMiddleware, async (req, res) => {
  try {
    const { type } = req.query;
    const count = await Notification.deleteAll(req.userId, type || null);
    res.json({ message: 'Notifications deleted', count });
  } catch (error) {
    console.error('Delete all notifications error:', error);
    res.status(500).json({ error: 'Failed to delete notifications' });
  }
});

module.exports = router;
