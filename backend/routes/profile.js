const express = require('express');
const router = express.Router();
const PlayerProfile = require('../models/PlayerProfile');
const CoachProfile = require('../models/CoachProfile');
const OtherProfile = require('../models/OtherProfile');
const User = require('../models/User');
const ProfileView = require('../models/ProfileView');
const Follow = require('../models/Follow');
const { authMiddleware, requireRole, validateUUID } = require('../middleware/auth');
const { validatePlayerProfile, validateCoachProfile, handleValidationErrors } = require('../middleware/validation');
const { getSignedS3Url } = require('../utils/s3');
const { apiLimiter } = require('../middleware/rateLimit');

// Helper function to convert S3 key to signed URL in profile
async function addSignedUrlToProfile(profile) {
  if (!profile) return profile;

  // Check if profile_image_url is an S3 key (starts with 'profiles/')
  if (profile.profile_image_url && profile.profile_image_url.startsWith('profiles/')) {
    try {
      profile.profile_image_url = await getSignedS3Url(profile.profile_image_url);
    } catch (error) {
      console.error('Error generating signed URL:', error);
      profile.profile_image_url = null;
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
      subheader: profile.subheader,
      company_name: profile.company_name,
      is_nil_brand: profile.is_nil_brand
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
router.post('/player', authMiddleware, requireRole('player'), validatePlayerProfile, handleValidationErrors, async (req, res) => {
  try {
    const existingProfile = await PlayerProfile.findByUserId(req.userId);

    let profile;
    if (existingProfile) {
      profile = await PlayerProfile.update(req.userId, req.body);
      // Update username in users table if it changed
      if (req.body.username) {
        await User.updateUsername(req.userId, req.body.username);
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
    console.error('Player profile error:', error);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

// Universal update endpoint (PUT /profile)
router.put('/', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let profile;
    if (user.role === 'player') {
      profile = await PlayerProfile.update(req.userId, req.body);
    } else if (user.role === 'coach') {
      profile = await CoachProfile.update(req.userId, req.body);
    } else if (user.role === 'other') {
      profile = await OtherProfile.update(req.userId, req.body);
    } else {
      return res.status(400).json({ error: 'Invalid user role' });
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
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Create/Update Coach Profile
router.post('/coach', authMiddleware, requireRole('coach'), validateCoachProfile, handleValidationErrors, async (req, res) => {
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
    console.error('Coach profile error:', error);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

// Create/Update Other Profile
router.post('/other', authMiddleware, requireRole('other'), async (req, res) => {
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
    console.error('Other profile error:', error);
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
    console.error('Get other profile error:', error);
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
    console.error('Get player profile error:', error);
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
    console.error('Get coach profile error:', error);
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
    console.error('Search players error:', error);
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
    const limit = parseInt(req.query.limit) || 9;
    const offset = parseInt(req.query.offset) || 0;

    const result = await PlayerProfile.searchHSPlayers(filters, limit, offset);
    result.players = await addSignedUrlsToProfiles(result.players);
    res.json({ players: result.players, hasMore: result.hasMore });
  } catch (error) {
    console.error('Discover HS players error:', error);
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
    const limit = parseInt(req.query.limit) || 9;
    const offset = parseInt(req.query.offset) || 0;

    const result = await PlayerProfile.searchCollegePlayers(filters, limit, offset);
    result.players = await addSignedUrlsToProfiles(result.players);
    res.json({ players: result.players, hasMore: result.hasMore });
  } catch (error) {
    console.error('Discover college players error:', error);
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
    const limit = parseInt(req.query.limit) || 9;
    const offset = parseInt(req.query.offset) || 0;

    const result = await PlayerProfile.searchTransferPlayers(filters, limit, offset);
    result.players = await addSignedUrlsToProfiles(result.players);
    res.json({ players: result.players, hasMore: result.hasMore });
  } catch (error) {
    console.error('Discover transfer players error:', error);
    res.status(500).json({ error: 'Failed to fetch transfer players' });
  }
});

// Discover Other Profiles
router.get('/discover/other', authMiddleware, async (req, res) => {
  try {
    const filters = {
      is_nil_brand: req.query.is_nil_brand,
      searchTerm: req.query.q,
      excludeUserId: req.userId // Exclude current user's profile
    };
    const limit = parseInt(req.query.limit) || 12;
    const offset = parseInt(req.query.offset) || 0;

    const result = await OtherProfile.discover(filters, limit, offset);
    result.profiles = await addSignedUrlsToProfiles(result.profiles);
    res.json({ profiles: result.profiles, hasMore: result.hasMore });
  } catch (error) {
    console.error('Discover other profiles error:', error);
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
    console.error('Search coaches error:', error);
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
    console.error('Universal search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Check username availability
router.get('/check-username/:username', apiLimiter, async (req, res) => {
  try {
    const { username } = req.params;

    // Check in users table (single source of truth for usernames)
    const existingUser = await User.findByUsername(username);

    res.json({
      available: !existingUser,
      username: username
    });
  } catch (error) {
    console.error('Check username error:', error);
    // Return available: true on error so user can proceed (server-side validation will still happen)
    res.json({ available: true, username: req.params.username });
  }
});

// Check email availability
router.get('/check-email/:email', apiLimiter, async (req, res) => {
  try {
    const { email } = req.params;

    // Check if email exists in users table
    const existingUser = await User.findByEmail(email);

    res.json({
      available: !existingUser,
      email: email
    });
  } catch (error) {
    console.error('Check email error:', error);
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
    console.error('Get profile by username error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Record a profile view (for HS players only)
router.post('/view/:userId', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const viewedPlayerId = req.params.userId;
    const viewerId = req.userId;

    // Check if the viewed user is an HS player (no college_division)
    const playerProfile = await PlayerProfile.findByUserId(viewedPlayerId);
    if (!playerProfile) {
      return res.status(404).json({ error: 'Player profile not found' });
    }

    // Only track views for HS players (those without college_division)
    if (playerProfile.college_division && playerProfile.college_division.trim() !== '') {
      return res.json({ success: true, isNewView: false, message: 'View tracking only for HS players' });
    }

    const isNewView = await ProfileView.recordView(viewedPlayerId, viewerId);

    res.json({
      success: true,
      isNewView,
      viewCount: await ProfileView.getViewCount(viewedPlayerId)
    });
  } catch (error) {
    console.error('Record profile view error:', error);
    res.status(500).json({ error: 'Failed to record profile view' });
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
    console.error('Get view count error:', error);
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
    console.error('Get viewers error:', error);
    res.status(500).json({ error: 'Failed to get viewers' });
  }
});

// Get random suggested connections (excludes current user)
router.get('/suggested-connections', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const offset = parseInt(req.query.offset) || 0;
    const currentUserId = req.userId;

    // Query to get random users from all profile types, excluding current user
    const pool = require('../config/database');

    const result = await pool.query(`
      SELECT
        u.id as user_id,
        u.role,
        COALESCE(pp.first_name, cp.first_name, op.first_name, '') as first_name,
        COALESCE(pp.last_name, cp.last_name, op.last_name, '') as last_name,
        COALESCE(pp.username, cp.username, op.username, '') as username,
        COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as profile_image_url,
        CASE
          WHEN u.role = 'player' THEN
            CASE
              WHEN pp.college_division IS NOT NULL AND pp.college_division != '' THEN
                CASE
                  WHEN pp.transfer = 'y' THEN COALESCE(pp.position, '')
                  ELSE COALESCE(pp.position, '')
                END
              ELSE COALESCE(pp.position, '')
            END
          WHEN u.role = 'coach' THEN COALESCE(cp.position_title, '')
          WHEN u.role = 'other' THEN COALESCE(op.subheader, '')
          ELSE ''
        END as subheader_line1,
        CASE
          WHEN u.role = 'player' THEN COALESCE(pp.team_name, '')
          WHEN u.role = 'coach' THEN COALESCE(cp.team_name, '')
          WHEN u.role = 'other' THEN ''
          ELSE ''
        END as subheader_line2,
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
      ORDER BY RANDOM()
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
    console.error('Get suggested connections error:', error);
    res.status(500).json({ error: 'Failed to fetch suggested connections' });
  }
});

module.exports = router;
