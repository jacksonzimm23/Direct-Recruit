const express = require('express');
const router = express.Router();
const User = require('../models/User');
const PlayerProfile = require('../models/PlayerProfile');
const CoachProfile = require('../models/CoachProfile');
const { generateToken } = require('../utils/jwt');
const { validateRegistration, validatePlayerProfile, validateCoachProfile, handleValidationErrors } = require('../middleware/validation');
const { authMiddleware } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const { getSignedS3Url } = require('../utils/s3');

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

// Register new user
router.post('/register', authLimiter, validateRegistration, handleValidationErrors, async (req, res) => {
  try {
    const { email, password, role } = req.body;

    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const user = await User.create({ email, password, role });
    const token = generateToken(user.id, user.role);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findByEmail(email);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await User.verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await User.updateLastLogin(user.id);
    const token = generateToken(user.id, user.role);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        profile_completed: user.profile_completed
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user info
router.get('/me', authMiddleware, async (req, res) => {
  try {
    let profile = null;
    let isCollegeCoach = false;
    let isTransferPlayer = false;

    if (req.user.role === 'player') {
      profile = await PlayerProfile.findByUserId(req.userId);
      // Check if player is in transfer portal (transfer = 'y')
      isTransferPlayer = profile && profile.transfer === 'y';
    } else if (req.user.role === 'coach') {
      profile = await CoachProfile.findByUserId(req.userId);
      // A coach is considered a college coach if they have a college_division
      // High school coaches won't have a division (FBS, FCS, D2, D3, NAIA, JUCO)
      isCollegeCoach = profile && profile.college_division && profile.college_division.trim() !== '' ? true : false;
    }

    // Convert S3 key to signed URL for profile image
    profile = await addSignedUrlToProfile(profile);

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
        profile_completed: req.user.profile_completed,
        email_verified: req.user.email_verified,
        is_college_coach: isCollegeCoach,
        is_transfer_player: isTransferPlayer
      },
      profile
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
});

module.exports = router;
