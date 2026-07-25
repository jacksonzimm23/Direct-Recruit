const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { authMiddleware, validateUUID } = require('../middleware/auth');
const { getSignedS3Url } = require('../utils/s3');
const { syncBadge } = require('../utils/notifications');
const logger = require('../utils/logger');

// Helper function to add signed URLs to notifications with profile images
async function addSignedUrlsToNotifications(notifications) {
  if (!notifications || !Array.isArray(notifications)) return notifications;

  return await Promise.all(notifications.map(async (notification) => {
    // Handle actor_profile_image_url (legacy)
    if (notification.actor_profile_image_url && notification.actor_profile_image_url.startsWith('profiles/')) {
      try {
        notification.actor_profile_image_url = await getSignedS3Url(notification.actor_profile_image_url);
      } catch (error) {
        logger.error('Error generating signed URL for actor_profile_image_url:', error);
        notification.actor_profile_image_url = null;
      }
    }
    // Handle related_user_profile_image (current)
    if (notification.related_user_profile_image && notification.related_user_profile_image.startsWith('profiles/')) {
      try {
        notification.related_user_profile_image = await getSignedS3Url(notification.related_user_profile_image);
      } catch (error) {
        logger.error('Error generating signed URL for related_user_profile_image:', error);
        notification.related_user_profile_image = null;
      }
    }
    return notification;
  }));
}

// Get notifications for current user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { type, limit = 50, offset = 0 } = req.query;
    const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
    const safeOffset = Math.max(parseInt(offset) || 0, 0);

    let notifications = await Notification.getForUser(req.userId, {
      type: type || null,
      limit: safeLimit,
      offset: safeOffset
    });

    notifications = await addSignedUrlsToNotifications(notifications);

    res.json({ notifications, count: notifications.length });
  } catch (error) {
    logger.error('Get notifications error:', error);
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
    logger.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// Get counts by type
router.get('/counts', authMiddleware, async (req, res) => {
  try {
    const counts = await Notification.getCountsByType(req.userId);
    res.json({ counts });
  } catch (error) {
    logger.error('Get counts error:', error);
    res.status(500).json({ error: 'Failed to fetch counts' });
  }
});

// Mark single notification as read
router.put('/:notificationId/read', authMiddleware, validateUUID('notificationId'), async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.markAsRead(notificationId, req.userId);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    // Correct the iOS home-screen badge. Fire-and-forget, never blocks the response.
    syncBadge(req.userId);

    res.json({ message: 'Notification marked as read', notification });
  } catch (error) {
    logger.error('Mark as read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.put('/read-all', authMiddleware, async (req, res) => {
  try {
    const { type } = req.query;
    const count = await Notification.markAllAsRead(req.userId, type || null);
    syncBadge(req.userId);
    res.json({ message: 'All notifications marked as read', count });
  } catch (error) {
    logger.error('Mark all as read error:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// Delete single notification
router.delete('/:notificationId', authMiddleware, validateUUID('notificationId'), async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.delete(notificationId, req.userId);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    syncBadge(req.userId);
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    logger.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Delete all notifications (optional: by type)
router.delete('/', authMiddleware, async (req, res) => {
  try {
    const { type } = req.query;
    const count = await Notification.deleteAll(req.userId, type || null);
    syncBadge(req.userId);
    res.json({ message: 'Notifications deleted', count });
  } catch (error) {
    logger.error('Delete all notifications error:', error);
    res.status(500).json({ error: 'Failed to delete notifications' });
  }
});

module.exports = router;
