const express = require('express');
const router = express.Router();
const PlayerProfile = require('../models/PlayerProfile');
const CoachProfile = require('../models/CoachProfile');
const OtherProfile = require('../models/OtherProfile');
const User = require('../models/User');
const ProfileView = require('../models/ProfileView');
const CoachProfileView = require('../models/CoachProfileView');
const Follow = require('../models/Follow');
const Notification = require('../models/Notification');
const PortalWatchlist = require('../models/PortalWatchlist');
const { authMiddleware, requireRole, validateUUID } = require('../middleware/auth');
const { validationResult } = require('express-validator');
const { validatePlayerProfile, validateCoachProfile, validateOtherProfile, validatePlayerProfileUpdate, validateCoachProfileUpdate, validateOtherProfileUpdate, handleValidationErrors, sanitizeBody } = require('../middleware/validation');
const { getSignedS3Url } = require('../utils/s3');
const { apiLimiter, availabilityLimiter } = require('../middleware/rateLimit');
const AiEngagement = require('../models/AiEngagement');
const logger = require('../utils/logger');

// Helper function to convert S3 key to signed URL in profile
async function addSignedUrlToProfile(profile) {
  if (!profile) return profile;

  // Check if profile_image_url is an S3 key (starts with 'profiles/')
  if (profile.profile_image_url && profile.profile_image_url.startsWith('profiles/')) {
    try {
      profile.profile_image_url = await getSignedS3Url(profile.profile_image_url);
    } catch (error) {
      logger.error('Error generating signed URL:', error);
      profile.profile_image_url = null;
    }
  }

  // Also check profile_picture_url for other profiles
  if (profile.profile_picture_url && profile.profile_picture_url.startsWith('profiles/')) {
    try {
      profile.profile_picture_url = await getSignedS3Url(profile.profile_picture_url);
    } catch (error) {
      logger.error('Error generating signed URL for profile_picture_url:', error);
      profile.profile_picture_url = null;
    }
  }

  return profile;
}

// Helper function to add signed URLs to an array of profiles
async function addSignedUrlsToProfiles(profiles) {
  if (!profiles || !Array.isArray(profiles)) return profiles;

  return await Promise.all(profiles.map(profile => addSignedUrlToProfile(profile)));
}

// Helper function to filter profile data for private profiles
// Returns only header-level information (profile picture, name, username, basic info)
// Excludes detailed content like bio, stats, academics, social links, etc.
function getPrivateProfileData(profile, profileType) {
  if (!profile) return null;

  // Common fields visible for all private profiles (header section only)
  const baseFields = {
    user_id: profile.user_id,
    first_name: profile.first_name,
    last_name: profile.last_name,
    username: profile.username,
    profile_visibility: profile.profile_visibility,
    followers_count: profile.followers_count,
    following_count: profile.following_count,
    created_at: profile.created_at,
    // Mark this as a private profile response
    is_private_view: true
  };

  if (profileType === 'player') {
    return {
      ...baseFields,
      profile_image_url: profile.profile_image_url,
      position: profile.position,
      team_name: profile.team_name,
      city: profile.city,
      state: profile.state,
      graduation_year: profile.graduation_year,
      college_division: profile.college_division,
      transfer: profile.transfer,
      player_status: profile.player_status,
      // Include height/weight for header display (Row 1: Position • Height • Weight • Class)
      height: profile.height,
      weight: profile.weight,
      // Include eligibility for transfer player header display
      eligibility: profile.eligibility
    };
  } else if (profileType === 'coach') {
    return {
      ...baseFields,
      profile_image_url: profile.profile_image_url,
      position_title: profile.position_title,
      team_name: profile.team_name,
      school_name: profile.school_name,
      city: profile.city,
      state: profile.state,
      college_division: profile.college_division,
      coach_type: profile.coach_type
    };
  } else if (profileType === 'other') {
    return {
      ...baseFields,
      profile_picture_url: profile.profile_picture_url,
      subheader: profile.subheader
    };
  }

  return baseFields;
}

// Helper function to check if viewer can see full profile
// Returns access info - canView: false means show overlay on tabs, but we still return full profile data
async function canViewFullProfile(viewerId, profileUserId) {
  // Owner can always see their own full profile
  if (viewerId === profileUserId) {
    return { canView: true, reason: 'owner' };
  }

  // Check if profile is private
  const isPrivate = await Follow.isPrivateProfile(profileUserId);
  if (!isPrivate) {
    return { canView: true, reason: 'public' };
  }

  // Check if viewer follows the private profile
  const isFollowing = await Follow.isFollowing(viewerId, profileUserId);
  if (isFollowing) {
    return { canView: true, reason: 'following' };
  }

  // Check if there's a pending follow request
  const hasPendingRequest = await Follow.hasPendingFollowRequest(viewerId, profileUserId);

  // Return limited access - frontend will show overlay on tabs but still display profile header/info
  return {
    canView: false,
    reason: 'private',
    hasPendingRequest
  };
}

// Create/Update Player Profile
router.post('/player', authMiddleware, requireRole('player'), sanitizeBody, validatePlayerProfile, handleValidationErrors, async (req, res) => {
  try {
    const existingProfile = await PlayerProfile.findByUserId(req.userId);

    let profile;
    if (existingProfile) {
      const oldTransfer = existingProfile.transfer;
      profile = await PlayerProfile.update(req.userId, req.body);
      // Update username in users table if it changed
      if (req.body.username) {
        await User.updateUsername(req.userId, req.body.username);
      }
      // Portal watchlist: notify coaches if player just entered the transfer portal
      if (oldTransfer !== 'y' && profile.transfer === 'y') {
        try {
          const coachIds = await PortalWatchlist.getCoachesWatching(req.userId);
          const playerName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
          for (const coachId of coachIds) {
            await Notification.createPortalEntryNotification(coachId, req.userId, playerName, profile.position, profile.team_name);
          }
        } catch (notifError) {
          logger.error('Failed to send portal watchlist notifications:', notifError);
        }
      }
    } else {
      profile = await PlayerProfile.create(req.userId, req.body);
      // Save username to users table
      if (req.body.username) {
        await User.updateUsername(req.userId, req.body.username);
      }
      await User.markProfileCompleted(req.userId);
    }

    res.json({
      message: existingProfile ? 'Profile updated' : 'Profile created',
      profile
    });
  } catch (error) {
    logger.error('Player profile error:', error);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

// Universal update endpoint (PUT /profile)
router.put('/', authMiddleware, sanitizeBody, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Run role-specific validation before updating
    let validators;
    if (user.role === 'player') {
      validators = validatePlayerProfileUpdate;
    } else if (user.role === 'coach') {
      validators = validateCoachProfileUpdate;
    } else if (user.role === 'other') {
      validators = validateOtherProfileUpdate;
    } else {
      return res.status(400).json({ error: 'Invalid user role' });
    }

    await Promise.all(validators.map(v => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(err => err.msg).join(', ');
      return res.status(400).json({
        error: errorMessages,
        details: errors.array()
      });
    }

    let profile;
    if (user.role === 'player') {
      const oldProfile = await PlayerProfile.findByUserId(req.userId);
      profile = await PlayerProfile.update(req.userId, req.body);
      // Portal watchlist: notify coaches if player just entered the transfer portal
      if (oldProfile && oldProfile.transfer !== 'y' && profile.transfer === 'y') {
        try {
          const coachIds = await PortalWatchlist.getCoachesWatching(req.userId);
          const playerName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
          for (const coachId of coachIds) {
            await Notification.createPortalEntryNotification(coachId, req.userId, playerName, profile.position, profile.team_name);
          }
        } catch (notifError) {
          logger.error('Failed to send portal watchlist notifications:', notifError);
        }
      }
    } else if (user.role === 'coach') {
      profile = await CoachProfile.update(req.userId, req.body);
    } else if (user.role === 'other') {
      profile = await OtherProfile.update(req.userId, req.body);
    }

    // Update username in users table if it changed
    if (req.body.username) {
      await User.updateUsername(req.userId, req.body.username);
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      profile
    });
  } catch (error) {
    logger.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Create/Update Coach Profile
router.post('/coach', authMiddleware, requireRole('coach'), sanitizeBody, validateCoachProfile, handleValidationErrors, async (req, res) => {
  try {
    const existingProfile = await CoachProfile.findByUserId(req.userId);

    let profile;
    if (existingProfile) {
      profile = await CoachProfile.update(req.userId, req.body);
      // Update username in users table if it changed
      if (req.body.username) {
        await User.updateUsername(req.userId, req.body.username);
      }
    } else {
      profile = await CoachProfile.create(req.userId, req.body);
      // Save username to users table
      if (req.body.username) {
        await User.updateUsername(req.userId, req.body.username);
      }
      await User.markProfileCompleted(req.userId);
    }

    res.json({
      message: existingProfile ? 'Profile updated' : 'Profile created',
      profile
    });
  } catch (error) {
    logger.error('Coach profile error:', error);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

// Create/Update Other Profile
router.post('/other', authMiddleware, requireRole('other'), sanitizeBody, validateOtherProfile, handleValidationErrors, async (req, res) => {
  try {
    const existingProfile = await OtherProfile.findByUserId(req.userId);

    let profile;
    if (existingProfile) {
      profile = await OtherProfile.update(req.userId, req.body);
      // Update username in users table if it changed
      if (req.body.username) {
        await User.updateUsername(req.userId, req.body.username);
      }
    } else {
      profile = await OtherProfile.create(req.userId, req.body);
      // Save username to users table
      if (req.body.username) {
        await User.updateUsername(req.userId, req.body.username);
      }
      await User.markProfileCompleted(req.userId);
    }

    res.json({
      message: existingProfile ? 'Profile updated' : 'Profile created',
      profile
    });
  } catch (error) {
    logger.error('Other profile error:', error);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

// Get Other Profile
router.get('/other/:userId', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    let profile = await OtherProfile.findByUserId(req.params.userId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Check if viewer can see full profile
    const viewAccess = await canViewFullProfile(req.userId, req.params.userId);

    // Convert S3 key to signed URL
    profile = await addSignedUrlToProfile(profile);

    // Filter profile data for private profiles - only return public header info
    const responseProfile = viewAccess.canView
      ? profile
      : getPrivateProfileData(profile, 'other');

    res.json({
      profile: responseProfile,
      accessLevel: viewAccess.canView ? 'full' : 'limited',
      accessReason: viewAccess.reason,
      hasPendingRequest: viewAccess.hasPendingRequest || false
    });
  } catch (error) {
    logger.error('Get other profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Get Player Profile
router.get('/player/:userId', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    let profile = await PlayerProfile.findByUserId(req.params.userId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Check if viewer can see full profile
    const viewAccess = await canViewFullProfile(req.userId, req.params.userId);

    // Convert S3 key to signed URL
    profile = await addSignedUrlToProfile(profile);

    // Filter profile data for private profiles - only return public header info
    const responseProfile = viewAccess.canView
      ? profile
      : getPrivateProfileData(profile, 'player');

    res.json({
      profile: responseProfile,
      accessLevel: viewAccess.canView ? 'full' : 'limited',
      accessReason: viewAccess.reason,
      hasPendingRequest: viewAccess.hasPendingRequest || false
    });
  } catch (error) {
    logger.error('Get player profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Get Coach Profile
router.get('/coach/:userId', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    let profile = await CoachProfile.findByUserId(req.params.userId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Check if viewer can see full profile
    const viewAccess = await canViewFullProfile(req.userId, req.params.userId);

    // Convert S3 key to signed URL
    profile = await addSignedUrlToProfile(profile);

    // Filter profile data for private profiles - only return public header info
    const responseProfile = viewAccess.canView
      ? profile
      : getPrivateProfileData(profile, 'coach');

    res.json({
      profile: responseProfile,
      accessLevel: viewAccess.canView ? 'full' : 'limited',
      accessReason: viewAccess.reason,
      hasPendingRequest: viewAccess.hasPendingRequest || false
    });
  } catch (error) {
    logger.error('Get coach profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Search Players
router.get('/search/players', authMiddleware, async (req, res) => {
  try {
    const filters = {
      position: req.query.position,
      graduation_year: req.query.graduation_year,
      state: req.query.state,
      searchTerm: req.query.q
    };
    let players = await PlayerProfile.search(filters);
    players = await addSignedUrlsToProfiles(players);
    res.json({ players });
  } catch (error) {
    logger.error('Search players error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Discover HS Players (for college coaches) - only players without college_division
router.get('/discover/hsplayers', authMiddleware, async (req, res) => {
  try {
    const filters = {
      position: req.query.position,
      graduation_year: req.query.graduation_year,
      state: req.query.state,
      min_height: req.query.min_height,
      min_weight: req.query.min_weight,
      min_gpa: req.query.min_gpa,
      searchTerm: req.query.q,
      excludeUserId: req.userId // Exclude current user's profile
    };
    const limit = Math.min(parseInt(req.query.limit) || 9, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const result = await PlayerProfile.searchHSPlayers(filters, limit, offset);
    result.players = await addSignedUrlsToProfiles(result.players);
    res.json({ players: result.players, hasMore: result.hasMore });
  } catch (error) {
    logger.error('Discover HS players error:', error);
    res.status(500).json({ error: 'Failed to fetch HS players' });
  }
});

// Discover College Players - only players WITH college_division
router.get('/discover/collegeplayers', authMiddleware, async (req, res) => {
  try {
    const filters = {
      position: req.query.position,
      college_division: req.query.college_division,
      state: req.query.state,
      searchTerm: req.query.q,
      excludeUserId: req.userId // Exclude current user's profile
    };
    const limit = Math.min(parseInt(req.query.limit) || 9, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const result = await PlayerProfile.searchCollegePlayers(filters, limit, offset);
    result.players = await addSignedUrlsToProfiles(result.players);
    res.json({ players: result.players, hasMore: result.hasMore });
  } catch (error) {
    logger.error('Discover college players error:', error);
    res.status(500).json({ error: 'Failed to fetch college players' });
  }
});

// Discover Transfer Players - only players with transfer = 'y'
router.get('/discover/transferplayers', authMiddleware, async (req, res) => {
  try {
    const filters = {
      position: req.query.position,
      eligibility: req.query.eligibility,
      college_division: req.query.college_division,
      min_height: req.query.min_height,
      min_weight: req.query.min_weight,
      min_gpa: req.query.min_gpa,
      searchTerm: req.query.q,
      excludeUserId: req.userId // Exclude current user's profile
    };
    const limit = Math.min(parseInt(req.query.limit) || 9, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const result = await PlayerProfile.searchTransferPlayers(filters, limit, offset);
    result.players = await addSignedUrlsToProfiles(result.players);
    res.json({ players: result.players, hasMore: result.hasMore });
  } catch (error) {
    logger.error('Discover transfer players error:', error);
    res.status(500).json({ error: 'Failed to fetch transfer players' });
  }
});

// Discover Other Profiles
router.get('/discover/other', authMiddleware, async (req, res) => {
  try {
    const filters = {
      searchTerm: req.query.q,
      excludeUserId: req.userId // Exclude current user's profile
    };
    const limit = Math.min(parseInt(req.query.limit) || 12, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const result = await OtherProfile.discover(filters, limit, offset);
    result.profiles = await addSignedUrlsToProfiles(result.profiles);
    res.json({ profiles: result.profiles, hasMore: result.hasMore });
  } catch (error) {
    logger.error('Discover other profiles error:', error);
    res.status(500).json({ error: 'Failed to fetch other profiles' });
  }
});

// Search Coaches
router.get('/search/coaches', authMiddleware, async (req, res) => {
  try {
    const filters = {
      college_division: req.query.college_division,
      state: req.query.state,
      searchTerm: req.query.q
    };
    let coaches = await CoachProfile.search(filters);
    coaches = await addSignedUrlsToProfiles(coaches);
    res.json({ coaches });
  } catch (error) {
    logger.error('Search coaches error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Universal search (players, coaches, and other profiles)
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const searchTerm = req.query.q;

    if (!searchTerm) {
      return res.json({ results: [] });
    }

    let [players, coaches, others] = await Promise.all([
      PlayerProfile.search({ searchTerm }),
      CoachProfile.search({ searchTerm }),
      OtherProfile.search({ searchTerm })
    ]);

    // Add signed URLs to profile images
    [players, coaches, others] = await Promise.all([
      addSignedUrlsToProfiles(players),
      addSignedUrlsToProfiles(coaches),
      addSignedUrlsToProfiles(others)
    ]);

    // Combine all results into a single array with role indicator
    const results = [
      ...players.map(p => ({ ...p, role: 'player' })),
      ...coaches.map(c => ({ ...c, role: 'coach' })),
      ...others.map(o => ({ ...o, role: 'other' }))
    ];

    res.json({ results });
  } catch (error) {
    logger.error('Universal search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Check username availability
router.get('/check-username/:username', availabilityLimiter, async (req, res) => {
  try {
    const { username } = req.params;

    // Check in users table (single source of truth for usernames)
    const existingUser = await User.findByUsername(username);

    res.json({
      available: !existingUser,
      username: username
    });
  } catch (error) {
    logger.error('Check username error:', error);
    // Return available: true on error so user can proceed (server-side validation will still happen)
    res.json({ available: true, username: req.params.username });
  }
});

// Check email availability
router.get('/check-email/:email', availabilityLimiter, async (req, res) => {
  try {
    const { email } = req.params;

    // Check if email exists in users table
    const existingUser = await User.findByEmail(email);

    res.json({
      available: !existingUser,
      email: email
    });
  } catch (error) {
    logger.error('Check email error:', error);
    res.status(500).json({ error: 'Failed to check email' });
  }
});

// Get profile by username
router.get('/username/:username', authMiddleware, async (req, res) => {
  try {
    const { username } = req.params;

    let profile = null;
    let profileType = null;

    // Try to find profile in each table
    profile = await PlayerProfile.findByUsername(username);
    if (profile) {
      profileType = 'player';
    }

    if (!profile) {
      profile = await CoachProfile.findByUsername(username);
      if (profile) {
        profileType = 'coach';
      }
    }

    if (!profile) {
      profile = await OtherProfile.findByUsername(username);
      if (profile) {
        profileType = 'other';
      }
    }

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Check if viewer can see full profile
    const viewAccess = await canViewFullProfile(req.userId, profile.user_id);

    // Add signed URL to profile image
    profile = await addSignedUrlToProfile(profile);

    // Filter profile data for private profiles - only return public header info
    const responseProfile = viewAccess.canView
      ? profile
      : getPrivateProfileData(profile, profileType);

    return res.json({
      profile: responseProfile,
      type: profileType,
      accessLevel: viewAccess.canView ? 'full' : 'limited',
      accessReason: viewAccess.reason,
      hasPendingRequest: viewAccess.hasPendingRequest || false
    });
  } catch (error) {
    logger.error('Get profile by username error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Record a profile view (all profile types, 2-day cooldown per viewer)
router.post('/view/:userId', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const viewedUserId = req.params.userId;
    const viewerId = req.userId;

    const isNewView = await ProfileView.recordView(viewedUserId, viewerId);

    // If new view and viewed user is an HS player, increment cc_views for backward compat
    if (isNewView) {
      const playerProfile = await PlayerProfile.findByUserId(viewedUserId);
      if (playerProfile && (!playerProfile.college_division || playerProfile.college_division.trim() === '')) {
        const pool = require('../config/database');
        await pool.query(
          `UPDATE player_profiles SET cc_views = COALESCE(cc_views, 0) + 1 WHERE user_id = $1`,
          [viewedUserId]
        );
      }
    }

    // Track AI engagement (fire-and-forget)
    AiEngagement.trackIfAiDriven(viewerId, viewedUserId, 'profile_view')
      .catch(err => logger.error('Engagement track error:', err.message));

    res.json({
      success: true,
      isNewView,
      viewCount: await ProfileView.getViewCount(viewedUserId)
    });
  } catch (error) {
    logger.error('Record profile view error:', error);
    res.status(500).json({ error: 'Failed to record profile view' });
  }
});

// Record a coach profile view (for Portal Intelligence signal tracking)
router.post('/coach-view/:userId', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const viewedCoachId = req.params.userId;
    const viewerId = req.userId;

    // Only record if the viewer is a player
    const viewer = await User.findById(viewerId);
    if (!viewer || viewer.role !== 'player') {
      return res.json({ success: true, recorded: false });
    }

    // Only record if the viewed user is a coach
    const coachProfile = await CoachProfile.findByUserId(viewedCoachId);
    if (!coachProfile) {
      return res.json({ success: true, recorded: false });
    }

    await CoachProfileView.recordView(viewedCoachId, viewerId);
    res.json({ success: true, recorded: true });
  } catch (error) {
    logger.error('Record coach profile view error:', error);
    res.status(500).json({ error: 'Failed to record coach profile view' });
  }
});

// Get profile view count for a player (owner only)
router.get('/views/:userId', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const playerId = req.params.userId;

    // Only allow the profile owner to see their view count
    if (req.userId !== playerId) {
      return res.status(403).json({ error: 'Not authorized to view this information' });
    }

    const viewCount = await ProfileView.getViewCount(playerId);

    res.json({ viewCount });
  } catch (error) {
    logger.error('Get view count error:', error);
    res.status(500).json({ error: 'Failed to get view count' });
  }
});

// Get list of viewers for a player's profile
router.get('/viewers/:userId', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const playerId = req.params.userId;

    // Only allow the profile owner to see their viewers
    if (req.userId !== playerId) {
      return res.status(403).json({ error: 'Not authorized to view this information' });
    }

    let viewers = await ProfileView.getViewers(playerId);
    // Add signed URLs to viewer profile images
    viewers = await addSignedUrlsToProfiles(viewers);

    res.json({ viewers });
  } catch (error) {
    logger.error('Get viewers error:', error);
    res.status(500).json({ error: 'Failed to get viewers' });
  }
});

// Get random suggested connections (excludes current user)
router.get('/suggested-connections', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 5, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const currentUserId = req.userId;

    // Query to get suggested connections ranked by engagement + relevance signals
    const pool = require('../config/database');

    const result = await pool.query(`
      SELECT
        u.id as user_id,
        u.role,
        COALESCE(pp.first_name, cp.first_name, op.first_name, '') as first_name,
        COALESCE(pp.last_name, cp.last_name, op.last_name, '') as last_name,
        COALESCE(pp.username, cp.username, op.username, '') as username,
        COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as profile_image_url,
        COALESCE(pp.position, '') as player_position,
        COALESCE(pp.team_name, cp.team_name, '') as team_name,
        COALESCE(pp.state, cp.state, '') as state,
        pp.height as player_height,
        pp.weight as player_weight,
        pp.graduation_year as graduation_year,
        COALESCE(pp.college_division, cp.college_division, '') as college_division,
        pp.eligibility as eligibility,
        COALESCE(pp.transfer, '') as transfer,
        COALESCE(cp.position_title, '') as coach_position_title,
        COALESCE(op.subheader, '') as other_subheader,
        CASE
          WHEN u.role = 'player' THEN
            CASE
              WHEN pp.transfer = 'y' THEN 'transfer'
              WHEN pp.college_division IS NOT NULL AND pp.college_division != '' THEN 'college'
              ELSE 'hs'
            END
          WHEN u.role = 'coach' THEN
            CASE
              WHEN cp.college_division IS NOT NULL AND cp.college_division != '' THEN 'college'
              ELSE 'hs'
            END
          WHEN u.role = 'other' THEN 'other'
          ELSE 'unknown'
        END as profile_type
      FROM users u
      LEFT JOIN player_profiles pp ON u.id = pp.user_id
      LEFT JOIN coach_profiles cp ON u.id = cp.user_id
      LEFT JOIN other_profiles op ON u.id = op.user_id
      WHERE u.id != $1
        AND u.profile_completed = true
        AND u.is_active = true
        AND (pp.user_id IS NOT NULL OR cp.user_id IS NOT NULL OR op.user_id IS NOT NULL)
        AND u.id NOT IN (SELECT following_id FROM follows WHERE follower_id = $1)
      ORDER BY (
        -- Base engagement: followers + profile views + post engagement
        (COALESCE(pp.followers_count, cp.followers_count, op.followers_count, 0) * 3.0)
        + (COALESCE(pp.cc_views, 0) * 1.0)
        + COALESCE((
            SELECT SUM(COALESCE(p.engagement_score, 0))
            FROM posts p
            WHERE p.user_id = u.id
              AND p.created_at > NOW() - INTERVAL '30 days'
              AND (p.is_deleted = false OR p.is_deleted IS NULL)
          ), 0) * 2.0
        -- Same-state bonus
        + CASE WHEN COALESCE(pp.state, cp.state, '') = (
            SELECT COALESCE(pp2.state, cp2.state, '')
            FROM users u2
            LEFT JOIN player_profiles pp2 ON u2.id = pp2.user_id
            LEFT JOIN coach_profiles cp2 ON u2.id = cp2.user_id
            WHERE u2.id = $1
          ) AND COALESCE(pp.state, cp.state, '') != '' THEN 10.0 ELSE 0 END
        -- Mutual connections bonus (friends of friends)
        + COALESCE((
            SELECT COUNT(*) * 5.0
            FROM follows f1
            JOIN follows f2 ON f1.following_id = f2.follower_id
            WHERE f1.follower_id = $1
              AND f2.following_id = u.id
              AND f2.following_id != $1
          ), 0)
        -- Small random factor to add variety
        + (RANDOM() * 2.0)
      ) DESC NULLS LAST
      LIMIT $2 OFFSET $3
    `, [currentUserId, limit + 1, offset]);

    const connections = result.rows.slice(0, limit);
    const hasMore = result.rows.length > limit;

    // Add signed URLs to profile images
    const connectionsWithUrls = await addSignedUrlsToProfiles(connections);

    res.json({
      connections: connectionsWithUrls,
      hasMore
    });
  } catch (error) {
    logger.error('Get suggested connections error:', error);
    res.status(500).json({ error: 'Failed to fetch suggested connections' });
  }
});

module.exports = router;
