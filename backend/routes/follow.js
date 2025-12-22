const express = require('express');
const router = express.Router();
const Follow = require('../models/Follow');
const Notification = require('../models/Notification');
const PlayerProfile = require('../models/PlayerProfile');
const CoachProfile = require('../models/CoachProfile');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const { getSignedS3Url } = require('../utils/s3');

// Helper function to add signed URLs to profiles array
async function addSignedUrlsToProfiles(profiles) {
  if (!profiles || !Array.isArray(profiles)) return profiles;

  return await Promise.all(profiles.map(async (profile) => {
    if (profile.profile_image_url && profile.profile_image_url.startsWith('profiles/')) {
      try {
        profile.profile_image_url = await getSignedS3Url(profile.profile_image_url);
      } catch (error) {
        console.error('Error generating signed URL:', error);
        profile.profile_image_url = null;
      }
    }
    return profile;
  }));
}

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

    // Create notification for the followed user
    try {
      const followerUser = await User.findById(req.userId);
      let followerName = 'Someone';

      if (followerUser.role === 'player') {
        const profile = await PlayerProfile.findByUserId(req.userId);
        if (profile) followerName = `${profile.first_name} ${profile.last_name}`;
      } else if (followerUser.role === 'coach') {
        const profile = await CoachProfile.findByUserId(req.userId);
        if (profile) followerName = `${profile.first_name} ${profile.last_name}`;
      }

      await Notification.createFollowNotification(userId, req.userId, followerName);
    } catch (notifError) {
      console.error('Failed to create follow notification:', notifError);
      // Don't fail the follow action if notification fails
    }

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

    let followers = await Follow.getFollowers(userId, limit, offset);
    followers = await addSignedUrlsToProfiles(followers);
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

    let following = await Follow.getFollowing(userId, limit, offset);
    following = await addSignedUrlsToProfiles(following);
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

// Check if another user follows the current user (reverse check)
router.get('/:userId/follows-me', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const followsMe = await Follow.isFollowing(userId, req.userId);
    res.json({ followsMe });
  } catch (error) {
    console.error('Check follows me error:', error);
    res.status(500).json({ error: 'Failed to check follow status' });
  }
});

module.exports = router;
