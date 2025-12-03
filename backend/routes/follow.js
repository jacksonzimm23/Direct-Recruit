const express = require('express');
const router = express.Router();
const Follow = require('../models/Follow');
const { authMiddleware } = require('../middleware/auth');

// Follow a user
router.post('/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.userId) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    const isAlreadyFollowing = await Follow.isFollowing(req.userId, userId);
    if (isAlreadyFollowing) {
      return res.status(400).json({ error: 'Already following this user' });
    }

    await Follow.follow(req.userId, userId);
    res.json({ message: 'Successfully followed user' });
  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ error: 'Failed to follow user' });
  }
});

// Unfollow a user
router.delete('/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await Follow.unfollow(req.userId, userId);
    if (!result) {
      return res.status(400).json({ error: 'Not following this user' });
    }

    res.json({ message: 'Successfully unfollowed user' });
  } catch (error) {
    console.error('Unfollow error:', error);
    res.status(500).json({ error: 'Failed to unfollow user' });
  }
});

// Get user's followers
router.get('/:userId/followers', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const followers = await Follow.getFollowers(userId, limit, offset);
    res.json({ followers, count: followers.length });
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({ error: 'Failed to fetch followers' });
  }
});

// Get user's following
router.get('/:userId/following', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const following = await Follow.getFollowing(userId, limit, offset);
    res.json({ following, count: following.length });
  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({ error: 'Failed to fetch following' });
  }
});

// Get follow counts for a user
router.get('/:userId/counts', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const counts = await Follow.getFollowCounts(userId);
    res.json(counts);
  } catch (error) {
    console.error('Get counts error:', error);
    res.status(500).json({ error: 'Failed to fetch counts' });
  }
});

// Check if current user follows another user
router.get('/:userId/check', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const isFollowing = await Follow.isFollowing(req.userId, userId);
    res.json({ isFollowing });
  } catch (error) {
    console.error('Check follow error:', error);
    res.status(500).json({ error: 'Failed to check follow status' });
  }
});

module.exports = router;
