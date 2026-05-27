const express = require('express');
const router = express.Router();
const BlockedUser = require('../models/BlockedUser');
const { authMiddleware, validateUUID } = require('../middleware/auth');
const { getSignedS3Url } = require('../utils/s3');
const logger = require('../utils/logger');

// Sign profile image URLs in-place (same pattern as routes/follow.js)
async function signProfileImages(rows) {
  if (!rows || !Array.isArray(rows)) return rows;
  return await Promise.all(rows.map(async (row) => {
    if (row.profile_image_url && row.profile_image_url.startsWith('profiles/')) {
      try {
        row.profile_image_url = await getSignedS3Url(row.profile_image_url);
      } catch (e) {
        logger.error('Error signing profile image URL for blocked user:', e);
        row.profile_image_url = null;
      }
    }
    return row;
  }));
}

// GET /api/blocks — list users the current user has blocked.
// Used by Settings → Blocked Users (sub-plan #2d).
router.get('/', authMiddleware, async (req, res) => {
  try {
    const blocked = await BlockedUser.listForUser(req.userId);
    const withSignedUrls = await signProfileImages(blocked);
    res.json({ blocks: withSignedUrls });
  } catch (error) {
    logger.error('List blocks failed:', error);
    res.status(500).json({ error: 'Failed to load blocks' });
  }
});

// GET /api/blocks/check/:userId — does the current user have a block relationship
// with this user? Returns { blocked: bool, direction: 'i_blocked_them' | 'they_blocked_me' | null }
// Used by the frontend to show "Block" vs "Unblock" button on profile pages.
router.get('/check/:userId', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const iBlocked = await BlockedUser.didBlock(req.userId, userId);
    const theyBlocked = await BlockedUser.didBlock(userId, req.userId);
    let direction = null;
    if (iBlocked) direction = 'i_blocked_them';
    else if (theyBlocked) direction = 'they_blocked_me';
    res.json({
      blocked: iBlocked || theyBlocked,
      i_blocked_them: iBlocked,
      they_blocked_me: theyBlocked,
      direction
    });
  } catch (error) {
    logger.error('Check block failed:', error);
    res.status(500).json({ error: 'Failed to check block status' });
  }
});

// POST /api/blocks/:userId — block the given user.
// Side effects (in transaction): auto-unfollow both directions, hide existing
// 1:1 conversations on both sides, decrement follower/following counts.
router.post('/:userId', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId === req.userId) {
      return res.status(400).json({ error: 'Cannot block yourself' });
    }
    const result = await BlockedUser.create(req.userId, userId);
    res.status(201).json({ success: true, inserted: result.inserted });
  } catch (error) {
    if (error.message === 'Cannot block yourself') {
      return res.status(400).json({ error: error.message });
    }
    logger.error('Create block failed:', error);
    res.status(500).json({ error: 'Failed to block user' });
  }
});

// DELETE /api/blocks/:userId — unblock the given user. Does NOT restore the
// prior follow relationship or unhide the conversation history (matches
// Instagram/Twitter behavior).
router.delete('/:userId', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const removed = await BlockedUser.remove(req.userId, userId);
    if (!removed) {
      return res.status(404).json({ error: 'This user is not blocked' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('Remove block failed:', error);
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});

module.exports = router;
