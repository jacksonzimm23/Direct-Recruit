const express = require('express');
const router = express.Router();
const PlayerProfile = require('../models/PlayerProfile');
const CoachProfile = require('../models/CoachProfile');
const User = require('../models/User');
const ProfileView = require('../models/ProfileView');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { validatePlayerProfile, validateCoachProfile, handleValidationErrors } = require('../middleware/validation');

// Create/Update Player Profile
router.post('/player', authMiddleware, requireRole('player'), validatePlayerProfile, handleValidationErrors, async (req, res) => {
  try {
    const existingProfile = await PlayerProfile.findByUserId(req.userId);

    let profile;
    if (existingProfile) {
      profile = await PlayerProfile.update(req.userId, req.body);
    } else {
      profile = await PlayerProfile.create(req.userId, req.body);
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
    } else {
      return res.status(400).json({ error: 'Invalid user role' });
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
    } else {
      profile = await CoachProfile.create(req.userId, req.body);
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

// Get Player Profile
router.get('/player/:userId', authMiddleware, async (req, res) => {
  try {
    const profile = await PlayerProfile.findByUserId(req.params.userId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    // Profile already contains username from player_profiles table (SELECT *)
    res.json({ profile });
  } catch (error) {
    console.error('Get player profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Get Coach Profile
router.get('/coach/:userId', authMiddleware, async (req, res) => {
  try {
    const profile = await CoachProfile.findByUserId(req.params.userId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    // Profile already contains username from coach_profiles table (SELECT *)
    res.json({ profile });
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
    const players = await PlayerProfile.search(filters);
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
    res.json({ players: result.players, hasMore: result.hasMore });
  } catch (error) {
    console.error('Discover transfer players error:', error);
    res.status(500).json({ error: 'Failed to fetch transfer players' });
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
    const coaches = await CoachProfile.search(filters);
    res.json({ coaches });
  } catch (error) {
    console.error('Search coaches error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Universal search (both players and coaches)
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const searchTerm = req.query.q;
    console.log('Search request received for term:', searchTerm);

    if (!searchTerm) {
      return res.json({ players: [], coaches: [] });
    }

    const [players, coaches] = await Promise.all([
      PlayerProfile.search({ searchTerm }),
      CoachProfile.search({ searchTerm })
    ]);

    console.log(`Search results: ${players.length} players, ${coaches.length} coaches`);
    console.log('Players:', players.map(p => ({ username: p.username, name: `${p.first_name} ${p.last_name}` })));
    console.log('Coaches:', coaches.map(c => ({ username: c.username, name: `${c.first_name} ${c.last_name}` })));

    res.json({ players, coaches });
  } catch (error) {
    console.error('Universal search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Check username availability
router.get('/check-username/:username', async (req, res) => {
  try {
    const { username } = req.params;

    // Check in both player and coach profiles
    const [playerProfile, coachProfile] = await Promise.all([
      PlayerProfile.findByUsername(username),
      CoachProfile.findByUsername(username)
    ]);

    const isAvailable = !playerProfile && !coachProfile;

    res.json({
      available: isAvailable,
      username: username
    });
  } catch (error) {
    console.error('Check username error:', error);
    res.status(500).json({ error: 'Failed to check username' });
  }
});

// Get profile by username
router.get('/username/:username', authMiddleware, async (req, res) => {
  try {
    const { username } = req.params;

    let profile = await PlayerProfile.findByUsername(username);
    if (profile) {
      return res.json({ profile, type: 'player' });
    }

    profile = await CoachProfile.findByUsername(username);
    if (profile) {
      return res.json({ profile, type: 'coach' });
    }

    res.status(404).json({ error: 'Profile not found' });
  } catch (error) {
    console.error('Get profile by username error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Record a profile view (for HS players only)
router.post('/view/:userId', authMiddleware, async (req, res) => {
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

// Get profile view count for a player
router.get('/views/:userId', authMiddleware, async (req, res) => {
  try {
    const playerId = req.params.userId;
    const viewCount = await ProfileView.getViewCount(playerId);

    res.json({ viewCount });
  } catch (error) {
    console.error('Get view count error:', error);
    res.status(500).json({ error: 'Failed to get view count' });
  }
});

// Get list of viewers for a player's profile
router.get('/viewers/:userId', authMiddleware, async (req, res) => {
  try {
    const playerId = req.params.userId;

    // Only allow the profile owner to see their viewers
    if (req.userId !== playerId) {
      return res.status(403).json({ error: 'Not authorized to view this information' });
    }

    const viewers = await ProfileView.getViewers(playerId);

    res.json({ viewers });
  } catch (error) {
    console.error('Get viewers error:', error);
    res.status(500).json({ error: 'Failed to get viewers' });
  }
});

module.exports = router;
