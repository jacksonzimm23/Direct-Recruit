const express = require('express');
const router = express.Router();
const Follow = require('../models/Follow');
const Notification = require('../models/Notification');
const PlayerProfile = require('../models/PlayerProfile');
const CoachProfile = require('../models/CoachProfile');
const User = require('../models/User');
const { authMiddleware, validateUUID } = require('../middleware/auth');
const { getSignedS3Url } = require('../utils/s3');
const AiEngagement = require('../models/AiEngagement');
const logger = require('../utils/logger');

// Helper function to add signed URLs to profiles array
async function addSignedUrlsToProfiles(profiles) {
  if (!profiles || !Array.isArray(profiles)) return profiles;

  return await Promise.all(profiles.map(async (profile) => {
    if (profile.profile_image_url && profile.profile_image_url.startsWith('profiles/')) {
      try {
        profile.profile_image_url = await getSignedS3Url(profile.profile_image_url);
      } catch (error) {
        logger.error('Error generating signed URL:', error);
        profile.profile_image_url = null;
      }
    }
    return profile;
  }));
}

// Helper function to get user name
async function getUserName(userId) {
  const user = await User.findById(userId);
  let name = 'Someone';

  if (user.role === 'player') {
    const profile = await PlayerProfile.findByUserId(userId);
    if (profile) name = `${profile.first_name} ${profile.last_name}`;
  } else if (user.role === 'coach') {
    const profile = await CoachProfile.findByUserId(userId);
    if (profile) name = `${profile.first_name} ${profile.last_name}`;
  }

  return name;
}

// Follow a user (or send follow request if private)
router.post('/:userId', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.userId) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    const isAlreadyFollowing = await Follow.isFollowing(req.userId, userId);
    if (isAlreadyFollowing) {
      return res.status(400).json({ error: 'Already following this user' });
    }

    // Check if target user has a private profile
    const isPrivate = await Follow.isPrivateProfile(userId);

    if (isPrivate) {
      // Check if there's already a pending request
      const hasPending = await Follow.hasPendingFollowRequest(req.userId, userId);
      if (hasPending) {
        return res.status(400).json({ error: 'Follow request already pending' });
      }

      // Send follow request instead of instant follow
      await Follow.sendFollowRequest(req.userId, userId);

      // Create notification for follow request
      try {
        const requesterName = await getUserName(req.userId);
        await Notification.createFollowRequestNotification(userId, req.userId, requesterName);
      } catch (notifError) {
        logger.error('Failed to create follow request notification:', notifError);
      }

      // Track AI engagement (fire-and-forget)
      AiEngagement.trackIfAiDriven(req.userId, userId, 'follow')
        .catch(err => logger.error('Engagement track error:', err.message));
      res.json({ message: 'Follow request sent', requestPending: true });
    } else {
      // Public profile - instant follow
      await Follow.follow(req.userId, userId);

      // Create notification for the followed user
      try {
        const followerName = await getUserName(req.userId);
        await Notification.createFollowNotification(userId, req.userId, followerName);
      } catch (notifError) {
        logger.error('Failed to create follow notification:', notifError);
        // Don't fail the follow action if notification fails
      }

      // Track AI engagement (fire-and-forget)
      AiEngagement.trackIfAiDriven(req.userId, userId, 'follow')
        .catch(err => logger.error('Engagement track error:', err.message));
      res.json({ message: 'Successfully followed user', requestPending: false });
    }
  } catch (error) {
    logger.error('Follow error:', error);
    res.status(500).json({ error: 'Failed to follow user' });
  }
});

// Unfollow a user
router.delete('/:userId', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await Follow.unfollow(req.userId, userId);
    if (!result) {
      return res.status(400).json({ error: 'Not following this user' });
    }

    res.json({ message: 'Successfully unfollowed user' });
  } catch (error) {
    logger.error('Unfollow error:', error);
    res.status(500).json({ error: 'Failed to unfollow user' });
  }
});

// Get user's followers
router.get('/:userId/followers', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const isPrivate = await Follow.isPrivateProfile(userId);
    const isOwnProfile = req.userId === userId;
    const isFollowing = await Follow.isFollowing(req.userId, userId);
    if (isPrivate && !isOwnProfile && !isFollowing) {
      return res.status(403).json({ error: 'This account is private', isPrivate: true });
    }

    let followers = await Follow.getFollowers(userId, limit, offset);
    followers = await addSignedUrlsToProfiles(followers);
    res.json({ followers, count: followers.length });
  } catch (error) {
    logger.error('Get followers error:', error);
    res.status(500).json({ error: 'Failed to fetch followers' });
  }
});

// Get user's following
router.get('/:userId/following', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const isPrivate = await Follow.isPrivateProfile(userId);
    const isOwnProfile = req.userId === userId;
    const isFollowing = await Follow.isFollowing(req.userId, userId);
    if (isPrivate && !isOwnProfile && !isFollowing) {
      return res.status(403).json({ error: 'This account is private', isPrivate: true });
    }

    let following = await Follow.getFollowing(userId, limit, offset);
    following = await addSignedUrlsToProfiles(following);
    res.json({ following, count: following.length });
  } catch (error) {
    logger.error('Get following error:', error);
    res.status(500).json({ error: 'Failed to fetch following' });
  }
});

// Get follow counts for a user
router.get('/:userId/counts', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const counts = await Follow.getFollowCounts(userId);
    res.json(counts);
  } catch (error) {
    logger.error('Get counts error:', error);
    res.status(500).json({ error: 'Failed to fetch counts' });
  }
});

// Check if current user follows another user
router.get('/:userId/check', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const isFollowing = await Follow.isFollowing(req.userId, userId);
    res.json({ isFollowing });
  } catch (error) {
    logger.error('Check follow error:', error);
    res.status(500).json({ error: 'Failed to check follow status' });
  }
});

// Check if another user follows the current user (reverse check)
router.get('/:userId/follows-me', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const followsMe = await Follow.isFollowing(userId, req.userId);
    res.json({ followsMe });
  } catch (error) {
    logger.error('Check follows me error:', error);
    res.status(500).json({ error: 'Failed to check follow status' });
  }
});

// Check follow request status for a user
router.get('/:userId/request-status', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const hasPending = await Follow.hasPendingFollowRequest(req.userId, userId);
    const isPrivate = await Follow.isPrivateProfile(userId);
    res.json({ hasPendingRequest: hasPending, isPrivateProfile: isPrivate });
  } catch (error) {
    logger.error('Check request status error:', error);
    res.status(500).json({ error: 'Failed to check request status' });
  }
});

// Cancel an outgoing follow request
router.delete('/:userId/request', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await Follow.cancelFollowRequest(req.userId, userId);
    if (!result) {
      return res.status(400).json({ error: 'No pending follow request found' });
    }
    // Clean up the follow request notification so re-following can create a new one
    await Notification.deleteFollowRequestNotification(userId, req.userId);
    res.json({ message: 'Follow request cancelled' });
  } catch (error) {
    logger.error('Cancel follow request error:', error);
    res.status(500).json({ error: 'Failed to cancel follow request' });
  }
});

// Get incoming follow requests (requests others have sent to the user)
router.get('/requests/incoming', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    let requests = await Follow.getIncomingFollowRequests(req.userId, limit, offset);
    requests = await addSignedUrlsToProfiles(requests);
    res.json({ requests, count: requests.length });
  } catch (error) {
    logger.error('Get incoming requests error:', error);
    res.status(500).json({ error: 'Failed to fetch incoming follow requests' });
  }
});

// Get outgoing follow requests (requests the user has sent)
router.get('/requests/outgoing', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    let requests = await Follow.getOutgoingFollowRequests(req.userId, limit, offset);
    requests = await addSignedUrlsToProfiles(requests);
    res.json({ requests, count: requests.length });
  } catch (error) {
    logger.error('Get outgoing requests error:', error);
    res.status(500).json({ error: 'Failed to fetch outgoing follow requests' });
  }
});

// Get count of pending incoming follow requests
router.get('/requests/count', authMiddleware, async (req, res) => {
  try {
    const count = await Follow.countPendingFollowRequests(req.userId);
    res.json({ count });
  } catch (error) {
    logger.error('Get request count error:', error);
    res.status(500).json({ error: 'Failed to fetch follow request count' });
  }
});

// Accept a follow request
router.post('/requests/:requestId/accept', authMiddleware, validateUUID('requestId'), async (req, res) => {
  try {
    const { requestId } = req.params;

    // Verify the request is for the current user
    const request = await Follow.getFollowRequestById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Follow request not found' });
    }
    if (request.target_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to accept this request' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Follow request already processed' });
    }

    await Follow.acceptFollowRequest(requestId);

    // Create notification for the requester that their request was accepted
    try {
      const accepterName = await getUserName(req.userId);
      await Notification.createFollowRequestAcceptedNotification(request.requester_id, req.userId, accepterName);
    } catch (notifError) {
      logger.error('Failed to create follow request accepted notification:', notifError);
    }

    res.json({ message: 'Follow request accepted' });
  } catch (error) {
    logger.error('Accept follow request error:', error);
    res.status(500).json({ error: 'Failed to accept follow request' });
  }
});

// Decline a follow request
router.post('/requests/:requestId/decline', authMiddleware, validateUUID('requestId'), async (req, res) => {
  try {
    const { requestId } = req.params;

    // Verify the request is for the current user
    const request = await Follow.getFollowRequestById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Follow request not found' });
    }
    if (request.target_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to decline this request' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Follow request already processed' });
    }

    await Follow.declineFollowRequest(requestId);
    res.json({ message: 'Follow request declined' });
  } catch (error) {
    logger.error('Decline follow request error:', error);
    res.status(500).json({ error: 'Failed to decline follow request' });
  }
});

// Accept a follow request by requester user ID (for use from notifications)
router.post('/requests/user/:userId/accept', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const { userId } = req.params;

    // Find pending request from this user to current user
    const request = await Follow.getPendingRequestByUsers(userId, req.userId);
    if (!request) {
      // Request was cancelled or doesn't exist - return success but indicate no action taken
      // This matches Instagram behavior where accepting a cancelled request just dismisses it
      return res.json({ message: 'Follow request no longer exists', requestCancelled: true });
    }

    await Follow.acceptFollowRequest(request.id);

    // Create notification for the requester that their request was accepted
    try {
      const accepterName = await getUserName(req.userId);
      await Notification.createFollowRequestAcceptedNotification(userId, req.userId, accepterName);
    } catch (notifError) {
      logger.error('Failed to create follow request accepted notification:', notifError);
    }

    res.json({ message: 'Follow request accepted', requestCancelled: false });
  } catch (error) {
    logger.error('Accept follow request by user error:', error);
    res.status(500).json({ error: 'Failed to accept follow request' });
  }
});

// Decline a follow request by requester user ID (for use from notifications)
router.post('/requests/user/:userId/decline', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const { userId } = req.params;

    // Find pending request from this user to current user
    const request = await Follow.getPendingRequestByUsers(userId, req.userId);
    if (!request) {
      // Request was cancelled or doesn't exist - return success but indicate no action taken
      // This matches Instagram behavior where declining a cancelled request just dismisses it
      return res.json({ message: 'Follow request no longer exists', requestCancelled: true });
    }

    await Follow.declineFollowRequest(request.id);
    res.json({ message: 'Follow request declined', requestCancelled: false });
  } catch (error) {
    logger.error('Decline follow request by user error:', error);
    res.status(500).json({ error: 'Failed to decline follow request' });
  }
});

// Check if current user can message another user
router.get('/can-message/:userId', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await Follow.canMessage(req.userId, userId);
    res.json(result);
  } catch (error) {
    logger.error('Check can message error:', error);
    res.status(500).json({ error: 'Failed to check message permissions' });
  }
});

module.exports = router;
