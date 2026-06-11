const express = require('express');
const router = express.Router();
const PlayerProfile = require('../models/PlayerProfile');
const CoachProfile = require('../models/CoachProfile');
const OtherProfile = require('../models/OtherProfile');
const User = require('../models/User');
const ProfileView = require('../models/ProfileView');
const CoachProfileView = require('../models/CoachProfileView');
const Follow = require('../models/Follow');
const BlockedUser = require('../models/BlockedUser');
const Notification = require('../models/Notification');
const { notifyUser } = require('../utils/notifications');
const PortalWatchlist = require('../models/PortalWatchlist');
const { authMiddleware, requireRole, validateUUID } = require('../middleware/auth');
const { validationResult } = require('express-validator');
const { validatePlayerProfile, validateCoachProfile, validateOtherProfile, validatePlayerProfileUpdate, validateCoachProfileUpdate, validateOtherProfileUpdate, handleValidationErrors } = require('../middleware/validation');
const { getSignedS3Url } = require('../utils/s3');
const { computeFit } = require('../utils/fit-score');
const { compareSearchResults } = require('../utils/search-score');
const { apiLimiter, availabilityLimiter, availabilityDailyLimiter } = require('../middleware/rateLimit');
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

  // Strip email field — never leak to non-owner viewers via search/discover/by-id/by-username.
  // player_profiles and coach_profiles have their own (vestigial) email column populated by
  // earlier registration paths, so removing `u.email` from SELECTs alone wasn't sufficient.
  // Owner-fetch routes use User.findById() and bypass this helper. (Security #32.)
  delete profile.email;

  return profile;
}

// Helper function to add signed URLs to an array of profiles
async function addSignedUrlsToProfiles(profiles) {
  if (!profiles || !Array.isArray(profiles)) return profiles;

  return await Promise.all(profiles.map(profile => addSignedUrlToProfile(profile)));
}

// Helper function to filter profile data for private profiles (security #14).
// Returns the locked-card display set: name + avatar + follower/following
// counts + a `private: true` sentinel. Drops all athletic and recruiting
// metadata (position, height, weight, state, city, graduation_year, team_name,
// player_status, eligibility, position_title, school_name, coach_type,
// subheader, bio, contact info, etc.).
function getPrivateProfileData(profile, profileType) {
  if (!profile) return null;
  const base = {
    user_id: profile.user_id,
    first_name: profile.first_name,
    last_name: profile.last_name,
    followers_count: profile.followers_count,
    following_count: profile.following_count,
    private: true
  };
  if (profileType === 'other') {
    return { ...base, profile_picture_url: profile.profile_picture_url };
  }
  return { ...base, profile_image_url: profile.profile_image_url };
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
            const notif = await Notification.createPortalEntryNotification(coachId, req.userId, playerName, profile.position, profile.team_name);
            if (notif) notifyUser(req.app.get('io'), notif);
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
router.put('/', authMiddleware, async (req, res) => {
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
            const notif = await Notification.createPortalEntryNotification(coachId, req.userId, playerName, profile.position, profile.team_name);
            if (notif) notifyUser(req.app.get('io'), notif);
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
router.post('/coach', authMiddleware, requireRole('coach'), validateCoachProfile, handleValidationErrors, async (req, res) => {
  try {
    const existingProfile = await CoachProfile.findByUserId(req.userId);
    const isCollegeCoach = !!req.body.college_division;

    // Invite-token gate: new College Coach signups require a valid invite.
    // Existing (legacy/seeded) profiles and HS coaches are unaffected.
    let inviteIdToConsume = null;
    if (!existingProfile && isCollegeCoach) {
      const inviteToken = req.body.inviteToken;
      if (!inviteToken) {
        return res.status(403).json({
          error: 'College coach signup is invite-only. Request access first.'
        });
      }
      const pool = require('../config/database');
      const inviteResult = await pool.query(
        `SELECT id, school, division, is_free FROM coach_invites
         WHERE token = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()
         FOR UPDATE`,
        [inviteToken]
      );
      if (!inviteResult.rows[0]) {
        return res.status(403).json({ error: 'Invalid or expired invite' });
      }
      // SECURITY: override school + division from verified invite regardless of what frontend sent
      req.body.team_name = inviteResult.rows[0].school;
      if (inviteResult.rows[0].division) {
        req.body.college_division = inviteResult.rows[0].division;
      }
      inviteIdToConsume = inviteResult.rows[0].id;
      // Comp-access flag: read from DB row, NEVER from req.body. The
      // create-profile fork uses this to decide whether to mark the user
      // active without Stripe.
      req._inviteIsFree = !!inviteResult.rows[0].is_free;
    }

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

    // FREE comp-access invites: mark the user subscription_status='comp' so the
    // paywall + AI gates pass without a Stripe payment. The decision comes from
    // the DB-stored invite row (req._inviteIsFree was set above from the
    // FOR-UPDATE select), so DevTools can't fake it. No Stripe customer is
    // created — stripe_customer_id stays NULL.
    if (req._inviteIsFree) {
      await User.updateSubscription(req.userId, {
        status: 'comp',
        tier: 'starter',
        source: 'comp'
      });
    }

    // Mark the invite consumed only after a successful profile creation
    if (inviteIdToConsume) {
      const pool = require('../config/database');
      await pool.query('UPDATE coach_invites SET used_at = NOW() WHERE id = $1', [inviteIdToConsume]);
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
router.post('/other', authMiddleware, requireRole('other'), validateOtherProfile, handleValidationErrors, async (req, res) => {
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

// Get AI Match fit for a player, from the requesting coach's program (Plan 7).
// Coach-only: powers the recruiting-profile banner + "what this player matches you on" modal.
router.get('/fit/:playerUserId', authMiddleware, validateUUID('playerUserId'), requireRole('coach'), async (req, res) => {
  try {
    const coach = await CoachProfile.findByUserId(req.userId);
    if (!coach) {
      return res.status(404).json({ error: 'Coach profile not found' });
    }
    const player = await PlayerProfile.findByUserId(req.params.playerUserId);
    if (!player) {
      return res.status(404).json({ error: 'Player profile not found' });
    }
    res.json({ fit: computeFit(player, coach) });
  } catch (error) {
    logger.error('Get fit error:', error);
    res.status(500).json({ error: 'Failed to compute fit' });
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

// Search Players (security #34: clamped pagination, default 50, max 100)
router.get('/search/players', authMiddleware, async (req, res) => {
  try {
    const filters = {
      position: req.query.position,
      graduation_year: req.query.graduation_year,
      state: req.query.state,
      searchTerm: req.query.q,
      excludeBlockedFor: req.userId
    };
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const result = await PlayerProfile.search(filters, limit, offset);
    result.players = await addSignedUrlsToProfiles(result.players);
    res.json({ players: result.players, hasMore: result.hasMore });
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
      excludeUserId: req.userId, // Exclude current user's profile
      excludeBlockedFor: req.userId
    };
    const limit = Math.min(parseInt(req.query.limit) || 9, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const result = await PlayerProfile.searchHSPlayers(filters, limit, offset);
    // AI Match fit (Plan 7): attach when the viewer is a college coach.
    const viewerCoach = await CoachProfile.findByUserId(req.userId);
    if (viewerCoach) {
      result.players.forEach(p => { p.fit = computeFit(p, viewerCoach); });
    }
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
      excludeUserId: req.userId, // Exclude current user's profile
      excludeBlockedFor: req.userId
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
      excludeUserId: req.userId, // Exclude current user's profile
      excludeBlockedFor: req.userId
    };
    const limit = Math.min(parseInt(req.query.limit) || 9, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const result = await PlayerProfile.searchTransferPlayers(filters, limit, offset);
    // AI Match fit (Plan 7): attach when the viewer is a college coach.
    const viewerCoach = await CoachProfile.findByUserId(req.userId);
    if (viewerCoach) {
      result.players.forEach(p => { p.fit = computeFit(p, viewerCoach); });
    }
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
      excludeUserId: req.userId, // Exclude current user's profile
      excludeBlockedFor: req.userId
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

// Search Coaches (security #34: clamped pagination, default 50, max 100)
router.get('/search/coaches', authMiddleware, async (req, res) => {
  try {
    const filters = {
      college_division: req.query.college_division,
      state: req.query.state,
      searchTerm: req.query.q,
      excludeBlockedFor: req.userId
    };
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const result = await CoachProfile.search(filters, limit, offset);
    result.coaches = await addSignedUrlsToProfiles(result.coaches);
    res.json({ coaches: result.coaches, hasMore: result.hasMore });
  } catch (error) {
    logger.error('Search coaches error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Universal search across players, coaches, and other profiles.
// Security #34: each source capped at `limit` (default 50, max 100); combined
// fan-out is sliced to `limit` total so worst-case payload is 100 rows, not 150.
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const searchTerm = req.query.q;

    if (!searchTerm) {
      return res.json({ results: [], hasMore: false });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    // Each source pulls up to (limit+offset) rows from offset 0 so the combined
    // array has enough material to slice for the requested offset. Per-source
    // hard cap at 100 still applies via the model-layer clamp. The combined
    // offset is applied AFTER concatenation so pagination stays consistent
    // even when one source has fewer rows than another.
    const fanOut = Math.min(limit + offset, 100);
    const [playerRes, coachRes, otherRes] = await Promise.all([
      PlayerProfile.search({ searchTerm, excludeBlockedFor: req.userId }, fanOut, 0),
      CoachProfile.search({ searchTerm, excludeBlockedFor: req.userId }, fanOut, 0),
      OtherProfile.search({ searchTerm, excludeBlockedFor: req.userId }, fanOut, 0)
    ]);

    [playerRes.players, coachRes.coaches, otherRes.others] = await Promise.all([
      addSignedUrlsToProfiles(playerRes.players),
      addSignedUrlsToProfiles(coachRes.coaches),
      addSignedUrlsToProfiles(otherRes.others)
    ]);

    // Re-sort across the three sources by relevance — without this, all
    // players rank above all coaches/others regardless of match quality.
    const combined = [
      ...playerRes.players.map(p => ({ ...p, role: 'player' })),
      ...coachRes.coaches.map(c => ({ ...c, role: 'coach' })),
      ...otherRes.others.map(o => ({ ...o, role: 'other' }))
    ].sort(compareSearchResults);

    const results = combined.slice(offset, offset + limit);
    const hasMore = combined.length > offset + limit
      || playerRes.hasMore || coachRes.hasMore || otherRes.hasMore;

    res.json({ results, hasMore });
  } catch (error) {
    logger.error('Universal search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Check username availability
router.get('/check-username/:username', availabilityLimiter, availabilityDailyLimiter, async (req, res) => {
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
router.get('/check-email/:email', availabilityLimiter, availabilityDailyLimiter, async (req, res) => {
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

// Get profile by user ID (generic — determines type automatically)
router.get('/by-id/:userId', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const { userId } = req.params;

    let profile = null;
    let profileType = null;

    profile = await PlayerProfile.findByUserId(userId);
    if (profile) {
      profileType = 'player';
    }

    if (!profile) {
      profile = await CoachProfile.findByUserId(userId);
      if (profile) {
        profileType = 'coach';
      }
    }

    if (!profile) {
      profile = await OtherProfile.findByUserId(userId);
      if (profile) {
        profileType = 'other';
      }
    }

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Attach username from users table (findByUserId doesn't join users)
    const user = await User.findById(userId);
    if (user && user.username) {
      profile.username = user.username;
    }

    const viewAccess = await canViewFullProfile(req.userId, profile.user_id);
    profile = await addSignedUrlToProfile(profile);

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
    logger.error('Get profile by user ID error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
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

    // Apple Guideline 1.2: if either party blocked the other, return 404
    // (don't reveal that a block exists — matches Twitter/Instagram pattern).
    if (await BlockedUser.isBlocked(req.userId, profile.user_id)) {
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
    // Security #18: anti-Sybil gate. Only viewers with a completed profile
    // can record views. Spam accounts that just registered get a silent
    // no-op response, raising the cost of multi-account view inflation.
    if (!req.user || !req.user.profile_completed) {
      return res.json({ success: true, recorded: false, isNewView: false });
    }

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
    // Security #18: anti-Sybil gate. Same rationale as /view/:userId.
    if (!req.user || !req.user.profile_completed) {
      return res.json({ success: true, recorded: false });
    }

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

// Get list of viewers for a player's profile (paginated)
router.get('/viewers/:userId', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const playerId = req.params.userId;

    // Only allow the profile owner to see their viewers
    if (req.userId !== playerId) {
      return res.status(403).json({ error: 'Not authorized to view this information' });
    }

    // Clamp: default 50, min 1, max 100. Outer Math.max prevents negative limits
    // from reaching Postgres (which would 500 with a syntax error).
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const { viewers: rawViewers, hasMore } = await ProfileView.getViewers(playerId, limit, offset);
    // Add signed URLs to viewer profile images
    const viewers = await addSignedUrlsToProfiles(rawViewers);

    res.json({ viewers, hasMore });
  } catch (error) {
    logger.error('Get viewers error:', error);
    res.status(500).json({ error: 'Failed to get viewers' });
  }
});

// Get suggested connections from materialized view (refreshed every 15 min — security #33)
router.get('/suggested-connections', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 5, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const currentUserId = req.userId;

    const pool = require('../config/database');

    const result = await pool.query(`
      WITH viewer_state AS (
        SELECT COALESCE(pp2.state, cp2.state, '') AS state
        FROM users u2
        LEFT JOIN player_profiles pp2 ON u2.id = pp2.user_id
        LEFT JOIN coach_profiles  cp2 ON u2.id = cp2.user_id
        WHERE u2.id = $1
      ),
      mutuals AS (
        SELECT f2.following_id AS user_id, COUNT(*) AS mutual_count
        FROM follows f1
        JOIN follows f2 ON f1.following_id = f2.follower_id
        WHERE f1.follower_id = $1
          AND f2.following_id != $1
        GROUP BY f2.following_id
      )
      SELECT
        mv.user_id, mv.role, mv.first_name, mv.last_name, mv.username,
        mv.profile_image_url, mv.player_position, mv.team_name, mv.state,
        mv.player_height, mv.player_weight, mv.graduation_year,
        mv.college_division, mv.eligibility, mv.transfer,
        mv.coach_position_title, mv.other_subheader, mv.profile_type
      FROM suggested_connections_mv mv
      CROSS JOIN viewer_state vs
      LEFT JOIN mutuals m ON m.user_id = mv.user_id
      WHERE mv.user_id != $1
        AND NOT EXISTS (
          SELECT 1 FROM follows f
          WHERE f.follower_id = $1 AND f.following_id = mv.user_id
        )
        -- Apple Guideline 1.2: hide blocked users from suggested connections
        AND mv.user_id NOT IN (
          SELECT blocked_id FROM blocked_users WHERE blocker_id = $1
          UNION
          SELECT blocker_id FROM blocked_users WHERE blocked_id = $1
        )
      ORDER BY (
        mv.base_popularity_score
        + CASE WHEN mv.state = vs.state AND mv.state != '' THEN 10.0 ELSE 0 END
        + COALESCE(m.mutual_count, 0) * 5.0
        + mv.random_seed * 2.0
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
