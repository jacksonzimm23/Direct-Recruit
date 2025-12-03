const express = require('express');
const router = express.Router();
const PlayerProfile = require('../models/PlayerProfile');
const CoachProfile = require('../models/CoachProfile');
const User = require('../models/User');
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

module.exports = router;
